export interface MusicPlaylistEntry {
  id: string
  user_id: string
  youtube_video_id: string
  title: string
  position: number
  created_at: string
  updated_at: string
}

export interface MusicPlayerSettings {
  onboardingCompleted: boolean
}
