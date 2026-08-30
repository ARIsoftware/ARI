/**
 * Full coverage for lib/api-logging.ts — the withApiLogging wrapper that closes
 * the core-route gap in API-key usage logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const afterHolder = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
  throwOnCall: false,
}))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    if (afterHolder.throwOnCall) throw new Error('after() called outside a request scope')
    afterHolder.callbacks.push(cb)
  },
  NextRequest: class {},
}))

const authHolder = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))
vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(async () => authHolder.result),
}))

const keysHolder = vi.hoisted(() => ({
  lookupResult: null as { id: string; userId: string } | null,
  recorded: [] as Array<Record<string, unknown>>,
  recordThrows: false,
}))
vi.mock('@/lib/api-keys', () => ({
  hashApiKey: (raw: string) => `hash:${raw}`,
  lookupApiKey: vi.fn(async () => keysHolder.lookupResult),
  recordApiKeyUsage: vi.fn(async (params: Record<string, unknown>) => {
    if (keysHolder.recordThrows) throw new Error('insert failed')
    keysHolder.recorded.push(params)
  }),
}))

const retentionHolder = vi.hoisted(() => ({ prune: false, pruned: [] as string[] }))
vi.mock('@/lib/api-log-retention', () => ({
  shouldPrune: () => retentionHolder.prune,
  pruneUsageLogs: vi.fn(async (userId: string) => {
    retentionHolder.pruned.push(userId)
    return 0
  }),
}))

import { withApiLogging } from '@/lib/api-logging'

/** Minimal stand-in for NextRequest — the wrapper only reads these. */
function makeRequest(opts: {
  apiKey?: string
  path?: string
  method?: string
  forwardedFor?: string
  realIp?: string
  userAgent?: string
} = {}): any {
  const h = new Headers()
  if (opts.apiKey) h.set('x-api-key', opts.apiKey)
  if (opts.forwardedFor) h.set('x-forwarded-for', opts.forwardedFor)
  if (opts.realIp) h.set('x-real-ip', opts.realIp)
  if (opts.userAgent) h.set('user-agent', opts.userAgent)
  return {
    headers: h,
    method: opts.method ?? 'GET',
    nextUrl: { pathname: opts.path ?? '/api/health' },
  }
}

/** Run every callback after() captured. */
async function flushAfter() {
  const cbs = afterHolder.callbacks.splice(0)
  for (const cb of cbs) await cb()
}

const ok = (status = 200) => new Response('{}', { status })

beforeEach(() => {
  afterHolder.callbacks = []
  afterHolder.throwOnCall = false
  authHolder.result = {}
  keysHolder.lookupResult = null
  keysHolder.recorded = []
  keysHolder.recordThrows = false
  retentionHolder.prune = false
  retentionHolder.pruned = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('withApiLogging — pass-through', () => {
  it('returns the handler response untouched', async () => {
    const response = ok(201)
    const wrapped = withApiLogging(async () => response)
    expect(await wrapped(makeRequest(), undefined)).toBe(response)
  })

  it('forwards the route context to the handler', async () => {
    const handler = vi.fn(async () => ok())
    const ctx = { params: Promise.resolve({ id: '1' }) }
    const req = makeRequest()

    await withApiLogging(handler)(req, ctx)

    expect(handler).toHaveBeenCalledWith(req, ctx)
  })
})

describe('withApiLogging — scope', () => {
  it('logs nothing for a session request with no key header', async () => {
    await withApiLogging(async () => ok())(makeRequest(), undefined)
    expect(afterHolder.callbacks).toHaveLength(0)
    await flushAfter()
    expect(keysHolder.recorded).toHaveLength(0)
  })

  it('logs nothing when a key header is present but the key is unknown', async () => {
    authHolder.result = { user: { id: 'u1' } } // session auth, no apiKey field
    keysHolder.lookupResult = null

    await withApiLogging(async () => ok())(makeRequest({ apiKey: 'ari_k_bogus' }), undefined)
    await flushAfter()

    expect(keysHolder.recorded).toHaveLength(0)
  })
})

describe('withApiLogging — recording', () => {
  it('records endpoint, method and real status from the auth result', async () => {
    authHolder.result = {
      user: { id: 'u1' },
      apiKey: { id: 'k1', userId: 'u1', ipAddress: '::1', userAgent: 'curl/8' },
    }

    const wrapped = withApiLogging(async () => ok(404))
    await wrapped(makeRequest({ apiKey: 'ari_k_x', path: '/api/users/me', method: 'DELETE' }), undefined)
    await flushAfter()

    expect(keysHolder.recorded[0]).toEqual({
      apiKeyId: 'k1',
      userId: 'u1',
      endpoint: '/api/users/me',
      method: 'DELETE',
      statusCode: 404,
      ipAddress: '::1',
      userAgent: 'curl/8',
    })
  })

  it('attributes a rejected request via key lookup so owners see probes', async () => {
    authHolder.result = {} // auth failed entirely
    keysHolder.lookupResult = { id: 'k9', userId: 'u9' }

    const wrapped = withApiLogging(async () => ok(401))
    await wrapped(
      makeRequest({ apiKey: 'ari_k_y', forwardedFor: '9.9.9.9, 10.0.0.1', userAgent: 'probe' }),
      undefined
    )
    await flushAfter()

    expect(keysHolder.recorded[0]).toMatchObject({
      apiKeyId: 'k9',
      userId: 'u9',
      statusCode: 401,
      ipAddress: '9.9.9.9',
      userAgent: 'probe',
    })
  })

  it('falls back to x-real-ip, then to null', async () => {
    authHolder.result = {}
    keysHolder.lookupResult = { id: 'k1', userId: 'u1' }

    await withApiLogging(async () => ok())(
      makeRequest({ apiKey: 'k', realIp: '5.5.5.5' }),
      undefined
    )
    await flushAfter()
    expect(keysHolder.recorded[0].ipAddress).toBe('5.5.5.5')

    keysHolder.recorded = []
    await withApiLogging(async () => ok())(makeRequest({ apiKey: 'k' }), undefined)
    await flushAfter()
    expect(keysHolder.recorded[0].ipAddress).toBeNull()
    expect(keysHolder.recorded[0].userAgent).toBeNull()
  })

  it('records a 500 and rethrows when the handler throws', async () => {
    authHolder.result = {
      user: { id: 'u1' },
      apiKey: { id: 'k1', userId: 'u1', ipAddress: null, userAgent: null },
    }

    const wrapped = withApiLogging(async () => {
      throw new Error('handler blew up')
    })

    await expect(wrapped(makeRequest({ apiKey: 'k' }), undefined)).rejects.toThrow('handler blew up')
    await flushAfter()

    expect(keysHolder.recorded[0]).toMatchObject({ statusCode: 500 })
  })

  it('does not log a throwing handler when no key was presented', async () => {
    const wrapped = withApiLogging(async () => {
      throw new Error('boom')
    })
    await expect(wrapped(makeRequest(), undefined)).rejects.toThrow('boom')
    expect(afterHolder.callbacks).toHaveLength(0)
  })
})

describe('withApiLogging — retention', () => {
  beforeEach(() => {
    authHolder.result = {
      user: { id: 'u1' },
      apiKey: { id: 'k1', userId: 'u1', ipAddress: null, userAgent: null },
    }
  })

  it('prunes when the sampler fires', async () => {
    retentionHolder.prune = true
    await withApiLogging(async () => ok())(makeRequest({ apiKey: 'k' }), undefined)
    await flushAfter()
    expect(retentionHolder.pruned).toEqual(['u1'])
  })

  it('skips the prune otherwise', async () => {
    retentionHolder.prune = false
    await withApiLogging(async () => ok())(makeRequest({ apiKey: 'k' }), undefined)
    await flushAfter()
    expect(retentionHolder.pruned).toEqual([])
  })
})

describe('withApiLogging — scheduling', () => {
  it('defers the write until after the response', async () => {
    authHolder.result = {
      user: { id: 'u1' },
      apiKey: { id: 'k1', userId: 'u1', ipAddress: null, userAgent: null },
    }

    await withApiLogging(async () => ok())(makeRequest({ apiKey: 'k' }), undefined)

    // Response already returned, nothing written yet.
    expect(keysHolder.recorded).toHaveLength(0)
    await flushAfter()
    expect(keysHolder.recorded).toHaveLength(1)
  })

  it('falls back to fire-and-forget when after() is unavailable', async () => {
    afterHolder.throwOnCall = true
    authHolder.result = {
      user: { id: 'u1' },
      apiKey: { id: 'k1', userId: 'u1', ipAddress: null, userAgent: null },
    }

    await withApiLogging(async () => ok())(makeRequest({ apiKey: 'k' }), undefined)
    await new Promise((r) => setTimeout(r, 0))

    expect(keysHolder.recorded).toHaveLength(1)
  })

  it('swallows a logging failure without affecting the response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    keysHolder.recordThrows = true
    authHolder.result = {
      user: { id: 'u1' },
      apiKey: { id: 'k1', userId: 'u1', ipAddress: null, userAgent: null },
    }

    const response = await withApiLogging(async () => ok())(makeRequest({ apiKey: 'k' }), undefined)
    await flushAfter()

    expect(response.status).toBe(200)
    expect(errorSpy).toHaveBeenCalledWith('API request log failed:', expect.any(Error))
  })
})
