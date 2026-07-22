import { describe, it, expect } from 'vitest'
import {
  createSongSchema,
  updateSongSchema,
  songIdQuerySchema,
  reorderSongsSchema,
  SongSchema,
  SongListResponseSchema,
  SongSingleResponseSchema,
  SuccessResponseSchema,
  MusicPlayerSettingsSchema,
} from '@/modules-core/music-player/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const VALID_YT_ID = 'dQw4w9WgXcQ' // exactly 11 chars

// ─── createSongSchema ─────────────────────────────────────────────────────────

describe('createSongSchema', () => {
  it('accepts valid song', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: VALID_YT_ID, title: 'Never Gonna Give You Up' }).success).toBe(true)
  })

  // youtube_video_id
  it('rejects YouTube ID shorter than 11 chars', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: 'abc123', title: 'Song' }).success).toBe(false)
  })

  it('rejects YouTube ID longer than 11 chars', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: 'dQw4w9WgXcQQ', title: 'Song' }).success).toBe(false)
  })

  it('rejects YouTube ID with invalid characters', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: 'dQw4w9WgX!Q', title: 'Song' }).success).toBe(false)
  })

  it('accepts YouTube ID with underscore and hyphen', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: 'abc_def-ghi', title: 'Song' }).success).toBe(true)
  })

  it('rejects missing youtube_video_id', () => {
    expect(createSongSchema.safeParse({ title: 'Song' }).success).toBe(false)
  })

  // title
  it('rejects empty title', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: VALID_YT_ID, title: '' }).success).toBe(false)
  })

  it('rejects title exceeding 500 chars', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: VALID_YT_ID, title: 'a'.repeat(501) }).success).toBe(false)
  })

  it('accepts title at exactly 500 chars', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: VALID_YT_ID, title: 'a'.repeat(500) }).success).toBe(true)
  })

  it('rejects missing title', () => {
    expect(createSongSchema.safeParse({ youtube_video_id: VALID_YT_ID }).success).toBe(false)
  })
})

// ─── updateSongSchema ─────────────────────────────────────────────────────────

describe('updateSongSchema', () => {
  it('accepts valid title', () => {
    expect(updateSongSchema.safeParse({ title: 'New Title' }).success).toBe(true)
  })

  it('rejects empty title', () => {
    expect(updateSongSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('rejects title exceeding 500 chars', () => {
    expect(updateSongSchema.safeParse({ title: 'a'.repeat(501) }).success).toBe(false)
  })

  it('rejects missing title', () => {
    expect(updateSongSchema.safeParse({}).success).toBe(false)
  })
})

// ─── songIdQuerySchema ────────────────────────────────────────────────────────

describe('songIdQuerySchema', () => {
  it('accepts valid UUID', () => {
    expect(songIdQuerySchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(songIdQuerySchema.safeParse({ id: 'not-uuid' }).success).toBe(false)
  })

  it('rejects missing id', () => {
    expect(songIdQuerySchema.safeParse({}).success).toBe(false)
  })
})

// ─── reorderSongsSchema ───────────────────────────────────────────────────────

describe('reorderSongsSchema', () => {
  it('accepts single UUID', () => {
    expect(reorderSongsSchema.safeParse({ orderedIds: [VALID_UUID] }).success).toBe(true)
  })

  it('accepts up to 500 UUIDs', () => {
    const orderedIds = Array.from({ length: 500 }, () => VALID_UUID)
    expect(reorderSongsSchema.safeParse({ orderedIds }).success).toBe(true)
  })

  it('rejects more than 500 UUIDs', () => {
    const orderedIds = Array.from({ length: 501 }, () => VALID_UUID)
    expect(reorderSongsSchema.safeParse({ orderedIds }).success).toBe(false)
  })

  it('rejects empty array', () => {
    expect(reorderSongsSchema.safeParse({ orderedIds: [] }).success).toBe(false)
  })

  it('rejects non-UUID in orderedIds', () => {
    expect(reorderSongsSchema.safeParse({ orderedIds: ['not-uuid'] }).success).toBe(false)
  })
})

// ─── SongSchema ───────────────────────────────────────────────────────────────

describe('SongSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    youtube_video_id: VALID_YT_ID,
    title: 'Never Gonna Give You Up',
    position: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid song', () => {
    expect(SongSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(SongSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })

  it('rejects non-integer position', () => {
    expect(SongSchema.safeParse({ ...valid, position: 1.5 }).success).toBe(false)
  })

  it('accepts negative position (ordering)', () => {
    expect(SongSchema.safeParse({ ...valid, position: -1 }).success).toBe(true)
  })
})

// ─── SongListResponseSchema ───────────────────────────────────────────────────

describe('SongListResponseSchema', () => {
  it('accepts empty songs array', () => {
    expect(SongListResponseSchema.safeParse({ songs: [] }).success).toBe(true)
  })
})

// ─── SongSingleResponseSchema ─────────────────────────────────────────────────

describe('SongSingleResponseSchema', () => {
  const song = {
    id: VALID_UUID,
    user_id: 'u',
    youtube_video_id: VALID_YT_ID,
    title: 'Song',
    position: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid single song response', () => {
    expect(SongSingleResponseSchema.safeParse({ song }).success).toBe(true)
  })
})

// ─── SuccessResponseSchema ────────────────────────────────────────────────────

describe('SuccessResponseSchema', () => {
  it('accepts { success: true }', () => {
    expect(SuccessResponseSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(SuccessResponseSchema.safeParse({ success: false }).success).toBe(false)
  })
})

// ─── MusicPlayerSettingsSchema ────────────────────────────────────────────────

describe('MusicPlayerSettingsSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(MusicPlayerSettingsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts onboardingCompleted boolean', () => {
    expect(MusicPlayerSettingsSchema.safeParse({ onboardingCompleted: true }).success).toBe(true)
  })

  it('accepts onboardingCompleted false', () => {
    expect(MusicPlayerSettingsSchema.safeParse({ onboardingCompleted: false }).success).toBe(true)
  })

  it('rejects unknown extra keys (strict)', () => {
    expect(MusicPlayerSettingsSchema.safeParse({ unknownField: 'value' }).success).toBe(false)
  })
})
