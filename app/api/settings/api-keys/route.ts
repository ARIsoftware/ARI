import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { withAdminDb } from "@/lib/db"
import { moduleSettings } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto"
import { INTEGRATIONS_MODULE_ID } from "@/lib/constants"

const SECRET_KEYS = new Set([
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
])

const MODEL_KEYS = new Set([
  "OPENROUTER_MODEL",
  "ANTHROPIC_MODEL",
  "OPENAI_MODEL",
  "GOOGLE_GEMINI_MODEL",
])

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

async function writeSettings(userId: string, settings: Record<string, unknown>) {
  await withAdminDb(async (db) =>
    db.insert(moduleSettings)
      .values({
        userId,
        moduleId: INTEGRATIONS_MODULE_ID,
        enabled: true,
        settings,
      })
      .onConflictDoUpdate({
        target: [moduleSettings.userId, moduleSettings.moduleId],
        set: {
          settings,
          updatedAt: new Date().toISOString(),
        },
      })
  )
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const reveal = searchParams.get("reveal")

  const saved = await readSettings(user.id)

  // Reveal a specific secret key's decrypted value (model keys aren't secret —
  // their plaintext value is already in the masked field of the status response).
  if (reveal && SECRET_KEYS.has(reveal)) {
    const headers = { "Cache-Control": "no-store", "Pragma": "no-cache" }
    const raw = saved[reveal]
    if (typeof raw === "string") {
      return NextResponse.json({ key: reveal, value: decryptValue(raw) }, { headers })
    }
    const envVal = process.env[reveal]
    if (envVal) {
      return NextResponse.json({ key: reveal, value: envVal }, { headers })
    }
    return NextResponse.json({ key: reveal, value: null }, { headers })
  }

  // Return status for all keys.
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

  const existing = await readSettings(user.id)

  // Handle API key save
  const key = typeof body.key === "string" ? body.key.trim() : ""
  const value = typeof body.value === "string" ? body.value.trim() : ""

  if (!key || !ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 })
  }

  // Empty value = delete the key
  if (!value) {
    const { [key]: _, ...rest } = existing
    await writeSettings(user.id, rest as Record<string, unknown>)
    return NextResponse.json({ success: true, deleted: true })
  }

  // Model values are not secrets — store plaintext so the UI can show them.
  // API keys are encrypted at rest.
  const stored = MODEL_KEYS.has(key) ? value : encrypt(value)
  const merged = { ...existing, [key]: stored }
  await writeSettings(user.id, merged)

  return NextResponse.json({
    success: true,
    masked: MODEL_KEYS.has(key) ? value : maskValue(value),
  })
}
