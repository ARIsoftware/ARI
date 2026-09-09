import { describe, it, expect } from 'vitest'
import {
  SYMBOL_REGEX,
  SYMBOL_ERROR,
  MAX_SYMBOLS_PER_REQUEST,
  normalizeSymbol,
  isValidSymbol,
  createTickerSchema,
  updateTickerSchema,
  tickerIdParamSchema,
  tickersQuerySchema,
  quotesQuerySchema,
  PortfolioTickerSchema,
  TickerListResponseSchema,
  TickerSingleResponseSchema,
  TickerDeleteResponseSchema,
  TickerQuoteSchema,
  QuotesResponseSchema,
  PortfolioSettingsSchema,
  PortfolioSettingsSaveResponseSchema,
} from '@/modules-core/portfolio/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

const VALID_TICKER = {
  id: VALID_UUID,
  user_id: 'user-1',
  symbol: 'AAPL',
  shares: '2.5',
  position: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const VALID_QUOTE = {
  symbol: 'AAPL',
  price: 110,
  prev_close: 100,
  change: 10,
  change_percent: 10,
  currency: 'USD',
  exchange: 'NasdaqGS',
  market_state: 'REGULAR',
  fetched_at: '2026-01-01T00:00:00.000Z',
  cached: false,
}

describe('symbol helpers', () => {
  it('normalizeSymbol trims and uppercases', () => {
    expect(normalizeSymbol('  aapl ')).toBe('AAPL')
  })

  it('isValidSymbol accepts real-world symbols', () => {
    for (const s of ['AAPL', 'BRK-B', 'BRK.A', 'A', 'GOOGL']) {
      expect(isValidSymbol(s)).toBe(true)
    }
  })

  it('isValidSymbol rejects bad formats', () => {
    for (const s of ['', '1ABC', '-ABC', 'TOOLONGSYMBOL', 'aapl', 'AA PL', 'AA$L']) {
      expect(isValidSymbol(s)).toBe(false)
    }
  })

  it('exposes the shared constants', () => {
    expect(SYMBOL_REGEX.test('MSFT')).toBe(true)
    expect(SYMBOL_ERROR).toContain('10 characters')
    expect(MAX_SYMBOLS_PER_REQUEST).toBe(50)
  })
})

describe('createTickerSchema', () => {
  it('accepts and normalizes a valid symbol', () => {
    const parsed = createTickerSchema.safeParse({ symbol: ' aapl ', shares: 2.5 })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.symbol).toBe('AAPL')
      expect(parsed.data.shares).toBe(2.5)
    }
  })

  it('accepts null and omitted shares', () => {
    expect(createTickerSchema.safeParse({ symbol: 'AAPL', shares: null }).success).toBe(true)
    expect(createTickerSchema.safeParse({ symbol: 'AAPL' }).success).toBe(true)
  })

  it('rejects missing, empty, overlong, and malformed symbols', () => {
    expect(createTickerSchema.safeParse({}).success).toBe(false)
    expect(createTickerSchema.safeParse({ symbol: '' }).success).toBe(false)
    expect(createTickerSchema.safeParse({ symbol: 'ELEVENCHARS' }).success).toBe(false)
    expect(createTickerSchema.safeParse({ symbol: '1BAD' }).success).toBe(false)
  })

  it('rejects negative, non-finite, oversized, and non-numeric shares', () => {
    expect(createTickerSchema.safeParse({ symbol: 'AAPL', shares: -1 }).success).toBe(false)
    expect(createTickerSchema.safeParse({ symbol: 'AAPL', shares: Infinity }).success).toBe(false)
    expect(createTickerSchema.safeParse({ symbol: 'AAPL', shares: 1e13 }).success).toBe(false)
    expect(createTickerSchema.safeParse({ symbol: 'AAPL', shares: '2' }).success).toBe(false)
  })
})

describe('updateTickerSchema', () => {
  it('accepts each field on its own', () => {
    expect(updateTickerSchema.safeParse({ position: 3 }).success).toBe(true)
    expect(updateTickerSchema.safeParse({ symbol: 'msft' }).success).toBe(true)
    expect(updateTickerSchema.safeParse({ shares: null }).success).toBe(true)
  })

  it('requires at least one field', () => {
    expect(updateTickerSchema.safeParse({}).success).toBe(false)
  })

  it('bounds position to the INTEGER range', () => {
    expect(updateTickerSchema.safeParse({ position: -1 }).success).toBe(false)
    expect(updateTickerSchema.safeParse({ position: 2147483647 }).success).toBe(true)
    expect(updateTickerSchema.safeParse({ position: 2147483648 }).success).toBe(false)
  })

  it('bounds shares and validates renamed symbols', () => {
    expect(updateTickerSchema.safeParse({ shares: 1e13 }).success).toBe(false)
    expect(updateTickerSchema.safeParse({ symbol: 'BAD SYMBOL' }).success).toBe(false)
  })
})

describe('tickerIdParamSchema', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(tickerIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
    expect(tickerIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('tickersQuerySchema', () => {
  it('accepts an empty query (defaults applied in the route)', () => {
    const parsed = tickersQuerySchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.limit).toBeUndefined()
      expect(parsed.data.offset).toBeUndefined()
    }
  })

  it('coerces string query params to numbers', () => {
    const parsed = tickersQuerySchema.safeParse({ limit: '100', offset: '20' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.limit).toBe(100)
      expect(parsed.data.offset).toBe(20)
    }
  })

  it('rejects out-of-range values', () => {
    expect(tickersQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(tickersQuerySchema.safeParse({ limit: '501' }).success).toBe(false)
    expect(tickersQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
    expect(tickersQuerySchema.safeParse({ limit: '1.5' }).success).toBe(false)
  })
})

describe('quotesQuerySchema', () => {
  it('requires a non-empty, bounded symbols param', () => {
    expect(quotesQuerySchema.safeParse({ symbols: 'AAPL,MSFT' }).success).toBe(true)
    expect(quotesQuerySchema.safeParse({ symbols: '' }).success).toBe(false)
    expect(quotesQuerySchema.safeParse({ symbols: 'A'.repeat(601) }).success).toBe(false)
    expect(quotesQuerySchema.safeParse({}).success).toBe(false)
  })
})

describe('response schemas', () => {
  it('PortfolioTickerSchema round-trips a ticker row', () => {
    expect(PortfolioTickerSchema.safeParse(VALID_TICKER).success).toBe(true)
    expect(PortfolioTickerSchema.safeParse({ ...VALID_TICKER, shares: null }).success).toBe(true)
    expect(PortfolioTickerSchema.safeParse({ ...VALID_TICKER, id: 'nope' }).success).toBe(false)
  })

  it('list/single/delete response schemas validate', () => {
    expect(TickerListResponseSchema.safeParse({ tickers: [VALID_TICKER], count: 1 }).success).toBe(
      true,
    )
    expect(TickerListResponseSchema.safeParse({ tickers: [], count: -1 }).success).toBe(false)
    expect(TickerSingleResponseSchema.safeParse({ ticker: VALID_TICKER }).success).toBe(true)
    expect(TickerDeleteResponseSchema.safeParse({ success: true }).success).toBe(true)
    expect(TickerDeleteResponseSchema.safeParse({ success: false }).success).toBe(false)
  })

  it('quote schemas validate success and error quotes', () => {
    expect(TickerQuoteSchema.safeParse(VALID_QUOTE).success).toBe(true)
    expect(
      TickerQuoteSchema.safeParse({
        ...VALID_QUOTE,
        price: null,
        prev_close: null,
        change: null,
        change_percent: null,
        currency: null,
        exchange: null,
        market_state: null,
        error: 'Symbol not found',
      }).success,
    ).toBe(true)
    expect(QuotesResponseSchema.safeParse({ quotes: [VALID_QUOTE] }).success).toBe(true)
    expect(QuotesResponseSchema.safeParse({ quotes: 'nope' }).success).toBe(false)
  })

  it('settings schemas validate', () => {
    expect(PortfolioSettingsSchema.safeParse({}).success).toBe(true)
    expect(
      PortfolioSettingsSchema.safeParse({ onboardingCompleted: true, showDashboardWidget: false })
        .success,
    ).toBe(true)
    expect(PortfolioSettingsSchema.safeParse({ onboardingCompleted: 'yes' }).success).toBe(false)
    expect(
      PortfolioSettingsSaveResponseSchema.safeParse({ success: true, message: 'Settings saved' })
        .success,
    ).toBe(true)
  })
})
