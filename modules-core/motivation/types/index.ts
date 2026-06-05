export interface MotivationVideo {
  id: string
  user_id: string
  youtube_id: string
  url: string
  title: string | null
  channel: string | null
  thumbnail_url: string | null
  position: number
  created_at: string
  updated_at: string
}

export type SortOrder = 'custom' | 'newest' | 'oldest'

export type GridDensity = 'compact' | 'comfortable' | 'spacious'

export interface MotivationSettings {
  onboardingCompleted: boolean
  autoplayNext: boolean
  defaultSort: SortOrder
  gridDensity: GridDensity
}

export interface AddVideoRequest {
  url: string
}

export interface ReorderRequest {
  ids: string[]
}

export interface ApiErrorResponse {
  error: string
  details?: unknown
}
