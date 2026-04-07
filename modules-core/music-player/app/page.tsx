'use client'

import { useState, useEffect } from 'react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Music, Plus, Trash2, Pencil, Check, X, GripVertical, Play } from 'lucide-react'
import {
  useMusicPlaylistSongs,
  useCreateSong,
  useUpdateSong,
  useDeleteSong,
  useReorderSongs,
  useMusicPlayerSettings,
  useUpdateMusicPlayerSettings,
} from '@/modules/music-player/hooks/use-music-player'
import { useMusicPlayerContextOptional } from '@/modules/music-player/components/music-player-context'
import type { MusicPlaylistEntry } from '@/modules/music-player/types'

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

async function fetchYouTubeTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`)
    if (res.ok) {
      const data = await res.json()
      if (data.title) return data.title
    }
  } catch {}
  return `YouTube Video (${videoId})`
}

export default function MusicPlayerPage() {
  const { toast } = useToast()
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')

  const { data: songs = [], isLoading } = useMusicPlaylistSongs()
  const createSong = useCreateSong()
  const updateSong = useUpdateSong()
  const deleteSong = useDeleteSong()
  const reorderSongs = useReorderSongs()

  const { data: settings, isLoading: settingsLoading } = useMusicPlayerSettings()
  const updateSettings = useUpdateMusicPlayerSettings()

  const musicPlayer = useMusicPlayerContextOptional()
  const playSong = musicPlayer?.playSong
  const currentSong = musicPlayer?.currentSong ?? null
  const isPlaying = musicPlayer?.isPlaying ?? false

  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)
  const [urlError, setUrlError] = useState('')

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Load random quote
  useEffect(() => {
    if (!quotesEnabled || quotesLoading) return
    let cancelled = false
    fetch('/api/modules/quotes/quotes')
      .then((res) => (res.ok ? res.json() : []))
      .then((quotes) => {
        if (!cancelled && quotes.length > 0) {
          setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [quotesEnabled, quotesLoading])

  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault()
    setUrlError('')

    const videoId = extractYouTubeId(youtubeUrl.trim())
    if (!videoId) {
      setUrlError('Please enter a valid YouTube URL or video ID')
      return
    }

    setIsAdding(true)
    try {
      const title = await fetchYouTubeTitle(videoId)
      createSong.mutate(
        { youtube_video_id: videoId, title },
        {
          onSuccess: () => {
            setYoutubeUrl('')
          },
          onError: (err) => {
            toast({ variant: 'destructive', title: 'Failed to add song', description: err.message })
          },
        }
      )
    } finally {
      setIsAdding(false)
    }
  }

  const handleEdit = (song: MusicPlaylistEntry) => {
    setEditingId(song.id)
    setEditTitle(song.title)
  }

  const handleSaveEdit = (id: string) => {
    if (!editTitle.trim()) return
    updateSong.mutate(
      { id, title: editTitle.trim() },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => toast({ variant: 'destructive', title: 'Failed to update', description: err.message }),
      }
    )
  }

  const handleDelete = (id: string) => {
    deleteSong.mutate(id, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to delete', description: err.message }),
    })
  }

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }

    const reordered = [...songs]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(index, 0, moved)

    const orderedIds = reordered.map(s => s.id)
    reorderSongs.mutate(orderedIds, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to reorder', description: err.message }),
    })

    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleSetup = () => {
    updateSettings.mutate(
      { onboardingCompleted: true },
      {
        onError: () => toast({ variant: 'destructive', title: 'Failed to save settings' }),
      }
    )
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!settings?.onboardingCompleted) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Music Player</CardTitle>
            <CardDescription>
              Play YouTube music in the background while you work. Add YouTube links to build your playlist,
              then use the top bar controls to play, skip, and pause.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-primary">1</span>
                </div>
                <p>Add YouTube links on this page to build your playlist</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-primary">2</span>
                </div>
                <p>Click the <strong>Play</strong> button in the top bar to start music</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-primary">3</span>
                </div>
                <p>Click <strong>Play</strong> again to skip to the next song. Use <strong>Pause</strong> to pause.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-primary">4</span>
                </div>
                <p>Music continues playing as you navigate between pages</p>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleSetup}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Get Started
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-medium">Music</h1>
        {quotesEnabled && randomQuote && (
          <p className="text-sm text-[#aa2020] mt-1">
            {randomQuote.quote}
          </p>
        )}
      </div>

      {/* Add Song */}
      <Card>
        <CardHeader>
          <CardTitle>Add Song</CardTitle>
          <CardDescription>Paste a YouTube URL to add it to your playlist</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddSong} className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Input
                value={youtubeUrl}
                onChange={(e) => { setYoutubeUrl(e.target.value); setUrlError('') }}
                placeholder="https://youtube.com/watch?v=... or video ID"
                disabled={isAdding || createSong.isPending}
                className={urlError ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
              {urlError && <p className="text-xs text-red-500">{urlError}</p>}
            </div>
            <Button type="submit" disabled={isAdding || createSong.isPending || !youtubeUrl.trim()}>
              {isAdding || createSong.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Playlist */}
      <Card>
        <CardHeader>
          <CardTitle>Playlist</CardTitle>
          <CardDescription>
            {songs.length === 0 ? 'No songs yet' : `${songs.length} song${songs.length === 1 ? '' : 's'}`}
            {currentSong && isPlaying && ` \u2022 Now playing: ${currentSong.title}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Your playlist is empty. Add a YouTube link above to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {songs.map((song, index) => (
                <div
                  key={song.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                  className={`
                    group relative rounded-lg border overflow-hidden transition-all cursor-grab active:cursor-grabbing
                    ${currentSong?.id === song.id && isPlaying ? 'ring-2 ring-primary border-primary' : 'hover:border-foreground/20'}
                    ${dragOverIndex === index ? 'ring-2 ring-blue-400' : ''}
                    ${dragIndex === index ? 'opacity-50' : ''}
                  `}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative aspect-video bg-muted cursor-pointer"
                    onClick={() => playSong?.(song)}
                  >
                    <img
                      src={`https://img.youtube.com/vi/${song.youtube_video_id}/hqdefault.jpg`}
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                    {currentSong?.id === song.id && isPlaying && (
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                        Playing
                      </div>
                    )}
                    {/* Drag handle */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical className="w-5 h-5 text-white drop-shadow-lg" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    {editingId === song.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(song.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(song.id)}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium line-clamp-2 flex-1">{song.title}</p>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEdit(song)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(song.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
