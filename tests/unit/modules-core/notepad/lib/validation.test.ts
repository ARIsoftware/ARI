import { describe, it, expect } from 'vitest'
import {
  updateNotepadSchema,
  NotepadStateSchema,
  NotepadRevisionCamelSchema,
  NotepadRevisionListItemSchema,
  NotepadRevisionListSchema,
  NotepadRevisionSnakeSchema,
  listRevisionsQuerySchema,
  restoreRevisionSchema,
} from '@/modules-core/notepad/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const MAX_CONTENT_LENGTH = 6000

// ─── updateNotepadSchema ──────────────────────────────────────────────────────

describe('updateNotepadSchema', () => {
  it('accepts empty string content', () => {
    expect(updateNotepadSchema.safeParse({ content: '' }).success).toBe(true)
  })

  it('accepts valid content', () => {
    expect(updateNotepadSchema.safeParse({ content: 'Hello, world!' }).success).toBe(true)
  })

  it('accepts content at exactly max length', () => {
    expect(updateNotepadSchema.safeParse({ content: 'x'.repeat(MAX_CONTENT_LENGTH) }).success).toBe(true)
  })

  it('rejects content exceeding max length', () => {
    expect(updateNotepadSchema.safeParse({ content: 'x'.repeat(MAX_CONTENT_LENGTH + 1) }).success).toBe(false)
  })

  it('rejects missing content', () => {
    expect(updateNotepadSchema.safeParse({}).success).toBe(false)
  })

  it('rejects non-string content', () => {
    expect(updateNotepadSchema.safeParse({ content: 42 }).success).toBe(false)
  })
})

// ─── NotepadStateSchema ───────────────────────────────────────────────────────

describe('NotepadStateSchema', () => {
  it('accepts valid state with content', () => {
    expect(NotepadStateSchema.safeParse({ content: 'Notes here', updated_at: '2024-01-01T00:00:00Z' }).success).toBe(true)
  })

  it('accepts null updated_at', () => {
    expect(NotepadStateSchema.safeParse({ content: '', updated_at: null }).success).toBe(true)
  })

  it('rejects missing content', () => {
    expect(NotepadStateSchema.safeParse({ updated_at: null }).success).toBe(false)
  })

  it('rejects missing updated_at', () => {
    expect(NotepadStateSchema.safeParse({ content: 'hi' }).success).toBe(false)
  })
})

// ─── NotepadRevisionCamelSchema ───────────────────────────────────────────────

describe('NotepadRevisionCamelSchema', () => {
  const valid = {
    id: VALID_UUID,
    userId: 'user1',
    content: 'Revision content',
    createdAt: '2024-01-01T00:00:00Z',
    revisionNumber: 1,
  }

  it('accepts valid camel-case revision', () => {
    expect(NotepadRevisionCamelSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(NotepadRevisionCamelSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })

  it('rejects non-integer revisionNumber', () => {
    expect(NotepadRevisionCamelSchema.safeParse({ ...valid, revisionNumber: 1.5 }).success).toBe(false)
  })

  it('accepts revisionNumber of 0', () => {
    expect(NotepadRevisionCamelSchema.safeParse({ ...valid, revisionNumber: 0 }).success).toBe(true)
  })

  it('rejects missing userId', () => {
    const { userId: _, ...noUserId } = valid
    expect(NotepadRevisionCamelSchema.safeParse(noUserId).success).toBe(false)
  })
})

// ─── NotepadRevisionListItemSchema ────────────────────────────────────────────

describe('NotepadRevisionListItemSchema', () => {
  const valid = {
    id: VALID_UUID,
    content: 'Content',
    created_at: '2024-01-01T00:00:00Z',
    revision_number: 1,
  }

  it('accepts valid list item', () => {
    expect(NotepadRevisionListItemSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(NotepadRevisionListItemSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })

  it('rejects non-integer revision_number', () => {
    expect(NotepadRevisionListItemSchema.safeParse({ ...valid, revision_number: 2.5 }).success).toBe(false)
  })

  it('rejects missing created_at', () => {
    const { created_at: _, ...noDate } = valid
    expect(NotepadRevisionListItemSchema.safeParse(noDate).success).toBe(false)
  })
})

// ─── NotepadRevisionListSchema ────────────────────────────────────────────────

describe('NotepadRevisionListSchema', () => {
  it('accepts empty array', () => {
    expect(NotepadRevisionListSchema.safeParse([]).success).toBe(true)
  })

  it('accepts array with valid items', () => {
    const item = {
      id: VALID_UUID,
      content: 'c',
      created_at: '2024-01-01T00:00:00Z',
      revision_number: 1,
    }
    expect(NotepadRevisionListSchema.safeParse([item]).success).toBe(true)
  })

  it('rejects non-array input', () => {
    expect(NotepadRevisionListSchema.safeParse({ id: VALID_UUID }).success).toBe(false)
  })
})

// ─── NotepadRevisionSnakeSchema ───────────────────────────────────────────────

describe('NotepadRevisionSnakeSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    content: 'Revision content',
    created_at: '2024-01-01T00:00:00Z',
    revision_number: 1,
  }

  it('accepts valid snake_case revision', () => {
    expect(NotepadRevisionSnakeSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(NotepadRevisionSnakeSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })

  it('rejects non-integer revision_number', () => {
    expect(NotepadRevisionSnakeSchema.safeParse({ ...valid, revision_number: 1.5 }).success).toBe(false)
  })
})

// ─── listRevisionsQuerySchema ─────────────────────────────────────────────────

describe('listRevisionsQuerySchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(listRevisionsQuerySchema.safeParse({}).success).toBe(true)
  })

  it('coerces string limit to number', () => {
    const result = listRevisionsQuerySchema.parse({ limit: '10' })
    expect(result.limit).toBe(10)
  })

  it('rejects limit less than 1', () => {
    expect(listRevisionsQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('rejects limit greater than 200', () => {
    expect(listRevisionsQuerySchema.safeParse({ limit: 201 }).success).toBe(false)
  })

  it('accepts limit at exactly 200', () => {
    expect(listRevisionsQuerySchema.safeParse({ limit: 200 }).success).toBe(true)
  })

  it('coerces string offset to number', () => {
    const result = listRevisionsQuerySchema.parse({ offset: '5' })
    expect(result.offset).toBe(5)
  })

  it('rejects negative offset', () => {
    expect(listRevisionsQuerySchema.safeParse({ offset: -1 }).success).toBe(false)
  })
})

// ─── restoreRevisionSchema ────────────────────────────────────────────────────

describe('restoreRevisionSchema', () => {
  it('accepts valid UUID revision_id', () => {
    expect(restoreRevisionSchema.safeParse({ revision_id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID revision_id', () => {
    expect(restoreRevisionSchema.safeParse({ revision_id: 'not-uuid' }).success).toBe(false)
  })

  it('rejects missing revision_id', () => {
    expect(restoreRevisionSchema.safeParse({}).success).toBe(false)
  })
})
