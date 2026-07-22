/**
 * Tests for morning-brief/lib/provider-keys.ts
 *
 * Mocks: @/lib/db (withAdminDb), @/lib/db/schema (moduleSettings),
 * @/lib/crypto (decrypt, isEncrypted), drizzle-orm operators.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  withAdminDb: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  moduleSettings: { userId: 'userId', moduleId: 'moduleId', settings: 'settings' },
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((v: string) => `decrypted:${v}`),
  isEncrypted: vi.fn((v: unknown) => typeof v === 'string' && (v as string).startsWith('enc:')),
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ eq: true })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}))

import { withAdminDb } from '@/lib/db'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { getProviderCredentials } from '@/modules-core/morning-brief/lib/provider-keys'

const mockWithAdminDb = vi.mocked(withAdminDb)
const mockDecrypt = vi.mocked(decrypt)
const mockIsEncrypted = vi.mocked(isEncrypted)

function setupDb(settings: Record<string, unknown> = {}) {
  mockWithAdminDb.mockImplementationOnce(async (fn: (db: any) => Promise<unknown>) => {
    const rows = settings && Object.keys(settings).length > 0 ? [{ settings }] : []
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => rows,
          }),
        }),
      }),
    }
    return fn(fakeDb)
  })
}

describe('getProviderCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: isEncrypted returns false
    mockIsEncrypted.mockReturnValue(false)
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_MODEL
    delete process.env.OLLAMA_BASE_URL
    delete process.env.OLLAMA_MODEL
    delete process.env.GOOGLE_GEMINI_API_KEY
  })

  it('throws for unknown provider id', async () => {
    // providerById throws before withAdminDb is called, so no setupDb needed
    await expect(getProviderCredentials('user-1', 'unknown-provider' as never)).rejects.toThrow(/Unknown AI provider/)
  })

  it('returns null apiKey when no saved value and no env var', async () => {
    delete process.env.OPENAI_API_KEY
    setupDb({})
    const result = await getProviderCredentials('user-1', 'openai')
    expect(result.apiKey).toBeNull()
  })

  it('returns apiKey from env var fallback', async () => {
    process.env.OPENAI_API_KEY = 'sk-from-env'
    setupDb({})
    const result = await getProviderCredentials('user-1', 'openai')
    expect(result.apiKey).toBe('sk-from-env')
  })

  it('returns apiKey from saved settings', async () => {
    setupDb({ OPENAI_API_KEY: 'sk-from-db' })
    const result = await getProviderCredentials('user-1', 'openai')
    expect(result.apiKey).toBe('sk-from-db')
  })

  it('decrypts encrypted saved value', async () => {
    mockIsEncrypted.mockReturnValue(true)
    mockDecrypt.mockReturnValue('sk-decrypted')
    setupDb({ OPENAI_API_KEY: 'enc:abc123' })
    const result = await getProviderCredentials('user-1', 'openai')
    expect(result.apiKey).toBe('sk-decrypted')
  })

  it('returns model from modelOverride when provided', async () => {
    setupDb({ OPENAI_API_KEY: 'sk-key' })
    const result = await getProviderCredentials('user-1', 'openai', 'gpt-4o-override')
    expect(result.model).toBe('gpt-4o-override')
  })

  it('trims whitespace from modelOverride', async () => {
    setupDb({ OPENAI_API_KEY: 'sk-key' })
    const result = await getProviderCredentials('user-1', 'openai', '  gpt-4o  ')
    expect(result.model).toBe('gpt-4o')
  })

  it('empty-string modelOverride falls back to env model', async () => {
    process.env.OPENAI_MODEL = 'gpt-4-turbo'
    setupDb({})
    const result = await getProviderCredentials('user-1', 'openai', '   ')
    expect(result.model).toBe('gpt-4-turbo')
  })

  it('falls back to registry model placeholder when no override or env', async () => {
    delete process.env.OPENAI_MODEL
    setupDb({})
    const result = await getProviderCredentials('user-1', 'openai')
    expect(result.model).toBe('gpt-5') // registry placeholder
  })

  it('returns model from saved settings when no override', async () => {
    setupDb({ OPENAI_MODEL: 'gpt-4-db' })
    const result = await getProviderCredentials('user-1', 'openai')
    expect(result.model).toBe('gpt-4-db')
  })

  it('works for claude provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-key'
    setupDb({})
    const result = await getProviderCredentials('user-1', 'claude')
    expect(result.apiKey).toBe('sk-ant-key')
    expect(typeof result.model).toBe('string')
    expect(result.model.length).toBeGreaterThan(0)
  })

  it('works for ollama provider (no secret, base URL)', async () => {
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434'
    setupDb({})
    const result = await getProviderCredentials('user-1', 'ollama')
    expect(result.apiKey).toBe('http://localhost:11434')
  })

  it('returns null apiKey for ollama when no env var and no saved', async () => {
    delete process.env.OLLAMA_BASE_URL
    setupDb({})
    const result = await getProviderCredentials('user-1', 'ollama')
    expect(result.apiKey).toBeNull()
  })

  it('null modelOverride is treated the same as not providing one', async () => {
    process.env.OPENAI_API_KEY = 'sk-env'
    process.env.OPENAI_MODEL = 'gpt-4-from-env'
    setupDb({})
    const result = await getProviderCredentials('user-1', 'openai', null)
    expect(result.model).toBe('gpt-4-from-env')
  })
})
