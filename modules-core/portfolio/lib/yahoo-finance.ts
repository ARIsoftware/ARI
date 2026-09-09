/**
 * Yahoo Finance quote fetcher with in-memory 2-minute cache.
 *
 * Uses the unauthenticated v8 chart endpoint, which returns enough metadata
 * for a current price + previous close without requiring a crumb cookie.
 */

import type { TickerQuote } from '../types'

const CACHE_TTL_MS = 120_000 // 2 minutes
const ERROR_CACHE_TTL_MS = 30_000 // errors cached briefly so bad symbols can't hammer Yahoo
const MAX_CACHE_ENTRIES = 2000
const FETCH_TIMEOUT_MS = 5000

interface CacheEntry {
  quote: TickerQuote
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<TickerQuote>>()

function cacheTtl(entry: CacheEntry): number {
  return entry.quote.error ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS
}

/** Drop expired entries; if still over cap, evict oldest (Map preserves insertion order). */
function pruneCache(now: number) {
  for (const [key, entry] of cache) {
    if (now - entry.fetchedAt >= cacheTtl(entry)) cache.delete(key)
  }
  if (cache.size > MAX_CACHE_ENTRIES) {
    const excess = cache.size - MAX_CACHE_ENTRIES
    let i = 0
    for (const key of cache.keys()) {
      if (i++ >= excess) break
      cache.delete(key)
    }
  }
}

interface YahooChartMeta {
  symbol?: string
  regularMarketPrice?: number
  chartPreviousClose?: number
  previousClose?: number
  currency?: string
  exchangeName?: string
  fullExchangeName?: string
  marketState?: string
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{ meta?: YahooChartMeta }> | null
    error?: { code?: string; description?: string } | null
  }
}

function buildErrorQuote(symbol: string, message: string): TickerQuote {
  return {
    symbol,
    price: null,
    prev_close: null,
    change: null,
    change_percent: null,
    currency: null,
    exchange: null,
    market_state: null,
    fetched_at: new Date().toISOString(),
    cached: false,
    error: message,
  }
}

async function fetchSymbolFromYahoo(symbol: string): Promise<TickerQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ARI-Portfolio/1.0)',
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      // Log the real status server-side; return a fixed message to the client.
      console.error(`portfolio: Yahoo Finance returned ${res.status} for ${symbol}`)
      return buildErrorQuote(symbol, 'Quote temporarily unavailable')
    }

    const json = (await res.json()) as YahooChartResponse
    const result = json.chart?.result?.[0]
    const meta = result?.meta

    if (json.chart?.error || !meta || typeof meta.regularMarketPrice !== 'number') {
      if (json.chart?.error) {
        console.error(
          `portfolio: Yahoo Finance error for ${symbol}: ${json.chart.error.code ?? ''} ${json.chart.error.description ?? ''}`,
        )
      }
      return buildErrorQuote(symbol, 'Symbol not found')
    }

    const price = meta.regularMarketPrice
    const prevClose =
      typeof meta.chartPreviousClose === 'number'
        ? meta.chartPreviousClose
        : typeof meta.previousClose === 'number'
          ? meta.previousClose
          : null
    const change = prevClose !== null ? price - prevClose : null
    const changePercent =
      prevClose !== null && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null

    return {
      symbol: meta.symbol || symbol,
      price,
      prev_close: prevClose,
      change,
      change_percent: changePercent,
      currency: meta.currency || null,
      exchange: meta.fullExchangeName || meta.exchangeName || null,
      market_state: meta.marketState || null,
      fetched_at: new Date().toISOString(),
      cached: false,
    }
  } catch (err) {
    // Raw error (may contain proxy/DNS details) stays server-side only.
    console.error(
      `portfolio: quote fetch failed for ${symbol}:`,
      err instanceof Error ? err.message : err,
    )
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Request timed out'
        : 'Quote temporarily unavailable'
    return buildErrorQuote(symbol, message)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Returns a quote per requested symbol, served from cache when fresh.
 * Successful quotes are cached for 2 minutes; errors are negatively cached
 * for 30 seconds so bad symbols can't be used to hammer Yahoo, while
 * transient failures still recover quickly.
 */
export async function getQuotes(symbols: string[]): Promise<TickerQuote[]> {
  const now = Date.now()
  const results: TickerQuote[] = new Array(symbols.length)
  const symbolsToFetch: { idx: number; symbol: string }[] = []

  symbols.forEach((symbol, idx) => {
    const cached = cache.get(symbol)
    if (cached && now - cached.fetchedAt < cacheTtl(cached)) {
      results[idx] = { ...cached.quote, cached: true }
    } else {
      symbolsToFetch.push({ idx, symbol })
    }
  })

  if (symbolsToFetch.length > 0) {
    const fetched = await Promise.all(
      symbolsToFetch.map(({ symbol }) => {
        const pending = inFlight.get(symbol)
        if (pending) return pending
        const promise = fetchSymbolFromYahoo(symbol).finally(() => {
          inFlight.delete(symbol)
        })
        inFlight.set(symbol, promise)
        return promise
      }),
    )
    fetched.forEach((quote, i) => {
      const { idx, symbol } = symbolsToFetch[i]
      results[idx] = quote
      cache.set(symbol, { quote, fetchedAt: Date.now() })
    })
    pruneCache(Date.now())
  }

  return results
}
