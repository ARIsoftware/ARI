import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  AdvisorSex,
  BoardAdvisor,
  BoardConversation,
  BoardMessage,
  BoardProviderStatus,
  BoardSettings,
} from '@/modules/board-of-advisors/types'

export const ADVISORS_KEY = ['board-advisors']
export const CONVERSATIONS_KEY = ['board-conversations']
export const conversationDetailKey = (id: string) => ['board-conversation', id]
export const SETTINGS_KEY = ['board-settings']
export const PROVIDERS_KEY = ['board-providers']

async function readJsonError(res: Response, fallback: string): Promise<string> {
  try {
    const err = await res.json()
    const details = Array.isArray(err.details)
      ? err.details.map((d: { message?: string }) => d.message).filter(Boolean).join(', ')
      : ''
    return details || err.error || fallback
  } catch {
    return fallback
  }
}

// ─── Advisors ──────────────────────────────────────────────────────────

export function useAdvisors() {
  return useQuery({
    queryKey: ADVISORS_KEY,
    queryFn: async (): Promise<BoardAdvisor[]> => {
      const res = await fetch('/api/modules/board-of-advisors/advisors')
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load advisors'))
      const data = await res.json()
      return data.advisors || []
    },
  })
}

export function useCreateAdvisor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { name: string; description: string; sex?: AdvisorSex; voice_id?: string | null }): Promise<BoardAdvisor> => {
      const res = await fetch('/api/modules/board-of-advisors/advisors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to add advisor'))
      const data = await res.json()
      return data.advisor
    },
    onSuccess: (created) => {
      queryClient.setQueryData<BoardAdvisor[]>(ADVISORS_KEY, (old = []) => [...old, created])
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ADVISORS_KEY })
    },
  })
}

export function useUpdateAdvisor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; description?: string; sex?: AdvisorSex; voice_id?: string | null }): Promise<BoardAdvisor> => {
      const res = await fetch(`/api/modules/board-of-advisors/advisors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to update advisor'))
      const data = await res.json()
      return data.advisor
    },
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: ADVISORS_KEY })
      const previous = queryClient.getQueryData<BoardAdvisor[]>(ADVISORS_KEY)
      queryClient.setQueryData<BoardAdvisor[]>(ADVISORS_KEY, (old = []) =>
        old.map((a) => (a.id === id ? { ...a, ...patch } : a))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(ADVISORS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ADVISORS_KEY })
    },
  })
}

export function useDeleteAdvisor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/board-of-advisors/advisors/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to remove advisor'))
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ADVISORS_KEY })
      const previous = queryClient.getQueryData<BoardAdvisor[]>(ADVISORS_KEY)
      queryClient.setQueryData<BoardAdvisor[]>(ADVISORS_KEY, (old = []) =>
        old.filter((a) => a.id !== deletedId)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(ADVISORS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ADVISORS_KEY })
    },
  })
}

export function useReorderAdvisors() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (order: string[]): Promise<void> => {
      const res = await fetch('/api/modules/board-of-advisors/advisors/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to save the speaking order'))
    },
    onMutate: async (order) => {
      await queryClient.cancelQueries({ queryKey: ADVISORS_KEY })
      const previous = queryClient.getQueryData<BoardAdvisor[]>(ADVISORS_KEY)
      queryClient.setQueryData<BoardAdvisor[]>(ADVISORS_KEY, (old = []) => {
        const byId = new Map(old.map((a) => [a.id, a]))
        const reordered = order
          .map((id, index) => {
            const advisor = byId.get(id)
            return advisor ? { ...advisor, sort_order: index } : null
          })
          .filter((a): a is BoardAdvisor => a !== null)
        return reordered.length === old.length ? reordered : old
      })
      return { previous }
    },
    onError: (_err, _order, context) => {
      if (context?.previous) queryClient.setQueryData(ADVISORS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ADVISORS_KEY })
    },
  })
}

// ─── Conversations ─────────────────────────────────────────────────────

export function useBoardConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: async (): Promise<BoardConversation[]> => {
      const res = await fetch('/api/modules/board-of-advisors/conversations')
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load discussions'))
      const data = await res.json()
      return data.conversations || []
    },
  })
}

export function useBoardConversationDetail(id: string | null) {
  return useQuery({
    queryKey: conversationDetailKey(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<{ conversation: BoardConversation; messages: BoardMessage[] }> => {
      const res = await fetch(`/api/modules/board-of-advisors/conversations/${id}`)
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load discussion'))
      return res.json()
    },
  })
}

export function useCreateBoardConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<BoardConversation> => {
      const res = await fetch('/api/modules/board-of-advisors/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to start a discussion'))
      const data = await res.json()
      return data.conversation
    },
    onSuccess: (created) => {
      queryClient.setQueryData<BoardConversation[]>(CONVERSATIONS_KEY, (old = []) => [created, ...old])
      queryClient.setQueryData(conversationDetailKey(created.id), { conversation: created, messages: [] })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useRenameBoardConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }): Promise<BoardConversation> => {
      const res = await fetch(`/api/modules/board-of-advisors/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to rename'))
      const data = await res.json()
      return data.conversation
    },
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY })
      await queryClient.cancelQueries({ queryKey: conversationDetailKey(id) })
      const previous = queryClient.getQueryData<BoardConversation[]>(CONVERSATIONS_KEY)
      const previousDetail = queryClient.getQueryData<{ conversation: BoardConversation; messages: BoardMessage[] }>(conversationDetailKey(id))
      queryClient.setQueryData<BoardConversation[]>(CONVERSATIONS_KEY, (old = []) =>
        old.map((c) => (c.id === id ? { ...c, title } : c))
      )
      if (previousDetail) {
        queryClient.setQueryData(conversationDetailKey(id), {
          ...previousDetail,
          conversation: { ...previousDetail.conversation, title },
        })
      }
      return { previous, previousDetail }
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) queryClient.setQueryData(CONVERSATIONS_KEY, context.previous)
      if (context?.previousDetail) queryClient.setQueryData(conversationDetailKey(id), context.previousDetail)
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
      queryClient.invalidateQueries({ queryKey: conversationDetailKey(id) })
    },
  })
}

export function useDeleteBoardConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/board-of-advisors/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to delete'))
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY })
      const previous = queryClient.getQueryData<BoardConversation[]>(CONVERSATIONS_KEY)
      queryClient.setQueryData<BoardConversation[]>(CONVERSATIONS_KEY, (old = []) =>
        old.filter((c) => c.id !== deletedId)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(CONVERSATIONS_KEY, context.previous)
    },
    onSuccess: (_data, deletedId) => {
      queryClient.removeQueries({ queryKey: conversationDetailKey(deletedId) })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

// ─── Streaming roundtable sender ───────────────────────────────────────

export interface AskBoardStreamArgs {
  conversationId: string
  content: string
  /** Aborts the round mid-stream (Stop button / unmount). Completed replies
   *  stay persisted server-side; the in-flight one is saved as partial. */
  signal?: AbortSignal
  onUserMessageId?: (id: string) => void
  onAdvisorStart?: (advisor: { id: string; name: string; color: string }) => void
  onDelta?: (text: string) => void
  onAdvisorDone?: (messageId: string, content: string) => void
  onDone?: (title?: string) => void
  onError?: (message: string) => void
}

export async function askBoardStream(args: AskBoardStreamArgs): Promise<void> {
  const res = await fetch(`/api/modules/board-of-advisors/conversations/${args.conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: args.signal,
    body: JSON.stringify({ content: args.content }),
  })

  if (!res.ok || !res.body) {
    const msg = await readJsonError(res, 'Failed to ask the board')
    args.onError?.(msg)
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawTerminal = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 2)
      if (!block.startsWith('data:')) continue
      const dataStr = block.replace(/^data:\s*/, '').trim()
      if (!dataStr) continue
      try {
        const event = JSON.parse(dataStr) as Record<string, unknown>
        switch (event.type) {
          case 'user_message_id':
            args.onUserMessageId?.(String(event.id))
            break
          case 'advisor_start':
            args.onAdvisorStart?.(event.advisor as { id: string; name: string; color: string })
            break
          case 'delta':
            args.onDelta?.(String(event.text ?? ''))
            break
          case 'advisor_done':
            args.onAdvisorDone?.(String(event.message_id), String(event.content ?? ''))
            break
          case 'done':
            sawTerminal = true
            args.onDone?.(typeof event.title === 'string' ? event.title : undefined)
            break
          case 'error':
            sawTerminal = true
            args.onError?.(String(event.error ?? 'Unknown error'))
            break
        }
      } catch {
        // Skip malformed events.
      }
    }
  }

  // The stream ended without a done/error event — the connection dropped
  // mid-round. Surface it instead of silently clearing the UI. An intentional
  // abort (Stop button) is not an error.
  if (!sawTerminal && !args.signal?.aborted) {
    args.onError?.('Connection lost mid-round. Completed replies were saved — ask again to continue.')
  }
}

// ─── Providers & settings ──────────────────────────────────────────────

export function useBoardProviderStatus() {
  return useQuery({
    queryKey: PROVIDERS_KEY,
    // Key material also changes in Settings → Integrations, which can't
    // invalidate this module's cache — so refetch whenever the page mounts
    // (e.g. returning from Integrations). Saves in this module's own settings
    // page invalidate PROVIDERS_KEY directly.
    refetchOnMount: 'always',
    queryFn: async (): Promise<BoardProviderStatus> => {
      const res = await fetch('/api/modules/board-of-advisors/providers')
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load provider status'))
      return res.json()
    },
  })
}

export function useBoardSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<BoardSettings>> => {
      const res = await fetch('/api/modules/board-of-advisors/settings')
      // Throw (rather than return {}) so React Query retries — a transient
      // failure must not re-show onboarding to an onboarded user.
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load settings'))
      return res.json()
    },
  })
}

export function useUpdateBoardSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<BoardSettings>): Promise<void> => {
      const res = await fetch('/api/modules/board-of-advisors/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to save settings'))
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<BoardSettings>>(SETTINGS_KEY)
      queryClient.setQueryData<Partial<BoardSettings>>(SETTINGS_KEY, (old = {}) => ({ ...old, ...newSettings }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(SETTINGS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
      queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY })
    },
  })
}

// ─── Speech (ElevenLabs read-aloud) ────────────────────────────────────

export type AdvisorSpeechStatus = 'idle' | 'loading' | 'playing'

export interface SpeechItem {
  /** The board_messages id — used as the playback identity + cache key. */
  id: string
  text: string
  advisorId: string | null
}

// Keep at most this many synthesized clips cached at once, so a long thread
// doesn't accumulate blob URLs forever.
const SPEECH_CACHE_LIMIT = 24

/**
 * Play advisor replies aloud via the module's ElevenLabs TTS route.
 *
 * A single hook instance drives all playback in a thread: `playingId` marks the
 * message currently sounding, so each reply's button can show its own state,
 * while `playSequence` reads a whole roundtable in order. Clips are cached by
 * message id (blob Object URLs) so replays don't re-bill ElevenLabs; a run
 * token lets `stop()` (or a newer play) cancel an in-flight fetch/sequence
 * cleanly, including a mid-play pause.
 */
export function useAdvisorSpeech() {
  const [status, setStatus] = useState<AdvisorSpeechStatus>('idle')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [sequenceActive, setSequenceActive] = useState(false)

  // ONE persistent <audio> element, reused for every clip. Reusing it (rather
  // than a fresh `new Audio()` per clip) keeps it "unlocked" after the first
  // user-gesture play, so roundtable items 2..N — started from `onended`, not a
  // click — aren't blocked by browser autoplay policy.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // message id → blob Object URL. Bounded via rememberClip().
  const cacheRef = useRef<Map<string, string>>(new Map())
  const settleRef = useRef<(() => void) | null>(null)
  // Bumped on every stop()/new play() — any in-flight run whose token no longer
  // matches bails out instead of racing the newer one.
  const runRef = useRef(0)

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = new Audio()
    return audioRef.current
  }, [])

  // Insert a clip and evict oldest entries past the cap (never the one that's
  // currently loaded in the element). Also refreshes recency on a repeat.
  const rememberClip = useCallback((id: string, url: string) => {
    const cache = cacheRef.current
    cache.delete(id)
    cache.set(id, url)
    if (cache.size <= SPEECH_CACHE_LIMIT) return
    const currentSrc = audioRef.current?.src
    for (const [key, value] of cache) {
      if (cache.size <= SPEECH_CACHE_LIMIT) break
      if (value === currentSrc) continue
      cache.delete(key)
      URL.revokeObjectURL(value)
    }
  }, [])

  const teardownAudio = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
    }
    abortRef.current?.abort()
    abortRef.current = null
    // Resolve any awaiting playback promise so a stopped sequence doesn't hang.
    const settle = settleRef.current
    settleRef.current = null
    settle?.()
  }, [])

  const stop = useCallback(() => {
    runRef.current++
    teardownAudio()
    setStatus('idle')
    setPlayingId(null)
    setSequenceActive(false)
  }, [teardownAudio])

  // Fetch (or reuse) one clip and play it to completion. Throws on TTS error.
  const playOne = useCallback(async (item: SpeechItem, token: number): Promise<void> => {
    teardownAudio()
    setStatus('loading')
    setPlayingId(item.id)

    let url = cacheRef.current.get(item.id)
    if (url) {
      rememberClip(item.id, url) // refresh recency on a cache hit
    } else {
      const controller = new AbortController()
      abortRef.current = controller
      const res = await fetch('/api/modules/board-of-advisors/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.text, advisorId: item.advisorId }),
        signal: controller.signal,
      })
      if (token !== runRef.current || controller.signal.aborted) return
      if (!res.ok) throw new Error(await readJsonError(res, 'Could not generate audio'))
      const blob = await res.blob()
      if (token !== runRef.current || controller.signal.aborted) return
      url = URL.createObjectURL(blob)
      rememberClip(item.id, url)
    }

    if (token !== runRef.current) return

    await new Promise<void>((resolve, reject) => {
      const audio = getAudio()
      settleRef.current = resolve
      // Guards: a handler left over from a superseded run must not resolve/reject
      // or clear settleRef, which now belongs to a newer clip.
      audio.onended = () => {
        if (token !== runRef.current) return
        settleRef.current = null
        resolve()
      }
      audio.onerror = () => {
        if (token !== runRef.current) return
        settleRef.current = null
        reject(new Error('Audio playback failed'))
      }
      audio.src = url!
      audio
        .play()
        .then(() => {
          if (token === runRef.current) setStatus('playing')
        })
        .catch((err) => {
          if (token !== runRef.current) return
          settleRef.current = null
          reject(err)
        })
    })
  }, [teardownAudio, getAudio, rememberClip])

  /** Play (or stop, if already this message) a single reply. */
  const play = useCallback(async (id: string, text: string, advisorId: string | null) => {
    const token = ++runRef.current
    setSequenceActive(false)
    try {
      await playOne({ id, text, advisorId }, token)
    } finally {
      if (token === runRef.current) {
        setStatus('idle')
        setPlayingId(null)
      }
    }
  }, [playOne])

  /** Read a set of replies aloud back-to-back, in the given order. */
  const playSequence = useCallback(async (items: SpeechItem[]) => {
    const token = ++runRef.current
    setSequenceActive(true)
    try {
      for (const item of items) {
        if (token !== runRef.current) break
        await playOne(item, token)
      }
    } finally {
      if (token === runRef.current) {
        setStatus('idle')
        setPlayingId(null)
        setSequenceActive(false)
      }
    }
  }, [playOne])

  // Abort + release everything on unmount.
  useEffect(() => {
    return () => {
      runRef.current++
      teardownAudio()
      const audio = audioRef.current
      if (audio) {
        audio.removeAttribute('src')
        audio.load()
        audioRef.current = null
      }
      for (const url of cacheRef.current.values()) URL.revokeObjectURL(url)
      cacheRef.current.clear()
    }
  }, [teardownAudio])

  return { status, playingId, sequenceActive, play, stop, playSequence }
}

export type AdvisorSpeech = ReturnType<typeof useAdvisorSpeech>
