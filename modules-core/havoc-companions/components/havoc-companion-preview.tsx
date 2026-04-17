'use client'

/**
 * Havoc Companions Module — Single-companion canvas preview
 *
 * Renders one sprite of a given species. By default it runs a local
 * requestAnimationFrame loop so the sprite bobs. Pass `animated={false}`
 * (used by the species picker where up to 12 thumbnails render at once)
 * to draw a single static frame and skip the rAF loop entirely.
 */

import { useEffect, useRef } from 'react'
import type { CompanionSpecies } from '@/modules/havoc-companions/types'
import { drawAnimal } from '@/modules/havoc-companions/components/animal-renderer'

interface HavocCompanionPreviewProps {
  species: CompanionSpecies
  size?: number
  animated?: boolean
}

export function HavocCompanionPreview({
  species,
  size = 80,
  animated = true,
}: HavocCompanionPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = size + 'px'
    canvas.style.height = size + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const scale = size / 50
    const draw = (bob: number) => {
      ctx.clearRect(0, 0, size, size)
      drawAnimal(species, ctx, size / 2, size / 2, bob, 1, scale)
    }

    if (!animated) {
      draw(0)
      return
    }

    let raf = 0
    const start = performance.now()
    const tick = (ts: number) => {
      draw(((ts - start) / 1000) * 3)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [species, size, animated])

  return <canvas ref={canvasRef} aria-hidden="true" />
}
