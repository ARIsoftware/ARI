import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MusicPlaylistEntry, MusicPlayerSettings } from '@/modules/music-player/types'

const SONGS_KEY = ['music-player-songs']
const SETTINGS_KEY = ['music-player-settings']

export function useMusicPlaylistSongs() {
  return useQuery({
    queryKey: SONGS_KEY,
    queryFn: async (): Promise<MusicPlaylistEntry[]> => {
      const res = await fetch('/api/modules/music-player/songs')
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to fetch songs')
      }
      const data = await res.json()
      return data.songs || []
    },
  })
}

export function useCreateSong() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { youtube_video_id: string; title: string }): Promise<MusicPlaylistEntry> => {
      const res = await fetch('/api/modules/music-player/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: { message: string }) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to add song')
      }
      const json = await res.json()
      return json.song
    },
    onMutate: async (newSong) => {
      await queryClient.cancelQueries({ queryKey: SONGS_KEY })
      const previous = queryClient.getQueryData<MusicPlaylistEntry[]>(SONGS_KEY)

      queryClient.setQueryData<MusicPlaylistEntry[]>(SONGS_KEY, (old = []) => [
        ...old,
        {
          id: 'temp-' + Date.now(),
          user_id: '',
          youtube_video_id: newSong.youtube_video_id,
          title: newSong.title,
          position: old.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      return { previous }
    },
    onError: (_err, _newSong, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SONGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SONGS_KEY })
    },
  })
}

export function useUpdateSong() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }): Promise<MusicPlaylistEntry> => {
      const res = await fetch(`/api/modules/music-player/songs?id=${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: { message: string }) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to update song')
      }
      const json = await res.json()
      return json.song
    },
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: SONGS_KEY })
      const previous = queryClient.getQueryData<MusicPlaylistEntry[]>(SONGS_KEY)

      queryClient.setQueryData<MusicPlaylistEntry[]>(SONGS_KEY, (old = []) =>
        old.map(s => s.id === id ? { ...s, title } : s)
      )

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SONGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SONGS_KEY })
    },
  })
}

export function useDeleteSong() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/music-player/songs?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete song')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: SONGS_KEY })
      const previous = queryClient.getQueryData<MusicPlaylistEntry[]>(SONGS_KEY)

      queryClient.setQueryData<MusicPlaylistEntry[]>(SONGS_KEY, (old = []) =>
        old.filter(s => s.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SONGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SONGS_KEY })
    },
  })
}

export function useReorderSongs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderedIds: string[]): Promise<void> => {
      const res = await fetch('/api/modules/music-player/songs/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to reorder songs')
      }
    },
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: SONGS_KEY })
      const previous = queryClient.getQueryData<MusicPlaylistEntry[]>(SONGS_KEY)

      if (previous) {
        const songMap = new Map(previous.map(s => [s.id, s]))
        const reordered = orderedIds
          .map((id, i) => {
            const song = songMap.get(id)
            return song ? { ...song, position: i } : null
          })
          .filter(Boolean) as MusicPlaylistEntry[]
        queryClient.setQueryData(SONGS_KEY, reordered)
      }

      return { previous }
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SONGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SONGS_KEY })
    },
  })
}

export function useMusicPlayerSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<MusicPlayerSettings>> => {
      const res = await fetch('/api/modules/music-player/settings')
      if (!res.ok) return {}
      return await res.json()
    },
  })
}

export function useUpdateMusicPlayerSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<MusicPlayerSettings>): Promise<void> => {
      const res = await fetch('/api/modules/music-player/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to save settings')
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<MusicPlayerSettings>>(SETTINGS_KEY)

      queryClient.setQueryData<Partial<MusicPlayerSettings>>(SETTINGS_KEY, (old = {}) => ({
        ...old,
        ...newSettings,
      }))

      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SETTINGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}
