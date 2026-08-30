import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiKeysStatus } from '@/hooks/use-api-keys-status'
import { AI_VOICE_PROVIDERS } from '@/lib/ai-providers'
import { useEnabledModules, useDashboardQuote } from './use-dashboard'
import type {
  BriefGreeting,
  BriefVoiceSettings,
  BriefWeather,
  DashboardTask,
} from '@/modules/dashboard/types'

// Stable empty fallbacks so downstream memos and props keep their identity
// while queries are loading or disabled.
const EMPTY_TASKS: DashboardTask[] = []
const EMPTY_MODULES = new Set<string>()

/**
 * Optional garnish data (weather, greeting, voice settings): a failure renders
 * as absence rather than an error, so the fetch returns null on !ok by design.
 */
function useOptionalJson<T>(key: string, url: string, enabled: boolean, staleTime: number) {
  return useQuery({
    queryKey: [key],
    queryFn: async (): Promise<T | null> => {
      const res = await fetch(url)
      if (!res.ok) return null
      return res.json()
    },
    enabled,
    staleTime,
  })
}

/**
 * First name for the greeting: user_preferences.name first, then the account's
 * first_name/name from /api/users/me — same precedence as Morning Brief.
 */
function useFirstName() {
  return useQuery({
    queryKey: ['dashboard-first-name'],
    queryFn: async (): Promise<string | null> => {
      const [prefsRes, meRes] = await Promise.all([
        fetch('/api/user-preferences'),
        fetch('/api/users/me'),
      ])
      if (prefsRes.ok) {
        const prefs = await prefsRes.json()
        const name = String(prefs.name ?? '').trim()
        if (name) return name.split(/\s+/)[0]
      }
      if (!meRes.ok) return null
      const me = await meRes.json()
      const fallback = String(me.first_name ?? me.name ?? '').trim()
      return fallback ? fallback.split(/\s+/)[0] : null
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useTopPriorities(enabled: boolean) {
  return useQuery({
    // 'tasks' prefix: every task mutation invalidates ['tasks'], which covers
    // this key too (TanStack invalidation is prefix-based), so the list
    // refreshes after edits without colliding with the exact ['tasks'] entry.
    queryKey: ['tasks', 'priorities', 'dashboard'],
    queryFn: async (): Promise<DashboardTask[]> => {
      const res = await fetch('/api/modules/tasks/priorities?limit=5&completed=false')
      if (!res.ok) throw new Error('Failed to fetch priorities')
      return res.json()
    },
    enabled,
  })
}

function useTasksList(enabled: boolean) {
  // Shares the tasks module's ['tasks'] cache. The queryFn must behave like the
  // tasks module's own (throw on !ok) — returning [] here would write an empty
  // list into the shared cache as a success and the Tasks page would trust it.
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<DashboardTask[]> => {
      const res = await fetch('/api/modules/tasks')
      if (!res.ok) throw new Error('Failed to fetch tasks')
      return res.json()
    },
    enabled,
  })
}

/** Combined data hook for the dashboard's Default (clean) layout. */
export function useDefaultLayoutData() {
  const { data: enabledModules = EMPTY_MODULES, isLoading: modulesLoading } = useEnabledModules()

  const tasksEnabled = enabledModules.has('tasks')
  const quotesEnabled = enabledModules.has('quotes')
  const morningBriefEnabled = enabledModules.has('morning-brief')

  const firstNameQuery = useFirstName()
  const weatherQuery = useOptionalJson<BriefWeather>(
    'dashboard-weather',
    '/api/modules/morning-brief/weather',
    morningBriefEnabled,
    30 * 60 * 1000,
  )
  const greetingQuery = useOptionalJson<BriefGreeting>(
    'dashboard-brief-greeting',
    '/api/modules/morning-brief/greeting',
    morningBriefEnabled,
    60 * 60 * 1000,
  )
  const quoteQuery = useDashboardQuote(quotesEnabled)
  const prioritiesQuery = useTopPriorities(tasksEnabled)
  const tasksQuery = useTasksList(tasksEnabled)

  // Listen is only offered when a voice provider is selected in Morning Brief
  // AND that provider's API key is still configured — same gate as the Morning
  // Brief page itself (a stale selection after key removal stays hidden).
  const voiceSettingsQuery = useOptionalJson<BriefVoiceSettings>(
    'dashboard-voice-settings',
    '/api/modules/morning-brief/settings',
    morningBriefEnabled,
    5 * 60 * 1000,
  )
  const { data: providerKeys = {} } = useApiKeysStatus()
  const voiceProvider =
    AI_VOICE_PROVIDERS.find((p) => p.id === voiceSettingsQuery.data?.selectedVoiceProvider) ?? null
  const listenReady =
    morningBriefEnabled &&
    !!voiceProvider &&
    (providerKeys[voiceProvider.primaryEnvKey]?.configured ?? false)

  return {
    listenReady,
    tasksEnabled,

    firstName: firstNameQuery.data ?? null,
    weather: weatherQuery.data ?? null,
    greeting: greetingQuery.data ?? null,
    quote: quoteQuery.data ?? null,
    topPriorities: prioritiesQuery.data ?? EMPTY_TASKS,
    tasks: tasksQuery.data ?? EMPTY_TASKS,

    // Disabled queries report isLoading=false, so gate on the enabled-modules
    // fetch too — otherwise the empty state flashes before the spinner.
    tasksLoading: modulesLoading || tasksQuery.isLoading,
  }
}

export type ListenState = 'idle' | 'loading' | 'playing'

/**
 * "Listen" button behavior: read the brief aloud via the Morning Brief TTS
 * endpoint (ElevenLabs). The page only renders the button when `listenReady`
 * says a voice provider is configured — there is no browser-speech fallback.
 * The synthesized clip is cached per text so replaying doesn't re-hit (and
 * re-bill) the API.
 */
export function useListenBrief(text: string) {
  const [state, setState] = useState<ListenState>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cacheRef = useRef<{ text: string; blob: Blob } | null>(null)
  // Incremented on every stop/start so a stale fetch can't start playback.
  const generationRef = useRef(0)

  const stop = useCallback(() => {
    generationRef.current++
    abortRef.current?.abort()
    abortRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      URL.revokeObjectURL(audioRef.current.src)
      audioRef.current = null
    }
    setState('idle')
  }, [])

  useEffect(() => stop, [stop])

  const toggle = useCallback(async () => {
    if (state !== 'idle') {
      stop()
      return
    }
    if (!text) return

    const generation = ++generationRef.current
    setState('loading')

    let blob = cacheRef.current?.text === text ? cacheRef.current.blob : null

    if (!blob) {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch('/api/modules/morning-brief/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        })
        if (generation !== generationRef.current) return
        if (res.ok) {
          blob = await res.blob()
          if (generation !== generationRef.current) return
          cacheRef.current = { text, blob }
        }
      } catch {
        if (generation !== generationRef.current) return
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    }

    if (!blob) {
      // TTS unavailable or failed — nothing to play.
      setState('idle')
      return
    }

    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    const finish = () => {
      URL.revokeObjectURL(url)
      if (audioRef.current === audio) audioRef.current = null
      if (generation === generationRef.current) setState('idle')
    }
    audio.onended = finish
    audio.onerror = finish
    audioRef.current = audio
    try {
      await audio.play()
      if (generation !== generationRef.current) return
      setState('playing')
    } catch {
      // Autoplay policy or decode failure — clean up quietly.
      finish()
    }
  }, [state, stop, text])

  return { state, toggle }
}
