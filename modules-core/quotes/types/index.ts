/**
 * Quote entry interface
 */
export interface Quote {
  id: string
  user_id: string
  quote: string
  author?: string | null
  created_at: string
  updated_at: string
}

/**
 * Quote input for creating/updating quotes
 */
export interface QuoteInput {
  quote: string
  author?: string | null
}

/**
 * Settings for the quotes module
 */
export interface QuotesSettings {
  showAuthor: boolean
  cardsPerRow: number
  defaultSortOrder: 'asc' | 'desc'
}

/**
 * Default settings
 */
export const defaultQuotesSettings: QuotesSettings = {
  showAuthor: true,
  cardsPerRow: 3,
  defaultSortOrder: 'desc'
}
