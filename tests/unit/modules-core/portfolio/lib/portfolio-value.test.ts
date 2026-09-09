import { describe, it, expect } from 'vitest'
import {
  computePortfolioValue,
  formatTotalValue,
} from '@/modules-core/portfolio/lib/portfolio-value'
import type { TickerQuote } from '@/modules-core/portfolio/types'

function quote(overrides: Partial<TickerQuote> & { symbol: string }): TickerQuote {
  return {
    price: null,
    prev_close: null,
    change: null,
    change_percent: null,
    currency: 'USD',
    exchange: 'NasdaqGS',
    market_state: 'REGULAR',
    fetched_at: '2026-01-01T00:00:00.000Z',
    cached: false,
    ...overrides,
  }
}

describe('computePortfolioValue', () => {
  it('returns empty summary when there are no tickers', () => {
    const summary = computePortfolioValue([], new Map())
    expect(summary).toEqual({
      totalValue: null,
      totalPrevValue: null,
      change: null,
      changePercent: null,
      currency: null,
      holdingsCount: 0,
    })
  })

  it('ignores holdings without a positive share count', () => {
    const quotes = new Map([['AAPL', quote({ symbol: 'AAPL', price: 100, prev_close: 90 })]])
    const summary = computePortfolioValue(
      [
        { symbol: 'AAPL', shares: null },
        { symbol: 'AAPL', shares: '0' },
        { symbol: 'AAPL', shares: 'not-a-number' },
      ],
      quotes,
    )
    expect(summary.holdingsCount).toBe(0)
    expect(summary.totalValue).toBeNull()
  })

  it('computes value, change, and percent for a fully quoted holding', () => {
    const quotes = new Map([['AAPL', quote({ symbol: 'AAPL', price: 110, prev_close: 100 })]])
    const summary = computePortfolioValue([{ symbol: 'AAPL', shares: '2' }], quotes)
    expect(summary.totalValue).toBe(220)
    expect(summary.totalPrevValue).toBe(200)
    expect(summary.change).toBe(20)
    expect(summary.changePercent).toBeCloseTo(10)
    expect(summary.currency).toBe('USD')
    expect(summary.holdingsCount).toBe(1)
  })

  it('excludes price-only holdings from the change basis but not from total value', () => {
    const quotes = new Map([
      ['AAPL', quote({ symbol: 'AAPL', price: 110, prev_close: 100 })],
      ['NEWCO', quote({ symbol: 'NEWCO', price: 50, prev_close: null })],
    ])
    const summary = computePortfolioValue(
      [
        { symbol: 'AAPL', shares: '1' },
        { symbol: 'NEWCO', shares: '4' },
      ],
      quotes,
    )
    expect(summary.totalValue).toBe(310) // both holdings priced
    expect(summary.change).toBe(10) // AAPL only — NEWCO has no prev_close
    expect(summary.changePercent).toBeCloseTo(10)
  })

  it('returns change null when no holding has a previous close', () => {
    const quotes = new Map([['NEWCO', quote({ symbol: 'NEWCO', price: 50, prev_close: null })]])
    const summary = computePortfolioValue([{ symbol: 'NEWCO', shares: '4' }], quotes)
    expect(summary.totalValue).toBe(200)
    expect(summary.totalPrevValue).toBeNull()
    expect(summary.change).toBeNull()
    expect(summary.changePercent).toBeNull()
  })

  it('returns change null when the previous value is zero', () => {
    const quotes = new Map([['ZERO', quote({ symbol: 'ZERO', price: 5, prev_close: 0 })]])
    const summary = computePortfolioValue([{ symbol: 'ZERO', shares: '1' }], quotes)
    expect(summary.totalValue).toBe(5)
    expect(summary.totalPrevValue).toBe(0)
    expect(summary.change).toBeNull()
    expect(summary.changePercent).toBeNull()
  })

  it('skips the aggregate view entirely for mixed currencies', () => {
    const quotes = new Map([
      ['AAPL', quote({ symbol: 'AAPL', price: 100, prev_close: 90, currency: 'USD' })],
      ['SAP', quote({ symbol: 'SAP', price: 200, prev_close: 190, currency: 'EUR' })],
    ])
    const summary = computePortfolioValue(
      [
        { symbol: 'AAPL', shares: '1' },
        { symbol: 'SAP', shares: '1' },
      ],
      quotes,
    )
    expect(summary).toEqual({
      totalValue: null,
      totalPrevValue: null,
      change: null,
      changePercent: null,
      currency: null,
      holdingsCount: 2,
    })
  })

  it('does not treat repeated or missing currencies as mixed', () => {
    const quotes = new Map([
      ['AAPL', quote({ symbol: 'AAPL', price: 100, prev_close: 90, currency: 'USD' })],
      ['MSFT', quote({ symbol: 'MSFT', price: 50, prev_close: 40, currency: 'USD' })],
      ['NOC', quote({ symbol: 'NOC', price: 10, prev_close: 10, currency: null })],
    ])
    const summary = computePortfolioValue(
      [
        { symbol: 'AAPL', shares: '1' },
        { symbol: 'MSFT', shares: '1' },
        { symbol: 'NOC', shares: '1' },
      ],
      quotes,
    )
    expect(summary.currency).toBe('USD')
    expect(summary.totalValue).toBe(160)
  })

  it('skips holdings with no quote or no price', () => {
    const quotes = new Map([
      ['ERR', quote({ symbol: 'ERR', price: null, error: 'Symbol not found' })],
    ])
    const summary = computePortfolioValue(
      [
        { symbol: 'ERR', shares: '3' },
        { symbol: 'MISSING', shares: '2' },
      ],
      quotes,
    )
    expect(summary.totalValue).toBeNull()
    expect(summary.holdingsCount).toBe(2)
  })
})

describe('formatTotalValue', () => {
  it('formats with the given currency', () => {
    expect(formatTotalValue(1234.5, 'USD')).toBe('$1,234.50')
  })

  it('falls back to USD when currency is null', () => {
    expect(formatTotalValue(10, null)).toBe('$10.00')
  })

  it('falls back to a plain number when the currency code is invalid', () => {
    expect(formatTotalValue(10.005, 'NOT_A_CODE')).toBe('10.01')
  })
})
