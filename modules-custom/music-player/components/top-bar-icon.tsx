"use client"

import { Play, SkipForward, Square } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useMusicPlayerContextSafe } from "@/modules/music-player/components/music-player-context"

export default function MusicPlayerTopBarIcon({ isDragMode = false }: { isDragMode?: boolean }) {
  const router = useRouter()
  const context = useMusicPlayerContextSafe()
  const { isActive = false, isReady = false, currentSong = null, playlist = [], playNext = () => {}, pause = () => {}, resume = () => {} } = context ?? {}

  const dragItemClass = isDragMode
    ? "ring-1 ring-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)] rounded-lg"
    : ""

  const handleMainClick = () => {
    if (isDragMode) return

    if (playlist.length === 0) {
      router.push('/music-player')
      return
    }

    if (isActive) {
      pause()
    } else if (currentSong) {
      // Was paused, resume the current song
      resume()
    } else {
      // Nothing loaded yet, start from beginning
      playNext()
    }
  }

  const handleNextClick = () => {
    if (isDragMode) return
    playNext()
  }

  return (
    <div className="flex items-center gap-1">
      {/* Main button: Play when idle, Pause when active */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
            onClick={handleMainClick}
            disabled={!isReady && !isDragMode}
          >
            {isActive ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{playlist.length === 0 ? "Add Music" : isActive ? "Stop Music" : "Play Music"}</p>
        </TooltipContent>
      </Tooltip>

      {/* Next song button: only visible when active */}
      {isActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
              onClick={handleNextClick}
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Next Song</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
