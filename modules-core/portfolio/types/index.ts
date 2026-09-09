/**
 * Portfolio Module - Type Definitions
 */

export interface PortfolioTicker {
  id: string
  user_id: string
  symbol: string
  shares: string | null
  position: number
  created_at: string
  updated_at?: string
}

export interface CreateTickerRequest {
  symbol: string
  shares?: number | null
}

export interface ReorderTickerRequest {
  position: number
}

export interface GetTickersResponse {
  tickers: PortfolioTicker[]
  count: number
}

export interface CreateTickerResponse {
  ticker: PortfolioTicker
}

/**
 * Live quote returned by the /quotes endpoint.
 * `error` is set per-symbol when Yahoo can't resolve it, so the rest of the
 * batch still renders.
 */
export interface TickerQuote {
  symbol: string
  price: number | null
  prev_close: number | null
  change: number | null
  change_percent: number | null
  currency: string | null
  exchange: string | null
  market_state: string | null
  fetched_at: string
  cached: boolean
  error?: string
}

export interface GetQuotesResponse {
  quotes: TickerQuote[]
}

export interface PortfolioSettings {
  onboardingCompleted: boolean
  showDashboardWidget: boolean
}

export type GetSettingsResponse = Partial<PortfolioSettings>
export type UpdateSettingsRequest = Partial<PortfolioSettings>

export interface UpdateSettingsResponse {
  success: boolean
  message: string
}

export interface ApiErrorResponse {
  error: string
  details?: unknown
}
