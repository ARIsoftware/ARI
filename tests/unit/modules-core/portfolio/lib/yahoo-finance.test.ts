import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * The module keeps a module-level cache, so every test re-imports a fresh
 * copy via vi.resetModules() + dynamic import.
 */

type GetQuotes = typeof import('@/modules-core/portfolio/lib/yahoo-finance').getQuotes

function chartResponse(meta: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ chart: { result: [{ meta }] } }),
  }
}

function okMeta(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'AAPL',
    regularMarketPrice: 110,
    chartPreviousClose: 100,
    currency: 'USD',
    fullExchangeName: 'NasdaqGS',
    marketState: 'REGULAR',
    ...overrides,
  }
}

describe('getQuotes', () => {
  let getQuotes: GetQuotes
  const fetchMock = vi.fn()

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ;({ getQuotes } = await import('@/modules-core/portfolio/lib/yahoo-finance'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns an empty array for no symbols without fetching', async () => {
    expect(await getQuotes([])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('parses a successful quote and computes change fields', async () => {
    fetchMock.mockResolvedValueOnce(chartResponse(okMeta()))
    const [quote] = await getQuotes(['AAPL'])
    expect(quote).toMatchObject({
      symbol: 'AAPL',
      price: 110,
      prev_close: 100,
      change: 10,
      currency: 'USD',
      exchange: 'NasdaqGS',
      market_state: 'REGULAR',
      cached: false,
    })
    expect(quote.change_percent).toBeCloseTo(10)
    expect(quote.error).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain(
      'https://query1.finance.yahoo.com/v8/finance/chart/AAPL',
    )
  })

  it('falls back to previousClose, then to null previous close', async () => {
    fetchMock.mockResolvedValueOnce(
      chartResponse(okMeta({ chartPreviousClose: undefined, previousClose: 90 })),
    )
    const [withFallback] = await getQuotes(['AAPL'])
    expect(withFallback.prev_close).toBe(90)
    expect(withFallback.change).toBe(20)

    fetchMock.mockResolvedValueOnce(
      chartResponse(okMeta({ symbol: 'MSFT', chartPreviousClose: undefined })),
    )
    const [withoutPrev] = await getQuotes(['MSFT'])
    expect(withoutPrev.prev_close).toBeNull()
    expect(withoutPrev.change).toBeNull()
    expect(withoutPrev.change_percent).toBeNull()
  })

  it('returns change but no percent when previous close is zero', async () => {
    fetchMock.mockResolvedValueOnce(chartResponse(okMeta({ chartPreviousClose: 0 })))
    const [quote] = await getQuotes(['AAPL'])
    expect(quote.change).toBe(110)
    expect(quote.change_percent).toBeNull()
  })

  it('fills fallback identity fields when meta is sparse', async () => {
    fetchMock.mockResolvedValueOnce(chartResponse({ regularMarketPrice: 5, exchangeName: 'NYSE' }))
    const [quote] = await getQuotes(['SPARSE'])
    expect(quote.symbol).toBe('SPARSE')
    expect(quote.currency).toBeNull()
    expect(quote.exchange).toBe('NYSE')
    expect(quote.market_state).toBeNull()

    fetchMock.mockResolvedValueOnce(chartResponse({ regularMarketPrice: 5 }))
    const [bare] = await getQuotes(['BARE'])
    expect(bare.exchange).toBeNull()
  })

  it('maps a non-OK upstream response to a fixed error message', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
    const [quote] = await getQuotes(['AAPL'])
    expect(quote.error).toBe('Quote temporarily unavailable')
    expect(quote.price).toBeNull()
  })

  it('maps a Yahoo chart error to "Symbol not found" without leaking the description', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        chart: { result: null, error: { code: 'Not Found', description: 'internal detail' } },
      }),
    })
    const [quote] = await getQuotes(['ZZZZ'])
    expect(quote.error).toBe('Symbol not found')

    // Missing meta / missing error fields take the same path.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ chart: { result: [{}], error: {} } }),
    })
    const [noMeta] = await getQuotes(['YYYY'])
    expect(noMeta.error).toBe('Symbol not found')

    // Missing meta without any chart error object at all.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ chart: { result: [{}] } }),
    })
    const [noError] = await getQuotes(['XXXX'])
    expect(noError.error).toBe('Symbol not found')
  })

  it('aborts a hung request after the fetch timeout', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            )
          }),
      )
      const promise = getQuotes(['HUNG'])
      await vi.advanceTimersByTimeAsync(5000)
      const [quote] = await promise
      expect(quote.error).toBe('Request timed out')
    } finally {
      vi.useRealTimers()
    }
  })

  it('maps an aborted request to "Request timed out"', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const [quote] = await getQuotes(['AAPL'])
    expect(quote.error).toBe('Request timed out')
  })

  it('maps network failures (including non-Error throws) to a fixed message', async () => {
    fetchMock.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND proxy.internal'))
    const [quote] = await getQuotes(['AAPL'])
    expect(quote.error).toBe('Quote temporarily unavailable')

    fetchMock.mockRejectedValueOnce('string failure')
    const [other] = await getQuotes(['MSFT'])
    expect(other.error).toBe('Quote temporarily unavailable')
  })

  it('serves fresh successes from cache', async () => {
    fetchMock.mockResolvedValueOnce(chartResponse(okMeta()))
    const [first] = await getQuotes(['AAPL'])
    expect(first.cached).toBe(false)

    const [second] = await getQuotes(['AAPL'])
    expect(second.cached).toBe(true)
    expect(second.price).toBe(110)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('negatively caches errors so repeated bad symbols do not refetch', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    const [first] = await getQuotes(['BAD'])
    expect(first.error).toBe('Quote temporarily unavailable')

    const [second] = await getQuotes(['BAD'])
    expect(second.cached).toBe(true)
    expect(second.error).toBe('Quote temporarily unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('expires the error cache faster than the success cache', async () => {
    const t0 = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0)

    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await getQuotes(['BAD'])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 31s later the negative cache has lapsed and the symbol refetches.
    nowSpy.mockReturnValue(t0 + 31_000)
    await getQuotes(['BAD'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refetches successes after the 2-minute TTL', async () => {
    const t0 = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0)

    fetchMock.mockResolvedValue(chartResponse(okMeta()))
    await getQuotes(['AAPL'])
    nowSpy.mockReturnValue(t0 + 119_000)
    await getQuotes(['AAPL'])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    nowSpy.mockReturnValue(t0 + 121_000)
    await getQuotes(['AAPL'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('prunes expired entries for symbols not being refetched', async () => {
    const t0 = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0)
    fetchMock.mockImplementation(async (url: string) => {
      const symbol = decodeURIComponent(url.split('/chart/')[1].split('?')[0])
      return chartResponse(okMeta({ symbol }))
    })

    await getQuotes(['AAA', 'BBB'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 3 minutes later both entries are stale; refetching AAA prunes BBB too,
    // so a later BBB request must hit the network again.
    nowSpy.mockReturnValue(t0 + 180_000)
    await getQuotes(['AAA'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await getQuotes(['BBB'])
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('dedupes concurrent in-flight requests for the same symbol', async () => {
    let release!: (value: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))

    const first = getQuotes(['AAPL'])
    const second = getQuotes(['AAPL'])
    release(chartResponse(okMeta()))
    const [[a], [b]] = await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a.price).toBe(110)
    expect(b.price).toBe(110)
  })

  it('evicts oldest entries when the cache exceeds its cap', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const symbol = decodeURIComponent(url.split('/chart/')[1].split('?')[0])
      return chartResponse(okMeta({ symbol }))
    })

    const symbols = Array.from({ length: 2001 }, (_, i) => `S${i}`)
    await getQuotes(symbols)
    expect(fetchMock).toHaveBeenCalledTimes(2001)

    // S0 was evicted (oldest beyond the 2000-entry cap) and refetches;
    // the newest entry is still cached.
    fetchMock.mockClear()
    const [oldest] = await getQuotes(['S0'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(oldest.cached).toBe(false)

    const [newest] = await getQuotes(['S2000'])
    expect(newest.cached).toBe(true)
  })
})
