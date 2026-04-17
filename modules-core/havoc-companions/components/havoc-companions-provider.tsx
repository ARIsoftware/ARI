'use client'

/**
 * Havoc Companions Module — Global Context Provider
 *
 * Mounts a fixed-position transparent canvas covering the entire viewport
 * and runs:
 *  1. A requestAnimationFrame loop that walks the 3 companions around in
 *     2D, bouncing off all four edges
 *  2. A setTimeout chain that occasionally bumps a random DOM element
 *
 * On first run with no persisted settings, generates 3 random companions
 * and saves them so subsequent reloads keep the same trio (so naming
 * sticks). Mischief is NOT persisted — it lives only as inline custom-
 * property styles on DOM nodes and naturally resets on reload.
 *
 * Both this provider and the /havoc-companions page consume the same
 * `useHavocSettings` query, so renaming a companion or moving the
 * intensity / speed sliders on the page is reflected here automatically
 * through the React Query cache.
 */

import { useEffect, useRef, useState } from 'react'
import type { HavocCompanion } from '@/modules/havoc-companions/types'
import { generateDefaultCompanions } from '@/modules/havoc-companions/lib/animals'
import {
  drawAnimal,
  drawSpeechBubble,
} from '@/modules/havoc-companions/components/animal-renderer'
import {
  applyMischiefBurst,
  installMischiefStylesheet,
  intensityToDelayMs,
} from '@/modules/havoc-companions/lib/mischief'
import {
  useHavocSettings,
  useUpdateHavocSettings,
} from '@/modules/havoc-companions/hooks/use-havoc-companions'

interface WalkerState {
  x: number
  y: number
  /** Horizontal base speed in CSS pixels per second (sign = direction) */
  vx: number
  /** Vertical base speed in CSS pixels per second (sign = direction) */
  vy: number
  facing: 1 | -1
  bobPhase: number
  pauseUntil: number
  /** Active speech bubble text (only rendered while paused) */
  speech: string | null
}

const SPEECH_PHRASES = [
  'i need food',
  'me hungry',
  'chaos time',
  'i love you',
  '❤️❤️❤️',
  'pet me',
  'so sleepy',
  'mood today',
  'snack o clock',
  'hello friend',
  'naptime soon',
  'be right back',
  'sniff sniff',
  'wow look',
  'tiny zoomies',
  'play time',
  'where my treat',
  '✨ sparkle ✨',
  'mischief mode',
  'oh hi',
  'hehehe',
  'tippytap',
  'beep boop',
  'feeling cute',
  'send help',
  '🐾 🐾 🐾',
]

function pickPhrase(): string {
  return SPEECH_PHRASES[Math.floor(Math.random() * SPEECH_PHRASES.length)]
}

const SPRITE = 50
const HALF_SPRITE = SPRITE / 2 + 4
const DEFAULT_INTENSITY = 3
const DEFAULT_SPEED = 5
// First burst fires this soon after enable so the user immediately sees
// something happen instead of waiting up to 30s at low intensity.
const INITIAL_BUMP_DELAY_MS = 5000

export function HavocCompanionsProvider({
  children,
  isAuthenticated = false,
}: {
  children: React.ReactNode
  isAuthenticated?: boolean
}) {
  const [mounted, setMounted] = useState(false)

  const { data: settings, isLoading } = useHavocSettings()
  const updateSettings = useUpdateHavocSettings()

  // Refs mirror the latest settings so the rAF + mischief callbacks can
  // read current values without being torn down on every name edit.
  // Assigned during render — refs are safe to mutate at render time for
  // this "latest value" pattern, and it avoids one tick of staleness vs
  // the useEffect-sync alternative.
  const animalsRef = useRef<HavocCompanion[]>([])
  const intensityRef = useRef<number>(DEFAULT_INTENSITY)
  const speedRef = useRef<number>(DEFAULT_SPEED)
  animalsRef.current = settings?.animals ?? []
  intensityRef.current = settings?.intensity ?? DEFAULT_INTENSITY
  speedRef.current = settings?.speed ?? DEFAULT_SPEED

  // Mutation ref so the bootstrap effect doesn't need `updateSettings` in
  // its dep array (the mutation object is a fresh reference each render).
  const updateSettingsRef = useRef(updateSettings)
  updateSettingsRef.current = updateSettings

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const walkersRef = useRef<WalkerState[]>([])
  const rafRef = useRef<number | null>(null)
  const mischiefTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootstrapAttemptedRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // First-run bootstrap — generate 3 companions if none exist.
  useEffect(() => {
    if (!mounted || !isAuthenticated || isLoading) return
    if (bootstrapAttemptedRef.current) return
    if (settings?.initialized && settings.animals?.length === 3) return

    bootstrapAttemptedRef.current = true
    updateSettingsRef.current.mutate({
      initialized: true,
      animals: generateDefaultCompanions(),
      intensity: settings?.intensity ?? DEFAULT_INTENSITY,
      speed: settings?.speed ?? DEFAULT_SPEED,
    })
  }, [
    mounted,
    isAuthenticated,
    isLoading,
    settings?.initialized,
    settings?.animals?.length,
    settings?.intensity,
    settings?.speed,
  ])

  // Initialise walker positions when the companion count first arrives or
  // changes. Keyed on length so renames don't reset positions.
  useEffect(() => {
    const animals = settings?.animals
    if (!animals) return
    if (walkersRef.current.length === animals.length) return

    const w = window.innerWidth || 800
    const h = window.innerHeight || 600
    const verticalRange = Math.max(1, h - 2 * HALF_SPRITE)
    const n = animals.length
    walkersRef.current = animals.map((_, i) => ({
      x: (w / (n + 1)) * (i + 1),
      y: HALF_SPRITE + Math.random() * verticalRange,
      vx: (Math.random() < 0.5 ? -1 : 1) * (24 + Math.random() * 24),
      vy: (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 12),
      facing: Math.random() < 0.5 ? -1 : 1,
      bobPhase: Math.random() * Math.PI * 2,
      pauseUntil: 0,
      speech: null,
    }))
  }, [settings?.animals?.length])

  // Animation loop — only restarts on auth/mount changes, not on settings.
  useEffect(() => {
    if (!mounted || !isAuthenticated) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let viewportWidth = window.innerWidth || 800
    let viewportHeight = window.innerHeight || 600

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      viewportWidth = window.innerWidth || 800
      viewportHeight = window.innerHeight || 600
      canvas.width = viewportWidth * dpr
      canvas.height = viewportHeight * dpr
      canvas.style.width = viewportWidth + 'px'
      canvas.style.height = viewportHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Clamp existing walker positions to the new bounds so they don't
      // snap-back-to-edge on the next tick after a window resize-down.
      for (const wk of walkersRef.current) {
        if (wk.x > viewportWidth - HALF_SPRITE) wk.x = viewportWidth - HALF_SPRITE
        if (wk.y > viewportHeight - HALF_SPRITE) wk.y = viewportHeight - HALF_SPRITE
      }
    }
    resize()
    window.addEventListener('resize', resize)

    let lastTs = performance.now()

    const tick = (ts: number) => {
      const dtMs = Math.min(50, ts - lastTs) // clamp big gaps (tab switch)
      const dtSec = dtMs / 1000
      lastTs = ts

      ctx.clearRect(0, 0, viewportWidth, viewportHeight)

      const animals = animalsRef.current
      const walkers = walkersRef.current
      // Speed slider 1..10 → 0.2..2.0 multiplier (5 = canonical 1×).
      const speedMul = speedRef.current / 5

      for (let i = 0; i < walkers.length; i++) {
        const wk = walkers[i]
        const animal = animals[i]
        if (!animal) continue

        if (ts >= wk.pauseUntil) {
          // Walker is moving — clear any stale speech from a previous pause.
          if (wk.speech !== null) wk.speech = null

          wk.x += wk.vx * speedMul * dtSec
          wk.y += wk.vy * speedMul * dtSec
          wk.bobPhase += dtMs * 0.012 * speedMul

          if (wk.x < HALF_SPRITE) {
            wk.x = HALF_SPRITE
            wk.vx = Math.abs(wk.vx)
          } else if (wk.x > viewportWidth - HALF_SPRITE) {
            wk.x = viewportWidth - HALF_SPRITE
            wk.vx = -Math.abs(wk.vx)
          }

          if (wk.y < HALF_SPRITE) {
            wk.y = HALF_SPRITE
            wk.vy = Math.abs(wk.vy)
          } else if (wk.y > viewportHeight - HALF_SPRITE) {
            wk.y = viewportHeight - HALF_SPRITE
            wk.vy = -Math.abs(wk.vy)
          }

          // Sprites are drawn in side-profile, so facing follows vx only.
          wk.facing = wk.vx >= 0 ? 1 : -1

          if (Math.random() < 0.0015) {
            wk.pauseUntil = ts + 1200 + Math.random() * 1800
            // ~70% of pauses pop a speech bubble. The rest are silent naps.
            wk.speech = Math.random() < 0.7 ? pickPhrase() : null
            if (Math.random() < 0.5) wk.vx = -wk.vx
            if (Math.random() < 0.5) wk.vy = -wk.vy
            wk.facing = wk.vx >= 0 ? 1 : -1
          }
        }

        drawAnimal(animal.species, ctx, wk.x, wk.y, wk.bobPhase, wk.facing)
        if (wk.speech !== null && ts < wk.pauseUntil) {
          drawSpeechBubble(ctx, wk.x, wk.y, wk.speech, viewportWidth)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [mounted, isAuthenticated])

  // Mischief loop — pauses when the tab is hidden so we don't waste wakeups.
  // Also installs the global stylesheet that makes our transforms survive
  // React re-renders and Tailwind/shadcn class-based transforms.
  useEffect(() => {
    if (!mounted || !isAuthenticated) return

    const removeStylesheet = installMischiefStylesheet()
    let cancelled = false

    const schedule = (delayOverride?: number) => {
      if (cancelled) return
      const delay = delayOverride ?? intensityToDelayMs(intensityRef.current)
      mischiefTimerRef.current = setTimeout(() => {
        if (cancelled) return
        if (animalsRef.current.length > 0) {
          applyMischiefBurst(intensityRef.current)
        }
        schedule()
      }, delay)
    }

    const stop = () => {
      if (mischiefTimerRef.current !== null) {
        clearTimeout(mischiefTimerRef.current)
        mischiefTimerRef.current = null
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (mischiefTimerRef.current === null) schedule()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') {
      schedule(INITIAL_BUMP_DELAY_MS)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      removeStylesheet()
    }
  }, [mounted, isAuthenticated])

  return (
    <>
      {children}
      {mounted && isAuthenticated && (
        <canvas
          ref={canvasRef}
          data-havoc-canvas="1"
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            // Above app shell so companions are visible everywhere; modals
            // (which use higher z-indices) still draw over the top.
            zIndex: 9999,
          }}
        />
      )}
    </>
  )
}
