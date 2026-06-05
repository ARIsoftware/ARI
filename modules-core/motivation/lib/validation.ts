import { z } from 'zod'
import '@/lib/openapi/registry'

export const uuidSchema = z.string().uuid('Invalid video id format')

export const URL_MAX = 2048
const REORDER_MAX = 500

// YouTube IDs are exactly 11 chars from [a-zA-Z0-9_-]. Use this everywhere we
// read or write the youtube_id field.
export const youtubeIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid YouTube video ID')

export const addVideoSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, 'YouTube URL is required')
      .url('Must be a valid URL')
      .max(URL_MAX, `URL must be ${URL_MAX} characters or fewer`),
  })
  .openapi('MotivationAddVideoBody')

export const reorderSchema = z
  .object({
    ids: z
      .array(uuidSchema)
      .min(1, 'At least one video id is required')
      .max(REORDER_MAX, `Cannot reorder more than ${REORDER_MAX} videos at once`),
  })
  .openapi('MotivationReorderBody')

export const MotivationVideoSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string(),
    youtube_id: z.string(),
    url: z.string(),
    title: z.string().nullable(),
    channel: z.string().nullable(),
    thumbnail_url: z.string().nullable(),
    position: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('MotivationVideo')

export const VideoListResponseSchema = z
  .object({
    videos: z.array(MotivationVideoSchema),
    count: z.number().int().nonnegative(),
  })
  .openapi('MotivationVideoListResponse')

export const VideoSingleResponseSchema = z
  .object({
    video: MotivationVideoSchema,
  })
  .openapi('MotivationVideoSingleResponse')

export const VideoDeleteResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
  })
  .openapi('MotivationDeleteResponse')

export const ReorderResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi('MotivationReorderResponse')

export const MotivationSettingsSchema = z
  .object({
    onboardingCompleted: z.boolean().optional(),
    autoplayNext: z.boolean().optional(),
    defaultSort: z.enum(['custom', 'newest', 'oldest']).optional(),
    gridDensity: z.enum(['compact', 'comfortable', 'spacious']).optional(),
  })
  .strict()
  .openapi('MotivationSettings')

export const SettingsSavedSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi('MotivationSettingsSaved')
