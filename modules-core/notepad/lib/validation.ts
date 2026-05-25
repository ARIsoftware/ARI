import { z } from 'zod'
import '@/lib/openapi/registry'

const MAX_CONTENT_LENGTH = 6000

export const updateNotepadSchema = z.object({
  content: z.string().max(MAX_CONTENT_LENGTH, `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`),
}).openapi('UpdateNotepadBody')

export const NotepadStateSchema = z.object({
  content: z.string(),
  updated_at: z.string().nullable(),
}).openapi('NotepadState')

// Returned by POST /api/modules/notepad (insert .returning() — camelCase, no toSnakeCase).
export const NotepadRevisionCamelSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  revisionNumber: z.number().int(),
}).openapi('NotepadRevisionCamel')

// Returned by GET /api/modules/notepad/revisions — hand-projected snake_case (no user_id).
export const NotepadRevisionListItemSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  created_at: z.string(),
  revision_number: z.number().int(),
}).openapi('NotepadRevisionListItem')

export const NotepadRevisionListSchema = z.array(NotepadRevisionListItemSchema).openapi('NotepadRevisionList')

// Returned by POST /api/modules/notepad/revisions (full row via toSnakeCase).
export const NotepadRevisionSnakeSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  content: z.string(),
  created_at: z.string(),
  revision_number: z.number().int(),
}).openapi('NotepadRevision')

export const listRevisionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const restoreRevisionSchema = z.object({
  revision_id: z.string().uuid('Invalid revision id format'),
}).openapi('RestoreRevisionBody')
