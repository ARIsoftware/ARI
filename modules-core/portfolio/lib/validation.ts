/**
 * Shared validation used by both client and server.
 * Symbol format: 1-10 chars, letters/digits/dot/hyphen, must start with a letter.
 * Examples that pass: AAPL, MSFT, BRK-B, BRK.A, GOOGL
 */
import { z } from 'zod'
import '@/lib/openapi/registry'

export const SYMBOL_REGEX = /^[A-Z][A-Z0-9.\-]{0,9}$/
export const SYMBOL_ERROR =
  'Symbol must be 1-10 characters, start with a letter, and contain only letters, numbers, dots, or hyphens'

/** Server-side cap per quotes request; the client chunks larger portfolios into batches of this size. */
export const MAX_SYMBOLS_PER_REQUEST = 50

// Upper bounds so out-of-range values fail validation with a clear 400
// instead of erroring at the database (position is INTEGER, shares is NUMERIC(20,8)).
const MAX_POSITION = 2147483647
const MAX_SHARES = 1e12

export function normalizeSymbol(input: string): string {
  return input.trim().toUpperCase()
}

export function isValidSymbol(input: string): boolean {
  return SYMBOL_REGEX.test(input)
}

// ────────────────────────────────────────────────────────────
// Zod schemas (for OpenAPI + request validation)
// ────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid('Invalid ticker id format')

export const createTickerSchema = z
  .object({
    symbol: z
      .string({ required_error: 'Symbol is required' })
      .min(1, 'Symbol is required')
      .max(10, 'Symbol must be 10 characters or fewer')
      .transform(normalizeSymbol)
      .refine((s) => SYMBOL_REGEX.test(s), { message: SYMBOL_ERROR }),
    shares: z
      .number({ invalid_type_error: 'Shares must be a number' })
      .nonnegative('Shares must be zero or greater')
      .finite('Shares must be a finite number')
      .max(MAX_SHARES, 'Shares value is too large')
      .nullable()
      .optional(),
  })
  .openapi('CreatePortfolioTickerBody')

export const updateTickerSchema = z
  .object({
    position: z.number().int().min(0).max(MAX_POSITION).optional(),
    symbol: z
      .string()
      .min(1)
      .max(10)
      .transform(normalizeSymbol)
      .refine((s) => SYMBOL_REGEX.test(s), { message: SYMBOL_ERROR })
      .optional(),
    shares: z
      .number()
      .nonnegative()
      .finite()
      .max(MAX_SHARES, 'Shares value is too large')
      .nullable()
      .optional(),
  })
  .refine((d) => d.position !== undefined || d.symbol !== undefined || d.shares !== undefined, {
    message: 'At least one of position, symbol, or shares must be provided',
  })
  .openapi('UpdatePortfolioTickerBody')

export const tickerIdParamSchema = z.object({
  id: uuidSchema,
})

// Defaults are applied in the route (validateQueryParams' generic can't
// express zod's differing input/output types for .default()).
export const tickersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const PortfolioTickerSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string(),
    symbol: z.string(),
    shares: z.string().nullable(),
    position: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('PortfolioTicker')

export const TickerListResponseSchema = z
  .object({
    tickers: z.array(PortfolioTickerSchema),
    count: z.number().int().nonnegative(),
  })
  .openapi('PortfolioTickerListResponse')

export const TickerSingleResponseSchema = z
  .object({
    ticker: PortfolioTickerSchema,
  })
  .openapi('PortfolioTickerSingleResponse')

export const TickerDeleteResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi('PortfolioTickerDeleteResponse')

// Quotes

export const quotesQuerySchema = z.object({
  symbols: z
    .string()
    .min(1, 'symbols query param is required')
    .max(600, 'Too many symbols in one request'),
})

export const TickerQuoteSchema = z
  .object({
    symbol: z.string(),
    price: z.number().nullable(),
    prev_close: z.number().nullable(),
    change: z.number().nullable(),
    change_percent: z.number().nullable(),
    currency: z.string().nullable(),
    exchange: z.string().nullable(),
    market_state: z.string().nullable(),
    fetched_at: z.string(),
    cached: z.boolean(),
    error: z.string().optional(),
  })
  .openapi('PortfolioTickerQuote')

export const QuotesResponseSchema = z
  .object({
    quotes: z.array(TickerQuoteSchema),
  })
  .openapi('PortfolioQuotesResponse')

// Settings

export const PortfolioSettingsSchema = z
  .object({
    onboardingCompleted: z.boolean().optional(),
    showDashboardWidget: z.boolean().optional(),
  })
  .openapi('PortfolioSettings')

export const PortfolioSettingsSaveResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
  })
  .openapi('PortfolioSettingsSaveResponse')
