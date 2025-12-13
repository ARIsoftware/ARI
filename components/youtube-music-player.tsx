"use client"

import * as React from "react"
import { useEffect, useRef, useState, createContext, useContext } from "react"

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

// Context for music player state
interface MusicPlayerContextType {
  isPlaying: boolean
  isReady: boolean
  togglePlayPause: () => void
}

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null)

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext)
  if (!context) {
    throw new Error("useMusicPlayer must be used within a MusicPlayerProvider")
  }
  return context
}

// Provider component that manages the hidden YouTube player
export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [mounted, setMounted] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)

  // Only render after mounting to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return

    // Load YouTube IFrame API script
    if (!window.YT && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(tag)
    }

    // Initialize player when API is ready
    window.onYouTubeIframeAPIReady = () => {
      window.isYouTubeAPIReady = true
      initializePlayer()
    }

    // If API is already loaded, initialize immediately
    if (window.YT && window.isYouTubeAPIReady) {
      initializePlayer()
    }

    return () => {
      // Cleanup on unmount
      if (window.youtubePlayer && typeof window.youtubePlayer.destroy === "function") {
        window.youtubePlayer.destroy()
      }
    }
  }, [mounted])

  const initializePlayer = () => {
    if (!playerRef.current || !window.YT) return

    // Create player if it doesn't exist
    if (!window.youtubePlayer) {
      window.youtubePlayer = new window.YT.Player(playerRef.current, {
        height: "0",
        width: "0",
        videoId: "ahawPLh4epk", // YouTube video ID
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
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true)
            } else if (
              event.data === window.YT.PlayerState.PAUSED ||
              event.data === window.YT.PlayerState.ENDED
            ) {
              setIsPlaying(false)
            }
          },
        },
      })
    }
  }

  const togglePlayPause = () => {
    if (typeof window === "undefined" || !window.youtubePlayer || !isReady) return

    if (isPlaying) {
      window.youtubePlayer.pauseVideo()
    } else {
      window.youtubePlayer.playVideo()
    }
  }

  return (
    <MusicPlayerContext.Provider value={{ isPlaying, isReady, togglePlayPause }}>
      {children}
      {/* Hidden YouTube player iframe container - only render after mounting */}
      {mounted && <div ref={playerRef} className="hidden" />}
    </MusicPlayerContext.Provider>
  )
}

// Legacy component for backwards compatibility (if needed elsewhere)
export function YouTubeMusicPlayer() {
  return null // No longer renders anything - use useMusicPlayer hook instead
}