"use client"

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react"
import type { MusicPlaylistEntry } from "@/modules/music-player/types"

const PlaylistSync = lazy(() => import("./playlist-sync").then(m => ({ default: m.PlaylistSync })))

interface YT {
  Player: any
  PlayerState: {
    PLAYING: number
    PAUSED: number
    ENDED: number
  }
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void
    YT?: YT
    youtubePlayer?: any
    isYouTubeAPIReady?: boolean
  }
}

interface MusicPlayerContextType {
  isPlaying: boolean
  isActive: boolean
  isReady: boolean
  currentSong: MusicPlaylistEntry | null
  playlist: MusicPlaylistEntry[]
  setPlaylist: (songs: MusicPlaylistEntry[]) => void
  playNext: () => void
  pause: () => void
  resume: () => void
  playSong: (song: MusicPlaylistEntry) => void
}

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null)

export function useMusicPlayerContext() {
  const context = useContext(MusicPlayerContext)
  if (!context) {
    throw new Error("useMusicPlayerContext must be used within MusicPlayerContextProvider")
  }
  return context
}

/** Returns the music player context, or null if outside the provider (e.g. during SSR). */
export function useMusicPlayerContextOptional() {
  return useContext(MusicPlayerContext)
}

export function MusicPlayerContextProvider({ children, isAuthenticated = false }: { children: React.ReactNode; isAuthenticated?: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [playlist, setPlaylistState] = useState<MusicPlaylistEntry[]>([])
  const [currentSongId, setCurrentSongId] = useState<string | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const playlistRef = useRef<MusicPlaylistEntry[]>([])
  const currentSongIdRef = useRef<string | null>(null)

  useEffect(() => {
    playlistRef.current = playlist
  }, [playlist])

  useEffect(() => {
    currentSongIdRef.current = currentSongId
  }, [currentSongId])

  const currentSong = useMemo(() => {
    if (!currentSongId) return null
    return playlist.find(s => s.id === currentSongId) || null
  }, [currentSongId, playlist])

  useEffect(() => {
    setMounted(true)
  }, [])

  const pendingVideoRef = useRef<string | null>(null)

  const loadVideo = useCallback((videoId: string) => {
    if (!window.youtubePlayer || !isReady) return
    window.youtubePlayer.loadVideoById(videoId)
  }, [isReady])

  const initializePlayer = useCallback(() => {
    if (!playerRef.current || !window.YT) return
    if (window.youtubePlayer) {
      setIsReady(true)
      return
    }

    window.youtubePlayer = new window.YT.Player(playerRef.current, {
      height: "0",
      width: "0",
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
      },
      events: {
        onReady: () => {
          setIsReady(true)
          if (pendingVideoRef.current) {
            window.youtubePlayer?.loadVideoById(pendingVideoRef.current)
            pendingVideoRef.current = null
          }
        },
        onStateChange: (event: any) => {
          const YTState = window.YT?.PlayerState
          if (!YTState) return

          if (event.data === YTState.PLAYING) {
            setIsPlaying(true)
          } else if (event.data === YTState.PAUSED) {
            setIsPlaying(false)
          } else if (event.data === YTState.ENDED) {
            setIsPlaying(false)
            const pl = playlistRef.current
            const curId = currentSongIdRef.current
            if (pl.length > 0) {
              const curIdx = curId ? pl.findIndex(s => s.id === curId) : -1
              const nextIdx = (curIdx + 1) % pl.length
              const nextSong = pl[nextIdx]
              currentSongIdRef.current = nextSong.id
              setCurrentSongId(nextSong.id)
              window.youtubePlayer?.loadVideoById(nextSong.youtube_video_id)
            }
          }
        },
      },
    })
  }, [])

  const ensureYouTubeAPI = useCallback((videoId?: string) => {
    if (typeof window === "undefined") return
    if (videoId) pendingVideoRef.current = videoId

    if (window.YT && window.isYouTubeAPIReady) {
      initializePlayer()
      return
    }

    window.onYouTubeIframeAPIReady = () => {
      window.isYouTubeAPIReady = true
      initializePlayer()
    }

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(tag)
    }
  }, [initializePlayer])

  useEffect(() => {
    return () => {
      if (window.onYouTubeIframeAPIReady) {
        window.onYouTubeIframeAPIReady = undefined
      }
      if (window.youtubePlayer && typeof window.youtubePlayer.destroy === "function") {
        window.youtubePlayer.destroy()
        window.youtubePlayer = undefined
      }
      setIsReady(false)
      setIsPlaying(false)
    }
  }, [])

  const setPlaylist = useCallback((songs: MusicPlaylistEntry[]) => {
    setPlaylistState(songs)
    playlistRef.current = songs

    // If current song was removed from playlist, clear it
    const curId = currentSongIdRef.current
    if (curId && !songs.find(s => s.id === curId)) {
      currentSongIdRef.current = null
      setCurrentSongId(null)
    }
  }, [])

  const playSong = useCallback((song: MusicPlaylistEntry) => {
    setCurrentSongId(song.id)
    currentSongIdRef.current = song.id
    setIsActive(true)
    if (isReady) {
      loadVideo(song.youtube_video_id)
    } else {
      ensureYouTubeAPI(song.youtube_video_id)
    }
  }, [isReady, loadVideo, ensureYouTubeAPI])

  const playNext = useCallback(() => {
    const pl = playlistRef.current
    if (pl.length === 0) return

    setIsActive(true)
    const curId = currentSongIdRef.current
    const curIdx = curId ? pl.findIndex(s => s.id === curId) : -1

    let targetSong: MusicPlaylistEntry
    if (curIdx < 0) {
      targetSong = pl[0]
    } else {
      targetSong = pl[(curIdx + 1) % pl.length]
    }
    setCurrentSongId(targetSong.id)
    currentSongIdRef.current = targetSong.id
    if (isReady) {
      loadVideo(targetSong.youtube_video_id)
    } else {
      ensureYouTubeAPI(targetSong.youtube_video_id)
    }
  }, [isReady, loadVideo, ensureYouTubeAPI])

  const pause = useCallback(() => {
    if (window.youtubePlayer) {
      window.youtubePlayer.pauseVideo()
    }
    setIsActive(false)
  }, [])

  const resume = useCallback(() => {
    if (window.youtubePlayer) {
      window.youtubePlayer.playVideo()
    }
    setIsActive(true)
  }, [])

  const value = useMemo(() => ({
    isPlaying,
    isActive,
    isReady,
    currentSong,
    playlist,
    setPlaylist,
    playNext,
    pause,
    resume,
    playSong,
  }), [isPlaying, isActive, isReady, currentSong, playlist, setPlaylist, playNext, pause, resume, playSong])

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      {mounted && isAuthenticated && <div ref={playerRef} className="absolute w-0 h-0 overflow-hidden" />}
      {mounted && isAuthenticated && (
        <Suspense fallback={null}>
          <PlaylistSync />
        </Suspense>
      )}
    </MusicPlayerContext.Provider>
  )
}
