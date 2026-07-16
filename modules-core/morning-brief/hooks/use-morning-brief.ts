/**
 * Morning Brief Module - TanStack Query Hooks
 *
 * Data sources:
 * - settings        → module_settings (selected AI provider)
 * - google status   → /api/modules/morning-brief/google/status
 * - greeting        → /api/modules/morning-brief/greeting  (cached per day)
 * - calendar        → /api/modules/morning-brief/calendar  (live, never cached)
 * - top tasks       → /api/modules/tasks/priorities        (live, never cached)
 * - today's quote   → /api/modules/quotes/quotes           (random pick client-side)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { stripSurroundingQuotes } from '@/modules/morning-brief/lib/format'
import type {
  MorningBriefSettings,
  GoogleStatus,
  IcalStatus,
  BriefGreeting,
  BriefQuote,
  CalendarResponse,
  BriefTask,
  BriefWeather,
  VoicesResponse,
} from '@/modules/morning-brief/types'

const API_BASE = '/api/modules/morning-brief'

/** Best error message from a failed JSON API response (Zod `details` → `error` → fallback). */
async function parseApiError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({}))
  const details = err.details?.map((d: { message: string }) => d.message).join(', ')
  return new Error(details || err.error || fallback)
}

// Exported so consumers (e.g. the page's refresh button) invalidate by the same
// keys these hooks use, instead of re-typing the literals.
export const SETTINGS_KEY = ['morning-brief-settings']
export const GOOGLE_STATUS_KEY = ['morning-brief-google-status']
export const ICAL_STATUS_KEY = ['morning-brief-ical-status']
export const GREETING_KEY = ['morning-brief-greeting']
export const CALENDAR_KEY = ['morning-brief-calendar']
export const TOP_TASKS_KEY = ['morning-brief-top-tasks']
export const QUOTE_KEY = ['morning-brief-quote']
export const WEATHER_KEY = ['morning-brief-weather']
export const VOICES_KEY = ['morning-brief-elevenlabs-voices']

// ─── Settings ───────────────────────────────────────────────────────────────
export function useMorningBriefSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<MorningBriefSettings>> => {
      const res = await fetch(`${API_BASE}/settings`)
      if (!res.ok) return {}
      return await res.json()
    },
  })
}

export function useUpdateMorningBriefSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<MorningBriefSettings>): Promise<void> => {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw await parseApiError(res, 'Failed to save settings')
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<MorningBriefSettings>>(SETTINGS_KEY)
      queryClient.setQueryData<Partial<MorningBriefSettings>>(SETTINGS_KEY, (old = {}) => ({ ...old, ...newSettings }))
      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) queryClient.setQueryData(SETTINGS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}

// ─── Google connection ───────────────────────────────────────────────────────
export function useGoogleStatus() {
  return useQuery({
    queryKey: GOOGLE_STATUS_KEY,
    queryFn: async (): Promise<GoogleStatus> => {
      const res = await fetch(`${API_BASE}/google/status`)
      if (!res.ok) throw new Error('Failed to load Google status')
      return await res.json()
    },
  })
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch(`${API_BASE}/google/disconnect`, { method: 'DELETE' })
      if (!res.ok) throw await parseApiError(res, 'Failed to disconnect Google')
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: GOOGLE_STATUS_KEY })
      const previous = queryClient.getQueryData<GoogleStatus>(GOOGLE_STATUS_KEY)
      queryClient.setQueryData<GoogleStatus>(GOOGLE_STATUS_KEY, (old) =>
        old ? { ...old, connected: false, email: null } : old,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(GOOGLE_STATUS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: GOOGLE_STATUS_KEY })
      queryClient.invalidateQueries({ queryKey: CALENDAR_KEY })
    },
  })
}

// ─── iCal subscription (alternative to OAuth) ────────────────────────────────
export function useIcalStatus() {
  return useQuery({
    queryKey: ICAL_STATUS_KEY,
    queryFn: async (): Promise<IcalStatus> => {
      const res = await fetch(`${API_BASE}/ical/status`)
      if (!res.ok) throw new Error('Failed to load subscription status')
      return await res.json()
    },
  })
}

export function useSubscribeIcal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (url: string): Promise<IcalStatus> => {
      const res = await fetch(`${API_BASE}/ical/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw await parseApiError(res, 'Failed to subscribe')
      return await res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ICAL_STATUS_KEY })
      queryClient.invalidateQueries({ queryKey: CALENDAR_KEY })
    },
  })
}

export function useDisconnectIcal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch(`${API_BASE}/ical/disconnect`, { method: 'DELETE' })
      if (!res.ok) throw await parseApiError(res, 'Failed to remove subscription')
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ICAL_STATUS_KEY })
      const previous = queryClient.getQueryData<IcalStatus>(ICAL_STATUS_KEY)
      queryClient.setQueryData<IcalStatus>(ICAL_STATUS_KEY, { subscribed: false, host: null })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(ICAL_STATUS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ICAL_STATUS_KEY })
      queryClient.invalidateQueries({ queryKey: CALENDAR_KEY })
    },
  })
}

// ─── Greeting (cached per day on the server) ─────────────────────────────────
export function useGreeting(taskCount: number, meetingCount: number, enabled: boolean) {
  return useQuery({
    // Counts are part of the key so the first enabled fetch can't be locked to a
    // stale 0/0; the server still caches per day, so refetches stay cheap.
    queryKey: [...GREETING_KEY, taskCount, meetingCount],
    enabled,
    // Stable for the whole day — avoid refetch spam (the server caches it anyway).
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<BriefGreeting> => {
      const params = new URLSearchParams({
        taskCount: String(taskCount),
        meetingCount: String(meetingCount),
      })
      const res = await fetch(`${API_BASE}/greeting?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to generate greeting')
      }
      return await res.json()
    },
  })
}

// ─── Calendar (live) ─────────────────────────────────────────────────────────
export function useCalendar(enabled: boolean) {
  return useQuery({
    queryKey: CALENDAR_KEY,
    enabled,
    queryFn: async (): Promise<CalendarResponse> => {
      const res = await fetch(`${API_BASE}/calendar`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load calendar')
      }
      return await res.json()
    },
  })
}

// ─── Weather (live, Open-Meteo) ──────────────────────────────────────────────
export function useWeather(enabled: boolean) {
  return useQuery({
    queryKey: WEATHER_KEY,
    enabled,
    staleTime: 1000 * 60 * 15,
    queryFn: async (): Promise<BriefWeather> => {
      const res = await fetch(`${API_BASE}/weather`)
      if (!res.ok) throw new Error('Failed to load weather')
      return await res.json()
    },
  })
}

// ─── Top priority tasks (live, from the Tasks module) ────────────────────────
export function useTopTasks(enabled: boolean) {
  return useQuery({
    queryKey: TOP_TASKS_KEY,
    enabled,
    queryFn: async (): Promise<BriefTask[]> => {
      // Bounded at the source: the Tasks priorities endpoint filters to open
      // tasks and returns just the top 5 by priority score. Loose HTTP coupling
      // means the brief degrades gracefully if Tasks is absent.
      const res = await fetch('/api/modules/tasks/priorities?limit=5&completed=false')
      if (!res.ok) throw new Error('Failed to load tasks')
      return await res.json()
    },
  })
}

// ─── Today's quote (random, from the Quotes module) ──────────────────────────
// Module-level select fn so React Query memoizes the pick per fetched list —
// the quote stays put across re-renders and only changes on a fresh fetch.
function pickRandomQuote(list: BriefQuote[]): BriefQuote | null {
  // Strip quote marks stored around the text — the letter adds its own — and
  // drop entries that were nothing but quote marks.
  const usable = list
    .map((q) => ({ ...q, quote: stripSurroundingQuotes(q.quote ?? '') }))
    .filter((q) => q.quote.length > 0)
  if (usable.length === 0) return null
  return usable[Math.floor(Math.random() * usable.length)]
}

export function useRandomQuote(enabled: boolean) {
  return useQuery({
    queryKey: QUOTE_KEY,
    enabled,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<BriefQuote[]> => {
      // Loose HTTP coupling to the Quotes module: any failure = no quote line,
      // the brief renders fine without it.
      const res = await fetch('/api/modules/quotes/quotes')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
    select: pickRandomQuote,
  })
}

// ─── ElevenLabs voices (for the read-aloud picker in settings) ────────────────
export function useElevenLabsVoices(enabled: boolean) {
  return useQuery({
    queryKey: VOICES_KEY,
    enabled,
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<VoicesResponse> => {
      const res = await fetch(`${API_BASE}/voices`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load voices')
      }
      return await res.json()
    },
  })
}

// ─── Play a ready audio URL (e.g. a voice preview clip) ──────────────────────
/**
 * Plays an already-playable audio URL through a single reused <audio> element,
 * tracking whether it's playing and stopping on unmount. Unlike useBriefSpeech
 * it does not fetch — the URL is ready to play (e.g. an ElevenLabs preview).
 */
export function usePlayUrl() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlaying(false)
  }, [])

  const toggle = useCallback(
    (url: string | null | undefined) => {
      if (playing) {
        stop()
        return
      }
      if (!url) return
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = stop
      audio.onerror = stop
      setPlaying(true)
      audio.play().catch(stop)
    },
    [playing, stop],
  )

  useEffect(() => stop, [stop])

  return { playing, toggle, stop }
}

// ─── Read aloud (ElevenLabs TTS playback) ─────────────────────────────────────
export type BriefSpeechStatus = 'idle' | 'loading' | 'playing'

/**
 * Plays the brief aloud: POSTs the text to the TTS route, turns the streamed
 * MP3 into an Object URL, and plays it through a single reused <audio> element.
 * Returns the current status plus `play(text)` and `stop()`. Audio + Object URL
 * are always revoked before the next play and on unmount.
 */
export function useBriefSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // The last synthesized clip, kept alive so replaying the SAME text doesn't
  // re-hit (and re-bill) ElevenLabs. Disposed when the text changes or on
  // unmount. Changing the voice happens on the settings route, which unmounts
  // this hook and frees the cache, so a text-only key can't serve stale audio.
  const cacheRef = useRef<{ text: string; url: string } | null>(null)
  const [status, setStatus] = useState<BriefSpeechStatus>('idle')

  // Stop playback + any in-flight request, but keep the cached clip for replay.
  const stopPlayback = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    stopPlayback()
    setStatus('idle')
  }, [stopPlayback])

  const playUrl = useCallback(
    (url: string) => {
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => stop()
      audio.onerror = () => stop()
      return audio.play()
    },
    [stop],
  )

  const play = useCallback(
    async (text: string) => {
      stopPlayback()

      // Cache hit → replay instantly, no fetch.
      if (cacheRef.current?.text === text) {
        try {
          await playUrl(cacheRef.current.url)
          setStatus('playing')
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          stop()
          throw err
        }
        return
      }

      const controller = new AbortController()
      abortRef.current = controller
      setStatus('loading')
      try {
        const res = await fetch(`${API_BASE}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Could not generate audio')
        }
        const blob = await res.blob()
        if (controller.signal.aborted) return
        // Replace the previously cached clip with the new one.
        if (cacheRef.current) URL.revokeObjectURL(cacheRef.current.url)
        const url = URL.createObjectURL(blob)
        cacheRef.current = { text, url }
        await playUrl(url)
        if (controller.signal.aborted) return
        setStatus('playing')
      } catch (err) {
        // A Stop press (or unmount) aborts the request mid-flight — not an error.
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return
        }
        setStatus('idle')
        throw err
      }
    },
    [stopPlayback, stop, playUrl],
  )

  // On unmount: stop playback and free the cached Object URL.
  useEffect(() => {
    return () => {
      stopPlayback()
      if (cacheRef.current) {
        URL.revokeObjectURL(cacheRef.current.url)
        cacheRef.current = null
      }
    }
  }, [stopPlayback])

  return { status, play, stop }
}
