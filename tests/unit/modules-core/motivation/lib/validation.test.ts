import { describe, it, expect } from 'vitest'
import {
  uuidSchema,
  listVideosQuerySchema,
  youtubeIdSchema,
  addVideoSchema,
  reorderSchema,
  MotivationVideoSchema,
  VideoListResponseSchema,
  VideoSingleResponseSchema,
  VideoDeleteResponseSchema,
  ReorderResponseSchema,
  MotivationSettingsSchema,
  SettingsSavedSchema,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  URL_MAX,
} from '@/modules-core/motivation/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

// ─── uuidSchema ───────────────────────────────────────────────────────────────

describe('uuidSchema', () => {
  it('accepts valid UUID', () => {
    expect(uuidSchema.safeParse(VALID_UUID).success).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false)
  })

  it('rejects empty string', () => {
    expect(uuidSchema.safeParse('').success).toBe(false)
  })
})

// ─── listVideosQuerySchema ────────────────────────────────────────────────────

describe('listVideosQuerySchema', () => {
  it('defaults limit and offset when not provided', () => {
    const result = listVideosQuerySchema.parse({})
    expect(result.limit).toBe(LIST_LIMIT_DEFAULT)
    expect(result.offset).toBe(0)
  })

  it('coerces string limit to number', () => {
    const result = listVideosQuerySchema.parse({ limit: '30' })
    expect(result.limit).toBe(30)
  })

  it('rejects limit less than 1', () => {
    expect(listVideosQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('rejects limit greater than LIST_LIMIT_MAX', () => {
    expect(listVideosQuerySchema.safeParse({ limit: LIST_LIMIT_MAX + 1 }).success).toBe(false)
  })

  it('accepts limit at exactly LIST_LIMIT_MAX', () => {
    expect(listVideosQuerySchema.safeParse({ limit: LIST_LIMIT_MAX }).success).toBe(true)
  })

  it('rejects negative offset', () => {
    expect(listVideosQuerySchema.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('coerces string offset to number', () => {
    const result = listVideosQuerySchema.parse({ offset: '10' })
    expect(result.offset).toBe(10)
  })
})

// ─── youtubeIdSchema ──────────────────────────────────────────────────────────

describe('youtubeIdSchema', () => {
  it('accepts valid 11-char YouTube ID', () => {
    expect(youtubeIdSchema.safeParse('dQw4w9WgXcQ').success).toBe(true)
  })

  it('accepts ID with underscores and hyphens', () => {
    expect(youtubeIdSchema.safeParse('abc_def-ghi').success).toBe(true)
  })

  it('rejects ID that is too short (10 chars)', () => {
    expect(youtubeIdSchema.safeParse('dQw4w9WgXc').success).toBe(false)
  })

  it('rejects ID that is too long (12 chars)', () => {
    expect(youtubeIdSchema.safeParse('dQw4w9WgXcQQ').success).toBe(false)
  })

  it('rejects ID with invalid characters', () => {
    expect(youtubeIdSchema.safeParse('dQw4w9WgX!Q').success).toBe(false)
  })

  it('rejects empty string', () => {
    expect(youtubeIdSchema.safeParse('').success).toBe(false)
  })

  it('accepts mixed case alphanumeric', () => {
    expect(youtubeIdSchema.safeParse('ABCabc12345').success).toBe(true)
  })
})

// ─── addVideoSchema ───────────────────────────────────────────────────────────

describe('addVideoSchema', () => {
  it('accepts valid YouTube URL', () => {
    expect(addVideoSchema.safeParse({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).success).toBe(true)
  })

  it('trims whitespace from URL', () => {
    const result = addVideoSchema.parse({ url: '  https://youtube.com/watch?v=abc  ' })
    expect(result.url).toBe('https://youtube.com/watch?v=abc')
  })

  it('rejects empty URL', () => {
    expect(addVideoSchema.safeParse({ url: '' }).success).toBe(false)
  })

  it('rejects invalid URL format', () => {
    expect(addVideoSchema.safeParse({ url: 'not-a-url' }).success).toBe(false)
  })

  it('rejects URL exceeding URL_MAX chars', () => {
    expect(addVideoSchema.safeParse({ url: 'https://example.com/' + 'a'.repeat(URL_MAX) }).success).toBe(false)
  })

  it('rejects missing url', () => {
    expect(addVideoSchema.safeParse({}).success).toBe(false)
  })
})

// ─── reorderSchema ────────────────────────────────────────────────────────────

describe('reorderSchema', () => {
  it('accepts single UUID', () => {
    expect(reorderSchema.safeParse({ ids: [VALID_UUID] }).success).toBe(true)
  })

  it('accepts up to 500 UUIDs', () => {
    const ids = Array.from({ length: 500 }, () => VALID_UUID)
    expect(reorderSchema.safeParse({ ids }).success).toBe(true)
  })

  it('rejects more than 500 UUIDs', () => {
    const ids = Array.from({ length: 501 }, () => VALID_UUID)
    expect(reorderSchema.safeParse({ ids }).success).toBe(false)
  })

  it('rejects empty array', () => {
    expect(reorderSchema.safeParse({ ids: [] }).success).toBe(false)
  })

  it('rejects non-UUID in ids', () => {
    expect(reorderSchema.safeParse({ ids: ['not-a-uuid'] }).success).toBe(false)
  })
})

// ─── MotivationVideoSchema ────────────────────────────────────────────────────

describe('MotivationVideoSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    youtube_id: 'dQw4w9WgXcQ',
    url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
    title: null,
    channel: null,
    thumbnail_url: null,
    position: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid video', () => {
    expect(MotivationVideoSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(MotivationVideoSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })

  it('rejects non-integer position', () => {
    expect(MotivationVideoSchema.safeParse({ ...valid, position: 1.5 }).success).toBe(false)
  })

  it('accepts nullable title', () => {
    expect(MotivationVideoSchema.safeParse({ ...valid, title: null }).success).toBe(true)
  })

  it('accepts string title', () => {
    expect(MotivationVideoSchema.safeParse({ ...valid, title: 'Rick Roll' }).success).toBe(true)
  })
})

// ─── VideoListResponseSchema ──────────────────────────────────────────────────

describe('VideoListResponseSchema', () => {
  it('accepts valid list response', () => {
    const valid = { videos: [], count: 0, total: 0, limit: 60, offset: 0 }
    expect(VideoListResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects negative count', () => {
    expect(VideoListResponseSchema.safeParse({ videos: [], count: -1, total: 0, limit: 60, offset: 0 }).success).toBe(false)
  })

  it('rejects limit of 0 (must be positive)', () => {
    expect(VideoListResponseSchema.safeParse({ videos: [], count: 0, total: 0, limit: 0, offset: 0 }).success).toBe(false)
  })
})

// ─── VideoSingleResponseSchema ────────────────────────────────────────────────

describe('VideoSingleResponseSchema', () => {
  const video = {
    id: VALID_UUID,
    user_id: 'u',
    youtube_id: 'dQw4w9WgXcQ',
    url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
    title: null,
    channel: null,
    thumbnail_url: null,
    position: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid single video response', () => {
    expect(VideoSingleResponseSchema.safeParse({ video }).success).toBe(true)
  })
})

// ─── VideoDeleteResponseSchema / ReorderResponseSchema ────────────────────────

describe('VideoDeleteResponseSchema', () => {
  it('accepts valid delete response', () => {
    expect(VideoDeleteResponseSchema.safeParse({ success: true, message: 'Deleted' }).success).toBe(true)
  })

  it('rejects success: false', () => {
    expect(VideoDeleteResponseSchema.safeParse({ success: false, message: 'Nope' }).success).toBe(false)
  })
})

describe('ReorderResponseSchema', () => {
  it('accepts { success: true }', () => {
    expect(ReorderResponseSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(ReorderResponseSchema.safeParse({ success: false }).success).toBe(false)
  })
})

// ─── MotivationSettingsSchema ─────────────────────────────────────────────────

describe('MotivationSettingsSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(MotivationSettingsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts onboardingCompleted boolean', () => {
    expect(MotivationSettingsSchema.safeParse({ onboardingCompleted: true }).success).toBe(true)
  })

  it('accepts autoplayNext boolean', () => {
    expect(MotivationSettingsSchema.safeParse({ autoplayNext: false }).success).toBe(true)
  })

  it('accepts valid defaultSort "custom"', () => {
    expect(MotivationSettingsSchema.safeParse({ defaultSort: 'custom' }).success).toBe(true)
  })

  it('accepts valid defaultSort "newest"', () => {
    expect(MotivationSettingsSchema.safeParse({ defaultSort: 'newest' }).success).toBe(true)
  })

  it('accepts valid defaultSort "oldest"', () => {
    expect(MotivationSettingsSchema.safeParse({ defaultSort: 'oldest' }).success).toBe(true)
  })

  it('rejects invalid defaultSort', () => {
    expect(MotivationSettingsSchema.safeParse({ defaultSort: 'alphabetical' }).success).toBe(false)
  })

  it('accepts valid gridDensity "compact"', () => {
    expect(MotivationSettingsSchema.safeParse({ gridDensity: 'compact' }).success).toBe(true)
  })

  it('accepts valid gridDensity "comfortable"', () => {
    expect(MotivationSettingsSchema.safeParse({ gridDensity: 'comfortable' }).success).toBe(true)
  })

  it('accepts valid gridDensity "spacious"', () => {
    expect(MotivationSettingsSchema.safeParse({ gridDensity: 'spacious' }).success).toBe(true)
  })

  it('rejects invalid gridDensity', () => {
    expect(MotivationSettingsSchema.safeParse({ gridDensity: 'dense' }).success).toBe(false)
  })

  it('rejects unknown extra keys (strict)', () => {
    expect(MotivationSettingsSchema.safeParse({ unknownField: true }).success).toBe(false)
  })
})

// ─── SettingsSavedSchema ──────────────────────────────────────────────────────

describe('SettingsSavedSchema', () => {
  it('accepts { success: true }', () => {
    expect(SettingsSavedSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(SettingsSavedSchema.safeParse({ success: false }).success).toBe(false)
  })
})
