'use client'

/**
 * Horizontal timeline visualization.
 *
 * Layout is absolute-positioned inside one relative container: every day gets
 * a small tick on the baseline; event days get a tall line with a dot and a
 * clickable name/date label above it; a full-height line marks today; and
 * everything before today is faded. The blue palette is a deliberate accent
 * matching the module's design — alpha steps of one hue keep the ticks legible
 * across light and dark themes; page chrome stays on semantic theme tokens.
 */

import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertCircle, Loader2, Maximize, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TimelineEvent } from '../types'
import {
  TIMELINE_START,
  TIMELINE_END,
  TIMELINE_RANGE_LABEL,
  TOTAL_DAYS,
  ALL_DAYS,
  MONTH_SEGMENTS,
  dayIndexOf,
  formatShortDate,
  todayIso,
} from '../lib/timeline-range'

interface TimelineChartProps {
  events: TimelineEvent[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onEventClick: (event: TimelineEvent) => void
}

// Cycling alpha steps of one blue give each day tick its own shade while
// staying visible on both light and dark backgrounds.
const TICK_SHADES = ['bg-blue-500/30', 'bg-blue-500/70', 'bg-blue-500/45', 'bg-blue-500/90']

// Height tiers for event lines (tallest first). Clustered events scan from the
// SHORTEST tier up, so a run of nearby events cascades taller to the right and
// the labels never stack at one height; an event with no neighbors in label
// range gets the tall ISOLATED_TIER for the classic long-line look.
const TIER_HEIGHTS = [456, 384, 288, 192, 96]
const ISOLATED_TIER = 1

// px reserved under the baseline for the day numbers and month labels.
const BASELINE = 108

// Label sizing used for collision estimates (mirrors the classes below).
const LABEL_MAX_W = 270
const LABEL_CHAR_W = 9.5 // avg px per character at text-lg font-semibold
const LABEL_GAP = 12

// Zoom = horizontal room per day tick, in px. The chart scrolls horizontally
// when TOTAL_DAYS * spacing exceeds the viewport; 'fit' squeezes the whole
// range into the visible width.
const ZOOM_LEVELS = [8, 12, 16, 24, 32, 48, 64]
const DEFAULT_SPACING = 32
const ZOOM_STORAGE_KEY = 'ari-timeline-zoom'
type ZoomSpacing = number | 'fit'
const FALLBACK_WIDTH = TOTAL_DAYS * DEFAULT_SPACING

// SSR-safe read of the persisted zoom level (server snapshot = null so the
// server and hydration renders agree, then the client value applies).
function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}
function getStoredZoom(): string | null {
  return window.localStorage.getItem(ZOOM_STORAGE_KEY)
}
function getServerZoom(): string | null {
  return null
}

const NUMBERED_DAYS = new Set([1, 5, 10, 15, 20, 25, 30])

function leftPctNum(index: number): number {
  return (index / (TOTAL_DAYS - 1)) * 100
}

function leftPct(index: number): string {
  return `${leftPctNum(index)}%`
}

function labelHalfWidth(name: string): number {
  return Math.min(LABEL_MAX_W, name.length * LABEL_CHAR_W + 16) / 2
}

function TimelineChartInner({ events, isLoading, isError, onRetry, onEventClick }: TimelineChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(0)
  // Viewport-center fraction captured before a zoom change, restored after.
  const zoomAnchor = useRef<number | null>(null)

  // Zoom: session changes win, then the persisted value, then the default.
  const storedZoom = useSyncExternalStore(subscribeToStorage, getStoredZoom, getServerZoom)
  const [zoomOverride, setZoomOverride] = useState<ZoomSpacing | null>(null)
  let persistedZoom: ZoomSpacing | null = null
  if (storedZoom === 'fit') {
    persistedZoom = 'fit'
  } else if (storedZoom !== null && ZOOM_LEVELS.includes(Number(storedZoom))) {
    persistedZoom = Number(storedZoom)
  }
  const spacing = zoomOverride ?? persistedZoom ?? 'fit'

  // Track the rendered width so label-collision math works in real pixels.
  useEffect(() => {
    const el = chartRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setChartWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // After a zoom change, keep whatever was in the middle of the viewport there.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || zoomAnchor.current === null) return
    el.scrollLeft = zoomAnchor.current * el.scrollWidth - el.clientWidth / 2
    zoomAnchor.current = null
  }, [spacing])

  const changeZoom = (next: ZoomSpacing) => {
    const el = scrollRef.current
    if (el && el.scrollWidth > 0) {
      zoomAnchor.current = (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth
    }
    setZoomOverride(next)
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(next))
  }

  // Effective px-per-day, used to step in/out from 'fit' mode too. In fit mode
  // the measured chart width tracks the viewport, so it serves as the basis.
  const effectiveSpacing =
    spacing === 'fit' ? (chartWidth > 0 ? chartWidth / TOTAL_DAYS : 8) : spacing
  const zoomInLevel = ZOOM_LEVELS.find((l) => l > effectiveSpacing + 0.5)
  const zoomOutLevel = [...ZOOM_LEVELS].reverse().find((l) => l < effectiveSpacing - 0.5)

  const today = todayIso()
  const todayInRange = today >= TIMELINE_START && today <= TIMELINE_END
  const todayIndex = todayInRange ? dayIndexOf(today) : null
  // If today is past the whole range, everything is in the past.
  const pastCutoff = todayIndex ?? (today > TIMELINE_END ? TOTAL_DAYS : 0)

  const width = chartWidth || FALLBACK_WIDTH

  // Sort by date (id tiebreaker keeps order stable), then assign tiers:
  // isolated events get the tall default; clustered events take the shortest
  // collision-free tier so each subsequent neighbor climbs above the last.
  const tierLastRight = TIER_HEIGHTS.map(() => Number.NEGATIVE_INFINITY)
  const positioned = events
    .map((event) => ({ event, index: dayIndexOf(event.event_date) }))
    .filter(({ index }) => index >= 0 && index < TOTAL_DAYS)
    .sort(
      (a, b) =>
        a.event.event_date.localeCompare(b.event.event_date) || a.event.id.localeCompare(b.event.id)
    )
    .map(({ event, index }) => {
      const x = (leftPctNum(index) / 100) * width
      const halfW = labelHalfWidth(event.name)
      const labelLeft = x - halfW
      let tier = -1
      if (labelLeft >= Math.max(...tierLastRight) + LABEL_GAP) {
        tier = ISOLATED_TIER
      } else {
        for (let t = TIER_HEIGHTS.length - 1; t >= 0; t--) {
          if (labelLeft >= tierLastRight[t] + LABEL_GAP) {
            tier = t
            break
          }
        }
        if (tier === -1) {
          // No tier is collision-free; take the one with the most room.
          tier = tierLastRight.indexOf(Math.min(...tierLastRight))
        }
      }
      tierLastRight[tier] = Math.max(tierLastRight[tier], x + halfW)
      return { event, index, lineHeight: TIER_HEIGHTS[tier] }
    })
  const eventDayIndexes = new Set(positioned.map(({ index }) => index))

  return (
    <div className="space-y-2" role="group" aria-label={`Timeline, ${TIMELINE_RANGE_LABEL}`}>
      {/* Zoom controls */}
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => zoomOutLevel !== undefined && changeZoom(zoomOutLevel)}
          disabled={zoomOutLevel === undefined}
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {spacing === 'fit' ? 'Fit' : `${Math.round((spacing / DEFAULT_SPACING) * 100)}%`}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => zoomInLevel !== undefined && changeZoom(zoomInLevel)}
          disabled={zoomInLevel === undefined}
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => changeZoom('fit')}
          disabled={spacing === 'fit'}
          aria-label="Fit entire range"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="w-full overflow-x-auto">
      {/* The positioned box is inset by the outer padding so children placed at
          left: 100% don't spill past the padding box and trigger a scrollbar. */}
      <div
        className="h-[630px] px-4"
        style={spacing === 'fit' ? undefined : { minWidth: TOTAL_DAYS * spacing }}
      >
        <div ref={chartRef} className="relative h-full">
        {/* Day ticks (decorative) */}
        <div aria-hidden="true">
          {ALL_DAYS.map((info, i) => (
            <div
              key={info.iso}
              className={cn(
                'absolute w-[4px] -translate-x-1/2 rounded-full',
                TICK_SHADES[i % TICK_SHADES.length],
                i < pastCutoff && 'opacity-30'
              )}
              style={{ left: leftPct(i), bottom: BASELINE, height: 36 }}
            />
          ))}
        </div>

        {/* Day numbers + month labels (axis chrome, decorative) */}
        <div aria-hidden="true">
          {ALL_DAYS.map((info, i) => {
            const isToday = i === todayIndex
            if (!NUMBERED_DAYS.has(info.day) && !isToday && !eventDayIndexes.has(i)) return null
            return (
              <span
                key={`n-${info.iso}`}
                className={cn(
                  'absolute -translate-x-1/2 text-sm tabular-nums',
                  isToday
                    ? 'font-semibold text-blue-600 dark:text-blue-400'
                    : 'text-muted-foreground/70'
                )}
                style={{ left: leftPct(i), bottom: BASELINE - 40 }}
              >
                {info.day}
              </span>
            )
          })}
          {MONTH_SEGMENTS.map((seg) => (
            <span
              key={seg.label}
              className="absolute -translate-x-1/2 text-sm font-medium tracking-[0.25em] text-muted-foreground/60"
              style={{ left: leftPct((seg.startIndex + seg.endIndex) / 2), bottom: 12 }}
            >
              {seg.label}
            </span>
          ))}
        </div>

        {/* Today marker: full-height line + dot on the baseline */}
        {todayIndex !== null && (
          <div aria-hidden="true">
            <div
              className="absolute top-0 w-[3px] -translate-x-1/2 bg-blue-500"
              style={{ left: leftPct(todayIndex), bottom: BASELINE - 15 }}
            />
            <div
              className="absolute z-10 h-[18px] w-[18px] -translate-x-1/2 rounded-full bg-blue-600 ring-[6px] ring-blue-500/20 dark:bg-blue-400"
              style={{ left: leftPct(todayIndex), bottom: BASELINE - 9 }}
            />
          </div>
        )}

        {/* Events: tall line, dot on top, clickable label above */}
        {positioned.map(({ event, index, lineHeight }) => {
          const isPast = index < pastCutoff
          // Optimistic rows aren't editable until the server assigns a real id.
          const isTemp = event.id.startsWith('temp-')
          // Custom color overrides the blue via inline style; past events fade.
          const customColor = event.color
            ? { backgroundColor: event.color, opacity: isPast ? 0.35 : 1 }
            : undefined
          return (
            <div key={event.id}>
              <div
                aria-hidden="true"
                className={cn(
                  'absolute w-[4px] -translate-x-1/2 rounded-full',
                  !event.color && (isPast ? 'bg-blue-500/30' : 'bg-blue-600 dark:bg-blue-400')
                )}
                style={{ left: leftPct(index), bottom: BASELINE, height: lineHeight, ...customColor }}
              />
              <div
                aria-hidden="true"
                className={cn(
                  'absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full',
                  !event.color && (isPast ? 'bg-blue-500/40' : 'bg-blue-600 dark:bg-blue-400')
                )}
                style={{ left: leftPct(index), bottom: BASELINE + lineHeight - 6, ...customColor }}
              />
              <button
                type="button"
                onClick={() => onEventClick(event)}
                disabled={isTemp}
                title={event.name}
                aria-label={`Edit event: ${event.name}, ${formatShortDate(event.event_date)}`}
                className="absolute -translate-x-1/2 rounded-md px-2 py-1 text-center outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                style={{
                  left: `clamp(5rem, ${leftPctNum(index)}%, calc(100% - 5rem))`,
                  bottom: BASELINE + lineHeight + 14,
                }}
              >
                <span
                  className={cn(
                    'block max-w-[270px] truncate text-lg font-semibold',
                    isPast ? 'text-muted-foreground/50' : 'text-foreground'
                  )}
                >
                  {event.name}
                </span>
                <span
                  className={cn(
                    'block text-sm',
                    isPast ? 'text-muted-foreground/40' : 'text-muted-foreground'
                  )}
                >
                  {formatShortDate(event.event_date)}
                </span>
              </button>
            </div>
          )
        })}

        {/* Loading / error / empty states */}
        {isLoading && (
          <div className="absolute inset-x-0 top-24 flex justify-center" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Loading events</span>
          </div>
        )}
        {!isLoading && isError && (
          <div className="absolute inset-x-0 top-24 flex flex-col items-center gap-3" role="alert">
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              Failed to load events.
            </p>
            <Button variant="outline" size="sm" onClick={() => onRetry()}>
              Try again
            </Button>
          </div>
        )}
        {!isLoading && !isError && positioned.length === 0 && (
          <p className="absolute inset-x-0 top-24 text-center text-sm text-muted-foreground">
            No events yet — click &ldquo;Add Event&rdquo; to put your first one on the timeline.
          </p>
        )}
        </div>
      </div>
      </div>
    </div>
  )
}

export const TimelineChart = memo(TimelineChartInner)
