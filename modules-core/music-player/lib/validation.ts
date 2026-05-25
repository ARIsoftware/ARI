import { z } from 'zod'
import '@/lib/openapi/registry'

const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/
const uuidSchema = z.string().uuid('Invalid song id format')

export const createSongSchema = z.object({
  youtube_video_id: z.string().regex(YOUTUBE_VIDEO_ID_REGEX, 'Invalid YouTube video ID (must be 11 characters: A-Z, a-z, 0-9, _ or -)'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
}).openapi('CreateSongBody')

export const updateSongSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
}).openapi('UpdateSongBody')

export const songIdQuerySchema = z.object({
  id: uuidSchema,
})

export const reorderSongsSchema = z.object({
  orderedIds: z.array(uuidSchema).min(1).max(500),
}).openapi('ReorderSongsBody')

export const SongSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  youtube_video_id: z.string(),
  title: z.string(),
  position: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('Song')

export const SongListResponseSchema = z.object({
  songs: z.array(SongSchema),
}).openapi('SongListResponse')

export const SongSingleResponseSchema = z.object({
  song: SongSchema,
}).openapi('SongSingleResponse')

export const SuccessResponseSchema = z.object({
  success: z.literal(true),
}).openapi('MusicPlayerSuccessResponse')

export const MusicPlayerSettingsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
}).strict().openapi('MusicPlayerSettings')
