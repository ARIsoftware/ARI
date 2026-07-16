import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
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
    mutationFn: async (params: { name: string; description: string }): Promise<BoardAdvisor> => {
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
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; description?: string }): Promise<BoardAdvisor> => {
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
