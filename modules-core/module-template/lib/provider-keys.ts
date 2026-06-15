/**
 * Module Template - AI provider credential resolution
 *
 * Resolves the API key (or base URL) and model for any of the 10 providers in
 * `@/lib/ai-providers`. Resolution order, per provider:
 *   1. The user's saved value in `module_settings` (moduleId 'integrations'),
 *      decrypted on the fly if it's a stored secret.
 *   2. The matching `process.env` value (env vars take precedence in spirit,
 *      but a UI-saved value is honored when no env var is set).
 *
 * This mirrors the self-contained pattern used by the chat/agents/fitness
 * modules, but drives everything off the canonical `AI_PROVIDERS` registry so
 * adding a provider there is automatically picked up here.
 */
import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { INTEGRATIONS_MODULE_ID } from '@/lib/constants'
import { AI_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'

function providerById(providerId: AiProviderId) {
  const provider = AI_PROVIDERS.find((p) => p.id === providerId)
  if (!provider) throw new Error(`Unknown AI provider: ${providerId}`)
  return provider
}

/** Read the integrations settings blob for a user once (or {} if none). */
async function readIntegrationsSettings(userId: string): Promise<Record<string, unknown>> {
  const rows = await withAdminDb((db) =>
    db
      .select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(and(eq(moduleSettings.userId, userId), eq(moduleSettings.moduleId, INTEGRATIONS_MODULE_ID)))
      .limit(1)
  )
  return (rows[0]?.settings ?? {}) as Record<string, unknown>
}

/** Saved value (decrypted) → env fallback → null. */
function resolve(saved: Record<string, unknown>, envKey: string): string | null {
  const raw = saved[envKey]
  if (typeof raw === 'string' && raw.length > 0) {
    return isEncrypted(raw) ? decrypt(raw) : raw
  }
  const envVal = process.env[envKey]
  return envVal && envVal.length > 0 ? envVal : null
}

export interface ProviderCredentials {
  /** API key, or for Ollama (no secret) the base URL standing in for one. Null when unset. */
  apiKey: string | null
  /** Configured model, falling back to the provider's registry default. */
  model: string
}

/**
 * Resolve both the API key and model for a provider in a single settings read.
 * Combined so callers don't pay two DB round-trips for the same blob.
 */
export async function getProviderCredentials(userId: string, providerId: AiProviderId): Promise<ProviderCredentials> {
  const provider = providerById(providerId)
  const saved = await readIntegrationsSettings(userId)
  return {
    apiKey: resolve(saved, provider.primaryEnvKey),
    model: resolve(saved, provider.modelEnvKey) ?? provider.modelPlaceholder,
  }
}
