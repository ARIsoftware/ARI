import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { withAdminDb } from "@/lib/db"
import { moduleSettings } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto"
import { INTEGRATIONS_MODULE_ID } from "@/lib/constants"
import {
  AI_PROVIDER_SECRET_ENV_KEYS,
  AI_PROVIDER_PLAINTEXT_ENV_KEYS,
} from "@/lib/ai-providers"
import {
  settingsApiKeyBodySchema,
  SettingsApiKeyStatusSchema,
  SettingsApiKeySaveResponseSchema,
} from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { DEFAULT_SECURITY, ErrorResponseSchema } from "@/lib/openapi/common"

registry.registerPath({
  method: 'get',
  path: '/api/settings/api-keys',
  operationId: 'getIntegrationKeysStatus',
  summary: 'Get configured-and-masked status for each LLM provider API key + model name',
  description: 'Returns per-key { configured, masked } status only. Secret values are never returned in full — model/plaintext keys return their value in the masked field.',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Per-key configured + masked status', content: { 'application/json': { schema: SettingsApiKeyStatusSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/settings/api-keys',
  operationId: 'updateIntegrationKey',
  summary: 'Save or delete a provider API key (encrypted at rest) or set a model name',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: settingsApiKeyBodySchema } } } },
  responses: {
    200: { description: 'Saved or deleted', content: { 'application/json': { schema: SettingsApiKeySaveResponseSchema } } },
    400: { description: 'Invalid key or JSON body', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

const SECRET_KEYS = new Set([
  ...AI_PROVIDER_SECRET_ENV_KEYS,
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
])

// Plaintext config values — stored unencrypted, returned in `masked` verbatim,
// rendered with a plain text input. Model names and the Ollama base URL all
// fall in this bucket (neither is a secret).
const MODEL_KEYS = new Set(AI_PROVIDER_PLAINTEXT_ENV_KEYS)

const ALLOWED_KEYS = new Set([...SECRET_KEYS, ...MODEL_KEYS])

function maskValue(value: string): string {
  if (value.length <= 6) return "••••••••"
  return value.slice(0, 4) + "••••••••" + value.slice(-4)
}

function decryptValue(raw: string): string {
  if (isEncrypted(raw)) return decrypt(raw)
  return raw
}

async function readSettings(userId: string): Promise<Record<string, unknown>> {
  const rows = await withAdminDb(async (db) =>
    db.select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(
        and(
          eq(moduleSettings.userId, userId),
          eq(moduleSettings.moduleId, INTEGRATIONS_MODULE_ID)
        )
      )
  )
  return (rows[0]?.settings ?? {}) as Record<string, unknown>
}

/**
 * Atomically merge a single key into the integrations settings blob.
 *
 * Uses a SQL-level JSONB merge (`existing || patch`) inside the upsert rather
 * than a read-modify-write in JS. This is what makes concurrent saves safe: the
 * IntegrationsTab fires one POST per dirty field in parallel (e.g. an API key
 * and its model name from a single Save click), and a JS merge would let the
 * last writer overwrite the whole blob and drop the others' keys. The `||`
 * merge lets each write land independently.
 */
async function upsertKey(userId: string, key: string, storedValue: string) {
  const patch = JSON.stringify({ [key]: storedValue })
  await withAdminDb(async (db) =>
    db.insert(moduleSettings)
      .values({
        userId,
        moduleId: INTEGRATIONS_MODULE_ID,
        enabled: true,
        settings: { [key]: storedValue },
      })
      .onConflictDoUpdate({
        target: [moduleSettings.userId, moduleSettings.moduleId],
        set: {
          settings: sql`COALESCE(${moduleSettings.settings}, '{}'::jsonb) || ${patch}::jsonb`,
          updatedAt: new Date().toISOString(),
        },
      })
  )
}

/**
 * Atomically remove a single key (JSONB `-`). Same race-safety rationale as
 * upsertKey. A missing row is a no-op — there is nothing to delete.
 */
async function deleteKey(userId: string, key: string) {
  await withAdminDb(async (db) =>
    db.update(moduleSettings)
      .set({
        settings: sql`COALESCE(${moduleSettings.settings}, '{}'::jsonb) - ${key}::text`,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(moduleSettings.userId, userId),
          eq(moduleSettings.moduleId, INTEGRATIONS_MODULE_ID)
        )
      )
  )
}

export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const saved = await readSettings(user.id)

  // Status only — secret values are never returned in full. (There is
  // deliberately no reveal endpoint: the UI shows the masked value and nothing
  // more, so a stored or env-configured secret can't be read back out.)
  // Secret keys: { configured, masked: "abcd••••wxyz" }
  // Model keys:  { configured, masked: "claude-sonnet-4-5" } — plaintext, not a secret.
  const result: Record<string, { configured: boolean; masked: string | null }> = {}
  for (const key of SECRET_KEYS) {
    const raw = saved[key]
    const envVal = process.env[key]
    if (typeof raw === "string") {
      result[key] = { configured: true, masked: maskValue(decryptValue(raw)) }
    } else if (envVal) {
      result[key] = { configured: true, masked: maskValue(envVal) }
    } else {
      result[key] = { configured: false, masked: null }
    }
  }
  for (const key of MODEL_KEYS) {
    const raw = saved[key]
    const envVal = process.env[key]
    const value = typeof raw === "string" ? raw : (envVal ?? null)
    result[key] = value
      ? { configured: true, masked: value }
      : { configured: false, masked: null }
  }

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const key = typeof body.key === "string" ? body.key.trim() : ""
  const value = typeof body.value === "string" ? body.value.trim() : ""

  if (!key || !ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 })
  }

  // Empty value = delete the key (atomic JSONB minus).
  if (!value) {
    await deleteKey(user.id, key)
    return NextResponse.json({ success: true, deleted: true })
  }

  // Model/plaintext values are stored verbatim so the UI can echo them back;
  // secrets are encrypted at rest. The write is an atomic JSONB merge, so two
  // parallel POSTs (e.g. key + model) from one Save can't drop each other.
  const stored = MODEL_KEYS.has(key) ? value : encrypt(value)
  await upsertKey(user.id, key, stored)

  return NextResponse.json({
    success: true,
    masked: MODEL_KEYS.has(key) ? value : maskValue(value),
  })
}
