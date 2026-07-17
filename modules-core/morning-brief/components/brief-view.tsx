'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Printer,
  RefreshCw,
  Loader2,
  AlertCircle,
  ListChecks,
  CalendarDays,
  Clock,
  MapPin,
  CheckCircle2,
  Sunrise,
  Sun,
  Cloud,
  CloudSun,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  ArrowRight,
  Maximize2,
  X,
  Volume2,
  Square,
  type LucideIcon,
} from 'lucide-react'
import type { BriefGreeting, BriefQuote, BriefTask, BriefMeeting, BriefWeather } from '@/modules/morning-brief/types'
import { classifyWeatherCode, type WeatherKind } from '@/modules/morning-brief/lib/weather-codes'
import { useToast } from '@/hooks/use-toast'
import { useApiKeysStatus } from '@/hooks/use-api-keys-status'
import { AI_VOICE_PROVIDERS } from '@/lib/ai-providers'
import { useBriefSpeech, useMorningBriefSettings } from '@/modules/morning-brief/hooks/use-morning-brief'

interface SectionState<T> {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  error?: unknown
}

interface BriefViewProps {
  dateLabel: string
  greeting: SectionState<BriefGreeting>
  tasks: SectionState<BriefTask[]>
  tasksEnabled: boolean
  calendar: SectionState<{ events: BriefMeeting[]; connected: boolean }>
  weather?: BriefWeather
  /** Random quote from the Quotes module (null/absent = no quote line). */
  quote?: BriefQuote | null
  onRefresh: () => void
  isRefreshing: boolean
  /** Embedded mode (e.g. the dashboard): drops the desk backdrop + action bar
   *  and the print id, and adds an "Open full brief" link instead. */
  embedded?: boolean
}

// WMO weather kind → icon (boundaries live in lib/weather-codes).
const WEATHER_KIND_ICON: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partlyCloudy: CloudSun,
  overcast: Cloud,
  fog: CloudFog,
  drizzle: CloudRain,
  rain: CloudRain,
  snow: CloudSnow,
  showers: CloudRain,
  snowShowers: CloudSnow,
  thunder: CloudLightning,
  unknown: Cloud,
}

function WeatherBadge({ weather }: { weather: BriefWeather }) {
  const Icon = WEATHER_KIND_ICON[classifyWeatherCode(weather.code)]
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={weather.description ? `${weather.description} · High / Low` : 'High / Low'}
    >
      <Icon className="h-4 w-4 text-primary" />
      <span className="font-medium text-foreground">{weather.high}°</span>
      <span className="text-muted-foreground/50">/</span>
      <span>
        {weather.low}°{weather.unit}
      </span>
      {weather.city && (
        <span className="hidden text-muted-foreground/60 sm:inline">· {weather.city}</span>
      )}
    </span>
  )
}

// Higher priority_score = higher priority (0–10 scale from the Tasks module).
function priorityLabel(score: string | null): { label: string; className: string } {
  const n = score == null ? 0 : Number(score)
  if (n > 7) return { label: 'Critical', className: 'bg-red-500/10 text-red-600 border-red-500/30' }
  if (n > 5) return { label: 'High', className: 'bg-orange-500/10 text-orange-600 border-orange-500/30' }
  if (n > 3) return { label: 'Medium', className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30' }
  return { label: 'Low', className: 'bg-muted text-muted-foreground border-border' }
}

function dueLabel(due: string | null): { text: string; className: string } | null {
  if (!due) return null
  const dueDate = new Date(due)
  if (Number.isNaN(dueDate.getTime())) return null
  const now = new Date()
  const days = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const text = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (days < 0) return { text: `Overdue · ${text}`, className: 'text-red-600' }
  if (days <= 3) return { text: `Due ${text}`, className: 'text-orange-600' }
  return { text: `Due ${text}`, className: 'text-muted-foreground' }
}

/** Flatten the brief's sections into one natural-language script for TTS. Reads
 *  exactly what's on screen: greeting, message, weather, priorities, schedule. */
function buildBriefSpeech({
  greeting,
  tasks,
  tasksEnabled,
  calendar,
  weather,
  quote,
}: Pick<BriefViewProps, 'greeting' | 'tasks' | 'tasksEnabled' | 'calendar' | 'weather' | 'quote'>): string {
  const parts: string[] = []

  if (greeting.data?.greeting) parts.push(greeting.data.greeting.trim())
  if (greeting.data?.message) parts.push(greeting.data.message.trim())
  if (quote?.quote) parts.push(`Today's quote: ${quote.quote.trim()}`)

  if (weather?.available && weather.high != null && weather.low != null) {
    const where = weather.city ? ` in ${weather.city}` : ''
    const desc = weather.description ? `${weather.description}, with ` : ''
    const scale = weather.unit === 'F' ? 'Fahrenheit' : 'Celsius'
    parts.push(`Today's weather${where}: ${desc}a high of ${weather.high} and a low of ${weather.low} degrees ${scale}.`)
  }

  if (tasksEnabled) {
    const list = tasks.data ?? []
    if (list.length > 0) {
      const items = list.map((t, i) => `${i + 1}. ${t.title}.`).join(' ')
      parts.push(`Here are your top priorities for today. ${items}`)
    } else {
      parts.push('You have nothing pressing on your task list today.')
    }
  }

  if (calendar.data?.connected) {
    const events = calendar.data.events ?? []
    if (events.length > 0) {
      const items = events.map((e) => `${e.allDay ? 'All day' : e.startLabel}, ${e.title}.`).join(' ')
      parts.push(`On your schedule today: ${items}`)
    } else {
      parts.push('You have no meetings scheduled today.')
    }
  }

  parts.push('Have a great day.')
  return parts.join(' ')
}

/** The brief's content (letterhead → footer). Shared by the inline sheet, the
 *  dashboard embed, and the full-screen overlay. */
function BriefSheet({
  dateLabel,
  greeting,
  tasks,
  tasksEnabled,
  calendar,
  weather,
  quote,
  embedded = false,
  listenButton,
}: Omit<BriefViewProps, 'onRefresh' | 'isRefreshing'> & { listenButton?: ReactNode }) {
  return (
    <>
      {/* Letterhead */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <Sunrise className="h-4 w-4 text-primary" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Morning Brief
          </p>
        </div>
        <div className="flex items-center gap-4">
          {listenButton}
          <div className="flex flex-col items-end gap-1">
            {weather?.available && weather.high != null && <WeatherBadge weather={weather} />}
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
          </div>
        </div>
      </div>

      {/* Greeting + motivational message */}
      <div className="py-6">
        {greeting.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Writing your brief…</span>
          </div>
        ) : greeting.isError ? (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              {greeting.error instanceof Error ? greeting.error.message : 'Could not write the greeting.'}{' '}
              <Link href="/morning-brief/settings" className="underline underline-offset-4">
                Check settings
              </Link>
            </span>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-medium tracking-tight text-foreground">
              {greeting.data?.greeting}
            </h1>
            {greeting.data?.message && (
              <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {greeting.data.message}
              </p>
            )}
            {quote?.quote && (
              <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                <span className="font-semibold">Today&apos;s Quote:</span>{' '}
                &quot;<span className="italic">{quote.quote}</span>&quot;
              </p>
            )}
          </>
        )}
      </div>

      {/* Priorities */}
      <section className="border-t border-border pt-6">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Today&apos;s Top Priorities
          </h2>
        </div>
        <PrioritiesSection tasks={tasks} tasksEnabled={tasksEnabled} />
      </section>

      {/* Schedule */}
      <section className="mt-6 border-t border-border pt-6">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Today&apos;s Schedule
          </h2>
        </div>
        <ScheduleSection calendar={calendar} />
      </section>

      {/* Footer */}
      <div className="mt-8 border-t border-border pt-4">
        <p className="text-center text-xs text-muted-foreground">Prepared for you · {dateLabel}</p>
        {embedded && (
          <div className="mt-3 flex justify-center">
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/morning-brief">
                Open full brief
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

export function BriefView({
  dateLabel,
  greeting,
  tasks,
  tasksEnabled,
  calendar,
  weather,
  quote,
  onRefresh,
  isRefreshing,
  embedded = false,
}: BriefViewProps) {
  const { toast } = useToast()
  const speech = useBriefSpeech()
  const { data: providerKeys = {} } = useApiKeysStatus()
  const { data: settings } = useMorningBriefSettings()
  // Narration is on only when the chosen voice provider's key is still configured
  // (a stale selection after key removal stays disabled). Driven by the registry,
  // so a future voice provider works with no change here.
  const voiceProvider = AI_VOICE_PROVIDERS.find((p) => p.id === settings?.selectedVoiceProvider) ?? null
  const narrationEnabled = !!voiceProvider && (providerKeys[voiceProvider.primaryEnvKey]?.configured ?? false)
  const greetingReady = !greeting.isLoading && !greeting.isError && Boolean(greeting.data?.greeting)

  const handleListen = () => {
    if (speech.status !== 'idle') {
      speech.stop()
      return
    }
    const text = buildBriefSpeech({ greeting, tasks, tasksEnabled, calendar, weather, quote })
    speech.play(text).catch((err) =>
      toast({
        variant: 'destructive',
        title: 'Could not read the brief aloud',
        description: err instanceof Error ? err.message : 'Please try again.',
      }),
    )
  }

  // Two-state open/close so the exit (shrink) animation can play before unmount:
  // `mounted` = in the DOM, `visible` = in the open visual state.
  const [fsMounted, setFsMounted] = useState(false)
  const [fsVisible, setFsVisible] = useState(false)
  const EXIT_MS = 400
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const openFullscreen = () => {
    setFsMounted(true)
    // Two frames so the element paints hidden first, then transitions open.
    requestAnimationFrame(() => requestAnimationFrame(() => setFsVisible(true)))
  }
  const closeFullscreen = () => setFsVisible(false)

  // Unmount once the shrink/fade has finished.
  useEffect(() => {
    if (fsMounted && !fsVisible) {
      const t = setTimeout(() => setFsMounted(false), EXIT_MS)
      return () => clearTimeout(t)
    }
  }, [fsMounted, fsVisible])

  // While the overlay is mounted: lock scroll, move focus in, trap Tab, close on
  // Escape, and restore focus to the trigger on close (real modal semantics, so
  // aria-modal isn't a false promise).
  useEffect(() => {
    if (!fsMounted) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusFrame = requestAnimationFrame(() => closeBtnRef.current?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFullscreen()
        return
      }
      if (e.key !== 'Tab') return
      const container = overlayRef.current
      if (!container) return
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(focusFrame)
      previouslyFocused?.focus?.()
    }
  }, [fsMounted])

  // One Listen button for both homes: the page-mode action bar and the embedded
  // (dashboard) letterhead — identical behavior and states in each.
  const listenButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleListen}
      disabled={!narrationEnabled || (speech.status === 'idle' && !greetingReady)}
      title={
        !narrationEnabled
          ? 'Select a voice in Morning Brief settings to enable'
          : undefined
      }
    >
      {speech.status === 'loading' ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Preparing…
        </>
      ) : speech.status === 'playing' ? (
        <>
          <Square className="mr-2 h-4 w-4" />
          Stop
        </>
      ) : (
        <>
          <Volume2 className="mr-2 h-4 w-4" />
          Listen
        </>
      )}
    </Button>
  )

  const sheetProps = {
    dateLabel,
    greeting,
    tasks,
    tasksEnabled,
    calendar,
    weather,
    quote,
    embedded,
    listenButton: embedded ? listenButton : undefined,
  }

  return (
    <div className={cn(!embedded && 'p-6 sm:p-10')}>
      {/* Letter width: grows with the window up to 1300px; the min() min-width
          keeps a letter-like 640px floor where space allows without ever
          forcing horizontal scroll on narrow screens. */}
      <div className={cn(!embedded && 'mx-auto w-full min-w-[min(100%,40rem)] max-w-[1300px] space-y-5')}>
        {/* Screen-only action bar (page mode only) */}
        {!embedded && (
          <div className="mb-no-print flex items-center justify-end gap-2">
            {listenButton}
            <Button variant="outline" size="sm" onClick={openFullscreen}>
              <Maximize2 className="mr-2 h-4 w-4" />
              Full screen
            </Button>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        )}

        {/* The one-pager. On the page it floats like a sheet of paper (layered
            shadow); embedded on the dashboard it's a plain bordered card that
            matches the other dashboard widgets (no shadow). */}
        <div
          id={embedded ? undefined : 'morning-brief-printable'}
          className={cn(
            'relative w-full bg-card',
            embedded
              ? 'rounded-xl border border-border px-6 py-7 sm:px-8 sm:py-9'
              : 'mx-auto rounded-md border border-border/60 px-8 py-10 ring-1 ring-black/[0.03] shadow-[0_2px_4px_-2px_rgba(15,23,42,0.12),0_12px_28px_-12px_rgba(15,23,42,0.28),0_28px_64px_-28px_rgba(15,23,42,0.30)] sm:px-14 sm:py-14',
          )}
        >
          <BriefSheet {...sheetProps} />
        </div>
      </div>

      {/* Full-screen overlay — the letter at 90% width over a blurred backdrop,
          with a fade + expand/shrink transition. */}
      {!embedded && fsMounted && (
        <div
          className={cn(
            'mb-no-print fixed inset-0 z-50 flex justify-center overflow-y-auto bg-background p-4 transition-opacity duration-300 ease-out sm:p-8',
            fsVisible ? 'opacity-100' : 'opacity-0',
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Morning Brief"
          onClick={closeFullscreen}
        >
          <div
            ref={overlayRef}
            className={cn(
              'relative my-8 h-fit w-[90vw] rounded-md border border-border/60 bg-card px-8 py-10 shadow-2xl ring-1 ring-black/[0.03] sm:px-16 sm:py-16',
              'origin-center transform-gpu transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform',
              fsVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              ref={closeBtnRef}
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              onClick={closeFullscreen}
              aria-label="Close full screen"
            >
              <X className="h-4 w-4" />
            </Button>
            <BriefSheet {...sheetProps} />
          </div>
        </div>
      )}
    </div>
  )
}

function PrioritiesSection({
  tasks,
  tasksEnabled,
}: {
  tasks: SectionState<BriefTask[]>
  tasksEnabled: boolean
}) {
  if (!tasksEnabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Enable the{' '}
        <Link href="/modules" className="font-medium text-foreground underline underline-offset-4">
          Tasks module
        </Link>{' '}
        to see your top priorities here.
      </p>
    )
  }
  if (tasks.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading priorities…
      </div>
    )
  }
  if (tasks.isError) {
    return (
      <p className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" /> Couldn&apos;t load your tasks.
      </p>
    )
  }
  const list = tasks.data ?? []
  if (list.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-600" /> Nothing pressing — your plate is clear.
      </p>
    )
  }
  return (
    <ol className="divide-y divide-border/50">
      {list.map((task, i) => {
        const priority = priorityLabel(task.priority_score)
        const due = dueLabel(task.due_date)
        return (
          <li
            key={task.id}
            className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{task.title}</p>
              {due && <p className={cn('text-xs', due.className)}>{due.text}</p>}
            </div>
            <span
              className={cn(
                'flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                priority.className,
              )}
            >
              {priority.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ScheduleSection({
  calendar,
}: {
  calendar: SectionState<{ events: BriefMeeting[]; connected: boolean }>
}) {
  if (calendar.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your calendar…
      </div>
    )
  }
  if (calendar.isError) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />
        {calendar.error instanceof Error ? calendar.error.message : 'Couldn’t load your calendar.'}
        <Link href="/morning-brief/settings" className="mb-no-print underline underline-offset-4">
          Reconnect
        </Link>
      </p>
    )
  }
  if (calendar.data && !calendar.data.connected) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-border/70 px-6 py-8 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <CalendarDays className="h-5 w-5 text-primary" />
        </span>
        <p className="mt-3 text-sm font-medium text-foreground">
          Connect your calendar to see your day
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Set up Google Calendar to display your day&apos;s events here — connect your account
          directly, or subscribe to a calendar link.
        </p>
        <Button asChild size="sm" variant="outline" className="mb-no-print mt-4">
          <Link href="/morning-brief/settings">Set up calendar</Link>
        </Button>
      </div>
    )
  }
  const events = calendar.data?.events ?? []
  if (events.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-600" /> No meetings today — the day is yours.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-border/50">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="flex w-24 flex-shrink-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{event.startLabel}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{event.title}</p>
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              {!event.allDay && event.endLabel && <span>until {event.endLabel}</span>}
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{event.location}</span>
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
