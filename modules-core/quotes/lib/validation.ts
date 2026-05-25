import { z } from 'zod'
import '@/lib/openapi/registry'

const uuidSchema = z.string().uuid('Invalid quote ID format')

export const createQuoteSchema = z.object({
  quote: z.object({
    quote: z.string().min(1, 'Quote text is required').max(1000, 'Quote is too long'),
    author: z.string().max(200, 'Author name is too long').optional().nullable(),
  }),
}).openapi('CreateQuoteBody')

export const updateQuoteSchema = z.object({
  id: uuidSchema,
  updates: z.object({
    quote: z.string().min(1, 'Quote text is required').max(1000, 'Quote is too long').optional(),
    author: z.string().max(200, 'Author name is too long').optional().nullable(),
  }),
}).openapi('UpdateQuoteRequest')

export const deleteQuoteQuerySchema = z.object({
  id: uuidSchema,
})

export const listQuotesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const QuoteSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  quote: z.string(),
  author: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('Quote')

export const QuoteListSchema = z.array(QuoteSchema).openapi('QuoteList')

export const QuoteSettingsSchema = z.object({
  showAuthor: z.boolean().optional(),
  cardsPerRow: z.number().int().min(1).max(4).optional(),
  defaultSortOrder: z.enum(['asc', 'desc']).optional(),
}).openapi('QuoteSettings')

export const QuoteSettingsSaveResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
}).openapi('QuoteSettingsSaveResponse')

export const DeleteSuccessSchema = z.object({
  success: z.literal(true),
}).openapi('QuoteDeleteSuccess')
