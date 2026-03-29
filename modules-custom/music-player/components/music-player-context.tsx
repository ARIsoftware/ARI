"use client"

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react"
import type { MusicPlaylistEntry } from "../types"

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

export function useMusicPlayerContextSafe() {
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

  useEffect(() => {
    if (!mounted || !isAuthenticated || typeof window === "undefined") return

    if (!window.YT && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(tag)
    }

    const onReady = () => {
      window.isYouTubeAPIReady = true
      initializePlayer()
    }

    window.onYouTubeIframeAPIReady = onReady

    if (window.YT && window.isYouTubeAPIReady) {
      initializePlayer()
    }

    return () => {
      if (window.onYouTubeIframeAPIReady === onReady) {
        window.onYouTubeIframeAPIReady = undefined
      }
      if (window.youtubePlayer && typeof window.youtubePlayer.destroy === "function") {
        window.youtubePlayer.destroy()
        window.youtubePlayer = undefined
      }
      setIsReady(false)
      setIsPlaying(false)
    }
  }, [mounted, isAuthenticated, initializePlayer])

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
    loadVideo(song.youtube_video_id)
  }, [loadVideo])

  const playNext = useCallback(() => {
    const pl = playlistRef.current
    if (pl.length === 0) return

    setIsActive(true)
    const curId = currentSongIdRef.current
    const curIdx = curId ? pl.findIndex(s => s.id === curId) : -1

    if (curIdx < 0) {
      // Nothing playing, start from beginning
      const first = pl[0]
      setCurrentSongId(first.id)
      currentSongIdRef.current = first.id
      loadVideo(first.youtube_video_id)
    } else {
      const nextIdx = (curIdx + 1) % pl.length
      const next = pl[nextIdx]
      setCurrentSongId(next.id)
      currentSongIdRef.current = next.id
      loadVideo(next.youtube_video_id)
    }
  }, [loadVideo])

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
