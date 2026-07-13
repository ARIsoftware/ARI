'use client'

import { memo, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtDate, fmtDistanceKm, fmtDuration } from '@/modules/health-data/lib/format'
import type { HealthRoute } from '@/modules/health-data/types'

/**
 * One workout route drawn to shape (not to a map): an equirectangular
 * projection of the GPS trace scaled to fit the cell, with a green start
 * dot and a red finish dot. Click to enlarge.
 */
export const RouteCard = memo(function RouteCard({ route }: { route: HealthRoute }) {
  const [open, setOpen] = useState(false)
  const trace = useMemo(() => buildTrace(route.points), [route.points])

  const caption = `${fmtDate(route.route_date)} · ${fmtDistanceKm(route.distance_km)}`

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Enlarge route from ${caption}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="cursor-pointer transition-colors hover:border-[hsl(var(--chart-2)/0.5)]"
      >
        <CardContent className="p-3">
          <RouteSvg trace={trace} className="h-28 w-full text-foreground" strokeWidth={1.5} dotRadius={2.5} />
          <p className="mt-2 text-center text-xs tabular-nums text-muted-foreground">{caption}</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{caption}</DialogTitle>
            <DialogDescription>
              {route.duration_min !== null ? `${fmtDuration(route.duration_min)} · ` : ''}
              {route.point_count.toLocaleString()} GPS points · start{' '}
              <span className="text-emerald-500">●</span> finish <span className="text-sky-500">●</span>
            </DialogDescription>
          </DialogHeader>
          <RouteSvg trace={trace} className="h-80 w-full text-foreground" strokeWidth={1.5} dotRadius={4} />
        </DialogContent>
      </Dialog>
    </>
  )
})

interface Trace {
  path: string
  start: { x: number; y: number }
  end: { x: number; y: number }
}

function RouteSvg({
  trace,
  className,
  strokeWidth,
  dotRadius,
}: {
  trace: Trace | null
  className: string
  strokeWidth: number
  dotRadius: number
}) {
  if (!trace) {
    return <p className="py-10 text-center text-xs text-muted-foreground">No path data</p>
  }
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-hidden="true">
      <polyline
        points={trace.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={trace.start.x} cy={trace.start.y} r={dotRadius} vectorEffect="non-scaling-stroke" className="fill-emerald-500" />
      <circle cx={trace.end.x} cy={trace.end.y} r={dotRadius} vectorEffect="non-scaling-stroke" className="fill-sky-500" />
    </svg>
  )
}

/**
 * Project [lat, lon] pairs to a 100×100 viewBox: longitude scaled by
 * cos(mid-latitude) so shapes keep their real-world aspect ratio, fitted
 * uniformly with padding and centered.
 */
function buildTrace(points: Array<[number, number]>): Trace | null {
  if (!Array.isArray(points) || points.length < 2) return null

  let latMin = Infinity
  let latMax = -Infinity
  let lonMin = Infinity
  let lonMax = -Infinity
  for (const [lat, lon] of points) {
    if (lat < latMin) latMin = lat
    if (lat > latMax) latMax = lat
    if (lon < lonMin) lonMin = lon
    if (lon > lonMax) lonMax = lon
  }

  const lonScale = Math.cos(((latMin + latMax) / 2) * (Math.PI / 180))
  const width = (lonMax - lonMin) * lonScale
  const height = latMax - latMin
  const extent = Math.max(width, height, 1e-6)

  const pad = 8
  const size = 100 - pad * 2
  const scale = size / extent
  const offsetX = pad + (size - width * scale) / 2
  const offsetY = pad + (size - height * scale) / 2

  const project = ([lat, lon]: [number, number]) => ({
    x: offsetX + (lon - lonMin) * lonScale * scale,
    // SVG y grows downward; latitude grows upward
    y: offsetY + (latMax - lat) * scale,
  })

  const parts: string[] = new Array(points.length)
  for (let i = 0; i < points.length; i++) {
    const { x, y } = project(points[i])
    parts[i] = `${x.toFixed(2)},${y.toFixed(2)}`
  }

  return {
    path: parts.join(' '),
    start: project(points[0]),
    end: project(points[points.length - 1]),
  }
}
