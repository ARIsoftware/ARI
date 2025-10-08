"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause } from "lucide-react"
import { Button } from "@/components/ui/button"

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

export function YouTubeMusicPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Load YouTube IFrame API script
    if (!window.YT && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      const firstScriptTag = document.getElementsByTagName("script")[0]
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
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
  }, [])

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
    <>
      <div ref={playerRef} className="hidden" />
      <Button
        onClick={togglePlayPause}
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={!isReady}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
    </>
  )
}