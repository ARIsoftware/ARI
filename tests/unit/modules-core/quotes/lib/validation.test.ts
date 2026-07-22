import { describe, it, expect } from 'vitest'
import {
  createQuoteSchema,
  updateQuoteSchema,
  deleteQuoteQuerySchema,
  listQuotesQuerySchema,
  QuoteSchema,
  QuoteListSchema,
  QuoteSettingsSchema,
  QuoteSettingsSaveResponseSchema,
  DeleteSuccessSchema,
} from '@/modules-core/quotes/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

// ─── createQuoteSchema ────────────────────────────────────────────────────────

describe('createQuoteSchema', () => {
  it('accepts minimal valid quote (text only)', () => {
    expect(createQuoteSchema.safeParse({ quote: { quote: 'To be or not to be.' } }).success).toBe(true)
  })

  it('accepts quote with author', () => {
    expect(createQuoteSchema.safeParse({ quote: { quote: 'To be or not to be.', author: 'Shakespeare' } }).success).toBe(true)
  })

  it('accepts null author', () => {
    expect(createQuoteSchema.safeParse({ quote: { quote: 'Be yourself.', author: null } }).success).toBe(true)
  })

  // quote text
  it('rejects empty quote text', () => {
    expect(createQuoteSchema.safeParse({ quote: { quote: '' } }).success).toBe(false)
  })

  it('rejects quote text exceeding 1000 chars', () => {
    expect(createQuoteSchema.safeParse({ quote: { quote: 'x'.repeat(1001) } }).success).toBe(false)
  })

  it('accepts quote text at exactly 1000 chars', () => {
    expect(createQuoteSchema.safeParse({ quote: { quote: 'x'.repeat(1000) } }).success).toBe(true)
  })

  it('rejects missing quote text', () => {
    expect(createQuoteSchema.safeParse({ quote: {} }).success).toBe(false)
  })

  // author
  it('rejects author exceeding 200 chars', () => {
    expect(createQuoteSchema.safeParse({ quote: { quote: 'Q', author: 'a'.repeat(201) } }).success).toBe(false)
  })

  it('accepts author at exactly 200 chars', () => {
    expect(createQuoteSchema.safeParse({ quote: { quote: 'Q', author: 'a'.repeat(200) } }).success).toBe(true)
  })

  it('rejects missing quote wrapper', () => {
    expect(createQuoteSchema.safeParse({ quote: 'direct string' }).success).toBe(false)
  })
})

// ─── updateQuoteSchema ────────────────────────────────────────────────────────

describe('updateQuoteSchema', () => {
  it('accepts valid update with id and updates', () => {
    expect(updateQuoteSchema.safeParse({ id: VALID_UUID, updates: { quote: 'New quote text' } }).success).toBe(true)
  })

  it('accepts empty updates object (all fields optional)', () => {
    expect(updateQuoteSchema.safeParse({ id: VALID_UUID, updates: {} }).success).toBe(true)
  })

  it('accepts null author in updates', () => {
    expect(updateQuoteSchema.safeParse({ id: VALID_UUID, updates: { author: null } }).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(updateQuoteSchema.safeParse({ id: 'bad', updates: {} }).success).toBe(false)
  })

  it('rejects missing id', () => {
    expect(updateQuoteSchema.safeParse({ updates: {} }).success).toBe(false)
  })

  it('rejects missing updates', () => {
    expect(updateQuoteSchema.safeParse({ id: VALID_UUID }).success).toBe(false)
  })

  it('rejects empty quote text when provided', () => {
    expect(updateQuoteSchema.safeParse({ id: VALID_UUID, updates: { quote: '' } }).success).toBe(false)
  })

  it('rejects quote text exceeding 1000 chars in updates', () => {
    expect(updateQuoteSchema.safeParse({ id: VALID_UUID, updates: { quote: 'x'.repeat(1001) } }).success).toBe(false)
  })

  it('rejects author exceeding 200 chars in updates', () => {
    expect(updateQuoteSchema.safeParse({ id: VALID_UUID, updates: { author: 'a'.repeat(201) } }).success).toBe(false)
  })
})

// ─── deleteQuoteQuerySchema ───────────────────────────────────────────────────

describe('deleteQuoteQuerySchema', () => {
  it('accepts valid UUID', () => {
    expect(deleteQuoteQuerySchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(deleteQuoteQuerySchema.safeParse({ id: 'bad-id' }).success).toBe(false)
  })

  it('rejects missing id', () => {
    expect(deleteQuoteQuerySchema.safeParse({}).success).toBe(false)
  })
})

// ─── listQuotesQuerySchema ────────────────────────────────────────────────────

describe('listQuotesQuerySchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(listQuotesQuerySchema.safeParse({}).success).toBe(true)
  })

  it('coerces string limit to number', () => {
    const result = listQuotesQuerySchema.parse({ limit: '20' })
    expect(result.limit).toBe(20)
  })

  it('rejects limit less than 1', () => {
    expect(listQuotesQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('rejects limit greater than 500', () => {
    expect(listQuotesQuerySchema.safeParse({ limit: 501 }).success).toBe(false)
  })

  it('accepts limit at exactly 500', () => {
    expect(listQuotesQuerySchema.safeParse({ limit: 500 }).success).toBe(true)
  })

  it('coerces string offset', () => {
    const result = listQuotesQuerySchema.parse({ offset: '5' })
    expect(result.offset).toBe(5)
  })

  it('rejects negative offset', () => {
    expect(listQuotesQuerySchema.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('accepts offset of 0', () => {
    expect(listQuotesQuerySchema.safeParse({ offset: 0 }).success).toBe(true)
  })
})

// ─── QuoteSchema ──────────────────────────────────────────────────────────────

describe('QuoteSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    quote: 'Be the change.',
    author: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid quote', () => {
    expect(QuoteSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts string author', () => {
    expect(QuoteSchema.safeParse({ ...valid, author: 'Gandhi' }).success).toBe(true)
  })

  it('accepts null author', () => {
    expect(QuoteSchema.safeParse({ ...valid, author: null }).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(QuoteSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })
})

// ─── QuoteListSchema ──────────────────────────────────────────────────────────

describe('QuoteListSchema', () => {
  it('accepts empty array', () => {
    expect(QuoteListSchema.safeParse([]).success).toBe(true)
  })

  it('accepts array with valid quotes', () => {
    const quote = {
      id: VALID_UUID,
      user_id: 'u',
      quote: 'Q',
      author: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    expect(QuoteListSchema.safeParse([quote]).success).toBe(true)
  })

  it('rejects non-array input', () => {
    expect(QuoteListSchema.safeParse({ id: VALID_UUID }).success).toBe(false)
  })
})

// ─── QuoteSettingsSchema ──────────────────────────────────────────────────────

describe('QuoteSettingsSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(QuoteSettingsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts showAuthor boolean', () => {
    expect(QuoteSettingsSchema.safeParse({ showAuthor: true }).success).toBe(true)
  })

  it('accepts cardsPerRow 1', () => {
    expect(QuoteSettingsSchema.safeParse({ cardsPerRow: 1 }).success).toBe(true)
  })

  it('accepts cardsPerRow 4', () => {
    expect(QuoteSettingsSchema.safeParse({ cardsPerRow: 4 }).success).toBe(true)
  })

  it('rejects cardsPerRow 0', () => {
    expect(QuoteSettingsSchema.safeParse({ cardsPerRow: 0 }).success).toBe(false)
  })

  it('rejects cardsPerRow 5', () => {
    expect(QuoteSettingsSchema.safeParse({ cardsPerRow: 5 }).success).toBe(false)
  })

  it('rejects non-integer cardsPerRow', () => {
    expect(QuoteSettingsSchema.safeParse({ cardsPerRow: 2.5 }).success).toBe(false)
  })

  it('accepts defaultSortOrder "asc"', () => {
    expect(QuoteSettingsSchema.safeParse({ defaultSortOrder: 'asc' }).success).toBe(true)
  })

  it('accepts defaultSortOrder "desc"', () => {
    expect(QuoteSettingsSchema.safeParse({ defaultSortOrder: 'desc' }).success).toBe(true)
  })

  it('rejects invalid defaultSortOrder', () => {
    expect(QuoteSettingsSchema.safeParse({ defaultSortOrder: 'newest' }).success).toBe(false)
  })
})

// ─── QuoteSettingsSaveResponseSchema ──────────────────────────────────────────

describe('QuoteSettingsSaveResponseSchema', () => {
  it('accepts { success: true }', () => {
    expect(QuoteSettingsSaveResponseSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('accepts optional message', () => {
    expect(QuoteSettingsSaveResponseSchema.safeParse({ success: true, message: 'Saved' }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(QuoteSettingsSaveResponseSchema.safeParse({ success: false }).success).toBe(false)
  })
})

// ─── DeleteSuccessSchema ──────────────────────────────────────────────────────

describe('DeleteSuccessSchema', () => {
  it('accepts { success: true }', () => {
    expect(DeleteSuccessSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(DeleteSuccessSchema.safeParse({ success: false }).success).toBe(false)
  })
})
