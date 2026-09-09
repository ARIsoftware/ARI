/**
 * Shared portfolio-value computation used by the dashboard widgets.
 */

import type { PortfolioTicker, TickerQuote } from '../types'

export interface PortfolioValueSummary {
  totalValue: number | null
  totalPrevValue: number | null
  change: number | null
  changePercent: number | null
  currency: string | null
  holdingsCount: number
}

export function computePortfolioValue(
  tickers: Pick<PortfolioTicker, 'symbol' | 'shares'>[],
  quotesBySymbol: Map<string, TickerQuote>,
): PortfolioValueSummary {
  const withShares = tickers.filter((t) => {
    if (t.shares == null) return false
    const n = Number(t.shares)
    return Number.isFinite(n) && n > 0
  })

  let value = 0
  // The daily change is computed only over holdings that have BOTH a price
  // and a previous close — including a price-only holding in value but not
  // in prev would inflate the reported change.
  let changeValue = 0
  let changePrev = 0
  let cur: string | null = null
  let mixedCurrencies = false
  let hasAnyQuote = false
  let hasChangeBasis = false

  for (const ticker of withShares) {
    const quote = quotesBySymbol.get(ticker.symbol)
    const shares = Number(ticker.shares)
    if (quote?.price != null) {
      value += shares * quote.price
      hasAnyQuote = true
      if (quote.currency) {
        if (!cur) cur = quote.currency
        else if (cur !== quote.currency) mixedCurrencies = true
      }
      if (quote.prev_close != null) {
        changeValue += shares * quote.price
        changePrev += shares * quote.prev_close
        hasChangeBasis = true
      }
    }
  }

  // Summing across currencies without FX rates would mislabel the total, so
  // skip the aggregate view entirely when holdings are priced in different
  // currencies (per-ticker rows still render).
  if (mixedCurrencies) {
    return {
      totalValue: null,
      totalPrevValue: null,
      change: null,
      changePercent: null,
      currency: null,
      holdingsCount: withShares.length,
    }
  }

  const totalValue = hasAnyQuote ? value : null
  const totalPrevValue = hasChangeBasis ? changePrev : null
  const change = hasChangeBasis && changePrev !== 0 ? changeValue - changePrev : null
  const changePercent = change != null && changePrev !== 0 ? (change / changePrev) * 100 : null

  return {
    totalValue,
    totalPrevValue,
    change,
    changePercent,
    currency: cur,
    holdingsCount: withShares.length,
  }
}

export function formatTotalValue(value: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return value.toFixed(2)
  }
}
