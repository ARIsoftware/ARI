/**
 * Tests for board-of-advisors/lib/provider-keys.ts — credential + model
 * resolution against the shared AI provider registry.
 *
 * Mocks (same pattern as providers.test.ts):
 *  - @/lib/db (withAdminDb)
 *  - @/lib/db/schema (moduleSettings)
 *  - drizzle-orm (eq/and accept the fake column objects)
 *  - @/lib/crypto (decrypt, isEncrypted)
 * @/lib/ai-providers stays real so the tests pin against the actual registry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  withAdminDb: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  moduleSettings: { userId: 'userId', moduleId: 'moduleId', settings: 'settings' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ eq: true })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((v: string) => `decrypted:${v}`),
  isEncrypted: vi.fn((v: unknown) => typeof v === 'string' && v.startsWith('enc:')),
}))

import { withAdminDb } from '@/lib/db'
import { getProviderCredentials } from '@/modules-core/board-of-advisors/lib/provider-keys'
import { AI_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'

const mockWithAdminDb = withAdminDb as unknown as ReturnType<typeof vi.fn>

const claude = AI_PROVIDERS.find((p) => p.id === 'claude')!

// withAdminDb((db) => db.select(...).from(...).where(...).limit(1)) resolves to rows.
function stubSettingsRows(rows: Array<{ settings: Record<string, unknown> }>) {
  const db = {
    select: vi.fn(() => db),
    from: vi.fn(() => db),
    where: vi.fn(() => db),
    limit: vi.fn(() => Promise.resolve(rows)),
  }
  mockWithAdminDb.mockImplementation(async (fn: (d: typeof db) => unknown) => fn(db))
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getProviderCredentials', () => {
  it('returns the saved plaintext key and saved model', () => {
    stubSettingsRows([{ settings: { [claude.primaryEnvKey]: 'sk-plain', [claude.modelEnvKey]: 'claude-fable-5' } }])
    return expect(getProviderCredentials('u1', 'claude')).resolves.toEqual({
      apiKey: 'sk-plain',
      model: 'claude-fable-5',
    })
  })

  it('decrypts a stored encrypted key', async () => {
    stubSettingsRows([{ settings: { [claude.primaryEnvKey]: 'enc:abc' } }])
    const creds = await getProviderCredentials('u1', 'claude')
    expect(creds.apiKey).toBe('decrypted:enc:abc')
  })

  it('falls back to process.env when nothing is saved', async () => {
    stubSettingsRows([])
    vi.stubEnv(claude.primaryEnvKey, 'sk-from-env')
    vi.stubEnv(claude.modelEnvKey, 'model-from-env')
    const creds = await getProviderCredentials('u1', 'claude')
    expect(creds).toEqual({ apiKey: 'sk-from-env', model: 'model-from-env' })
  })

  it('returns a null key and the registry default model when nothing is configured', async () => {
    stubSettingsRows([{ settings: {} }])
    vi.stubEnv(claude.primaryEnvKey, '')
    vi.stubEnv(claude.modelEnvKey, '')
    const creds = await getProviderCredentials('u1', 'claude')
    expect(creds).toEqual({ apiKey: null, model: claude.modelPlaceholder })
  })

  it('ignores non-string saved values', async () => {
    stubSettingsRows([{ settings: { [claude.primaryEnvKey]: 12345 } }])
    vi.stubEnv(claude.primaryEnvKey, '')
    const creds = await getProviderCredentials('u1', 'claude')
    expect(creds.apiKey).toBeNull()
  })

  it('prefers the per-module model override over saved and default models', async () => {
    stubSettingsRows([{ settings: { [claude.modelEnvKey]: 'saved-model' } }])
    const creds = await getProviderCredentials('u1', 'claude', '  override-model  ')
    expect(creds.model).toBe('override-model')
  })

  it('treats a whitespace-only or null override as unset', async () => {
    stubSettingsRows([{ settings: { [claude.modelEnvKey]: 'saved-model' } }])
    expect((await getProviderCredentials('u1', 'claude', '   ')).model).toBe('saved-model')
    expect((await getProviderCredentials('u1', 'claude', null)).model).toBe('saved-model')
  })

  it('throws for a provider id missing from the registry', async () => {
    stubSettingsRows([])
    await expect(
      getProviderCredentials('u1', 'not-a-provider' as AiProviderId),
    ).rejects.toThrow('Unknown AI provider: not-a-provider')
  })

  it('resolves credentials for every registered provider', async () => {
    for (const provider of AI_PROVIDERS) {
      stubSettingsRows([{ settings: { [provider.primaryEnvKey]: `key-${provider.id}` } }])
      vi.stubEnv(provider.modelEnvKey, '')
      const creds = await getProviderCredentials('u1', provider.id)
      expect(creds.apiKey).toBe(`key-${provider.id}`)
      expect(creds.model).toBe(provider.modelPlaceholder)
    }
  })
})
