'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MotivationVideo } from '../types'

interface PlayerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playlist: MotivationVideo[]
  startIndex: number
  defaultAutoplayNext: boolean
}

// Minimal subset of the YT IFrame API we use. We deliberately don't augment
// `window.YT` here — the music-player module already does so with a looser
// shape; redeclaring causes "Subsequent property declarations" TS errors.
interface YTPlayer {
  loadVideoById: (id: string) => void
  destroy: () => void
}

interface YTPlayerEvent {
  data: number
}

interface YTPlayerOptions {
  videoId: string
  playerVars?: Record<string, number | string>
  events?: {
    onReady?: (event: { target: YTPlayer }) => void
    onStateChange?: (event: YTPlayerEvent) => void
  }
}

interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayer
}

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api'
const PLAYER_STATE_ENDED = 0

// Module-level promise so the script is loaded exactly once per page.
let iframeApiPromise: Promise<YTNamespace> | null = null

// Cast `window` once so we can read/write the YT globals without colliding
// with whichever loose typing another module has installed.
type WindowWithYT = Window & {
  YT?: { Player?: unknown }
  onYouTubeIframeAPIReady?: () => void
}

function loadIframeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube IFrame API requires browser'))
  }
  const w = window as WindowWithYT
  if (w.YT && typeof w.YT.Player === 'function') {
    return Promise.resolve(w.YT as YTNamespace)
  }
  if (iframeApiPromise) return iframeApiPromise

  iframeApiPromise = new Promise<YTNamespace>((resolve) => {
    // Chain any previously-registered callback so we don't clobber another caller.
    const previous = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (w.YT) resolve(w.YT as YTNamespace)
    }
    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement('script')
      script.src = IFRAME_API_SRC
      script.async = true
      document.head.appendChild(script)
    }
  })
  return iframeApiPromise
}

export function PlayerDialog({
  open,
  onOpenChange,
  playlist,
  startIndex,
  defaultAutoplayNext,
}: PlayerDialogProps) {
  const playerHostId = useId().replace(/:/g, '_')
  const playerRef = useRef<YTPlayer | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = useState(startIndex)
  const [autoplayNext, setAutoplayNext] = useState(defaultAutoplayNext)

  // Keep the autoplay flag's latest value visible inside the YT event handler
  // (which captures the value at .Player construction time).
  const autoplayNextRef = useRef(autoplayNext)
  useEffect(() => { autoplayNextRef.current = autoplayNext }, [autoplayNext])

  const playlistRef = useRef(playlist)
  useEffect(() => { playlistRef.current = playlist }, [playlist])

  const indexRef = useRef(index)
  useEffect(() => { indexRef.current = index }, [index])

  // Reset on open transition only — not whenever defaultAutoplayNext changes
  // (e.g. a background settings refetch would otherwise clobber the user's
  // in-session toggle).
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setIndex(startIndex)
      setAutoplayNext(defaultAutoplayNext)
    }
    wasOpenRef.current = open
  }, [open, startIndex, defaultAutoplayNext])

  const current = playlist[index]

  const advance = useCallback((delta: number) => {
    const list = playlistRef.current
    if (list.length === 0) return
    const nextIdx = (indexRef.current + delta + list.length) % list.length
    setIndex(nextIdx)
    const nextVideo = list[nextIdx]
    if (playerRef.current && nextVideo) {
      playerRef.current.loadVideoById(nextVideo.youtube_id)
    }
  }, [])

  // Mount the YT player when the dialog opens; tear it down when it closes.
  useEffect(() => {
    if (!open) return
    const initialVideo = playlistRef.current[indexRef.current]
    if (!initialVideo) return

    // Wrap the destroyable in a ref so the cleanup callback below can reach
    // a player created after the cleanup is captured by React but before
    // the IFrame API promise resolves (otherwise it leaks the iframe).
    const playerHolder: { player: YTPlayer | null; cancelled: boolean } = {
      player: null,
      cancelled: false,
    }

    loadIframeApi().then((YT) => {
      if (playerHolder.cancelled) return
      const host = mountRef.current
      if (!host) return

      host.innerHTML = ''
      const target = document.createElement('div')
      target.id = playerHostId
      host.appendChild(target)

      const player = new YT.Player(target, {
        videoId: initialVideo.youtube_id,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (event) => {
            if (event.data === PLAYER_STATE_ENDED && autoplayNextRef.current) {
              advance(1)
            }
          },
        },
      })
      playerHolder.player = player
      playerRef.current = player

      // Cleanup may have flipped `cancelled` while we were constructing —
      // destroy immediately if so to avoid leaking the iframe.
      if (playerHolder.cancelled) {
        try { player.destroy() } catch { /* iframe already gone */ }
        playerRef.current = null
      }
    })

    return () => {
      playerHolder.cancelled = true
      try {
        playerHolder.player?.destroy()
      } catch {
        // ignore destroy errors — usually means iframe already gone
      }
      playerRef.current = null
    }
    // Intentionally only re-runs when `open` flips. Video changes are handled
    // by loadVideoById in `advance`, not by remounting the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!current) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[96vw] max-w-[96vw] h-[92vh] max-h-[92vh]
          p-0 gap-0 overflow-hidden bg-black
          border border-[#222]
          flex flex-col
        "
      >
        <VisuallyHidden>
          <DialogTitle>{current.title ?? 'Playing video'}</DialogTitle>
        </VisuallyHidden>

        {/* Video fills the entire dialog. The YT IFrame API replaces the inner
            div with an <iframe>, which we force to absolute-fill the host. */}
        <div
          ref={mountRef}
          className="
            relative flex-1 min-h-0 w-full bg-black
            [&_iframe]:absolute [&_iframe]:inset-0
            [&_iframe]:w-full [&_iframe]:h-full
          "
        />

        {/* Slim translucent control bar overlaid at the bottom of the video. */}
        <div
          className="
            absolute inset-x-0 bottom-0 z-10
            bg-black/70 backdrop-blur-sm text-white
            px-4 py-2.5
            flex items-center gap-4
          "
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug truncate">
              {current.title ?? 'Untitled video'}
            </p>
            {current.channel && (
              <p className="text-xs text-white/70 truncate">
                {current.channel} · {index + 1} of {playlist.length}
              </p>
            )}
            {!current.channel && (
              <p className="text-xs text-white/70">
                {index + 1} of {playlist.length}
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15 hover:text-white shrink-0"
            onClick={() => advance(-1)}
            disabled={playlist.length < 2}
            aria-label="Previous video"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15 hover:text-white shrink-0"
            onClick={() => advance(1)}
            disabled={playlist.length < 2}
            aria-label="Next video"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-white/20">
            <Label htmlFor="autoplay-next" className="text-xs text-white/80">
              Autoplay next
            </Label>
            <Switch
              id="autoplay-next"
              checked={autoplayNext}
              onCheckedChange={setAutoplayNext}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
