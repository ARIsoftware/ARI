import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ChatConversation,
  ChatMessage,
  ChatUpload,
  ChatProviderStatus,
  ChatSettings,
  ChatAttachment,
  ChatProvider,
} from '@/modules/chat/types'

export const CONVERSATIONS_KEY = ['chat-conversations']
export const conversationDetailKey = (id: string) => ['chat-conversation', id]
const UPLOADS_KEY = ['chat-uploads']
const SETTINGS_KEY = ['chat-settings']
const PROVIDERS_KEY = ['chat-providers']

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

// ─── Conversations ─────────────────────────────────────────────────────

export function useChatConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: async (): Promise<ChatConversation[]> => {
      const res = await fetch('/api/modules/chat/conversations')
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load conversations'))
      const data = await res.json()
      return data.conversations || []
    },
  })
}

export interface ConversationDetail {
  conversation: ChatConversation
  messages: ChatMessage[]
}

export function useChatConversationDetail(id: string | null) {
  return useQuery({
    queryKey: conversationDetailKey(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<ConversationDetail> => {
      const res = await fetch(`/api/modules/chat/conversations/${id}`)
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load conversation'))
      return res.json()
    },
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { title?: string; provider: ChatProvider; model: string }): Promise<ChatConversation> => {
      const res = await fetch('/api/modules/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to create conversation'))
      const data = await res.json()
      return data.conversation
    },
    onSuccess: (created) => {
      queryClient.setQueryData<ChatConversation[]>(CONVERSATIONS_KEY, (old = []) => [created, ...old])
      queryClient.setQueryData(conversationDetailKey(created.id), { conversation: created, messages: [] })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

/** Rename a conversation and/or switch the provider + model it talks to. */
export function useUpdateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string
      title?: string
      provider?: ChatProvider
      model?: string
    }): Promise<ChatConversation> => {
      const res = await fetch(`/api/modules/chat/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to update chat'))
      const data = await res.json()
      return data.conversation
    },
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY })
      await queryClient.cancelQueries({ queryKey: conversationDetailKey(id) })
      const previous = queryClient.getQueryData<ChatConversation[]>(CONVERSATIONS_KEY)
      const previousDetail = queryClient.getQueryData<ConversationDetail>(conversationDetailKey(id))
      // Only copy fields the caller set, so a model switch never blanks the title.
      const apply = (c: ChatConversation): ChatConversation => ({
        ...c,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
      })
      queryClient.setQueryData<ChatConversation[]>(CONVERSATIONS_KEY, (old = []) =>
        old.map((c) => (c.id === id ? apply(c) : c))
      )
      if (previousDetail) {
        queryClient.setQueryData<ConversationDetail>(conversationDetailKey(id), {
          ...previousDetail,
          conversation: apply(previousDetail.conversation),
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

export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/chat/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to delete'))
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY })
      const previous = queryClient.getQueryData<ChatConversation[]>(CONVERSATIONS_KEY)
      queryClient.setQueryData<ChatConversation[]>(CONVERSATIONS_KEY, (old = []) =>
        old.filter((c) => c.id !== deletedId)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(CONVERSATIONS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

// ─── Streaming replies ─────────────────────────────────────────────────

/** A request that produces a streamed assistant reply. */
export type ChatTurnRequest =
  | { kind: 'send'; content: string; attachments: ChatAttachment[] }
  | { kind: 'regenerate' }
  | { kind: 'edit'; messageId: string; content: string }

export interface StreamTurnArgs {
  conversationId: string
  request: ChatTurnRequest
  onDelta?: (text: string) => void
  /** A long step is running (e.g. "Generating image…"). */
  onStatus?: (text: string) => void
  onUserMessageId?: (id: string) => void
  onDone?: (id: string, content: string, partial?: boolean) => void
  onError?: (message: string) => void
  signal?: AbortSignal
}

function turnFetch(conversationId: string, request: ChatTurnRequest, signal?: AbortSignal): Promise<Response> {
  const base = `/api/modules/chat/conversations/${conversationId}`
  const json = { 'Content-Type': 'application/json' }
  switch (request.kind) {
    case 'send':
      return fetch(`${base}/messages`, {
        method: 'POST',
        headers: json,
        signal,
        body: JSON.stringify({ content: request.content, attachments: request.attachments }),
      })
    case 'regenerate':
      return fetch(`${base}/regenerate`, { method: 'POST', signal })
    case 'edit':
      return fetch(`${base}/messages/${request.messageId}`, {
        method: 'PATCH',
        headers: json,
        signal,
        body: JSON.stringify({ content: request.content }),
      })
  }
}

/** Run one reply turn and feed its Server-Sent Events to the callbacks. */
export async function streamTurn(args: StreamTurnArgs): Promise<void> {
  const res = await turnFetch(args.conversationId, args.request, args.signal)

  if (!res.ok || !res.body) {
    const msg = await readJsonError(res, 'Failed to send message')
    args.onError?.(msg)
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const processBlock = (block: string) => {
    const trimmed = block.trim()
    if (!trimmed.startsWith('data:')) return
    const dataStr = trimmed.replace(/^data:\s*/, '').trim()
    if (!dataStr) return
    try {
      const event = JSON.parse(dataStr) as Record<string, unknown>
      switch (event.type) {
        case 'delta':
          args.onDelta?.(String(event.text ?? ''))
          break
        case 'status':
          args.onStatus?.(String(event.text ?? ''))
          break
        case 'user_message_id':
          args.onUserMessageId?.(String(event.id))
          break
        case 'done':
          args.onDone?.(String(event.message_id), String(event.content ?? ''), event.partial === true)
          break
        case 'error':
          args.onError?.(String(event.error ?? 'Unknown error'))
          break
      }
    } catch {
      // Skip malformed events.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    // Normalize CRLF so `\n\n` event framing works regardless of provider.
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      processBlock(buffer.slice(0, idx))
      buffer = buffer.slice(idx + 2)
    }
  }

  // Flush a final event that arrived without a trailing blank line.
  buffer += decoder.decode()
  if (buffer.trim()) processBlock(buffer)
}

// ─── Uploads ───────────────────────────────────────────────────────────

export function useChatUploads() {
  return useQuery({
    queryKey: UPLOADS_KEY,
    queryFn: async (): Promise<ChatUpload[]> => {
      const res = await fetch('/api/modules/chat/uploads')
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load uploads'))
      const data = await res.json()
      return data.uploads || []
    },
  })
}

export function useUploadChatFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, conversationId }: { file: File; conversationId?: string | null }): Promise<ChatUpload> => {
      const formData = new FormData()
      formData.append('file', file)
      if (conversationId) formData.append('conversation_id', conversationId)
      const res = await fetch('/api/modules/chat/uploads', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(await readJsonError(res, 'Upload failed'))
      const data = await res.json()
      return data.upload
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: UPLOADS_KEY })
    },
  })
}

export function useDeleteChatUpload() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/chat/uploads/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to delete upload'))
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: UPLOADS_KEY })
      const previous = queryClient.getQueryData<ChatUpload[]>(UPLOADS_KEY)
      queryClient.setQueryData<ChatUpload[]>(UPLOADS_KEY, (old = []) => old.filter((u) => u.id !== deletedId))
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(UPLOADS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: UPLOADS_KEY })
    },
  })
}

// ─── Settings ──────────────────────────────────────────────────────────

export function useChatSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<ChatSettings>> => {
      // The API returns 200 `{}` when no settings row exists, so a non-OK
      // response is a real error — surface it so callers can show an error
      // state instead of silently treating it as "not onboarded".
      const res = await fetch('/api/modules/chat/settings')
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load settings'))
      return res.json()
    },
  })
}

export function useUpdateChatSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<ChatSettings>): Promise<void> => {
      const res = await fetch('/api/modules/chat/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to save settings'))
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<ChatSettings>>(SETTINGS_KEY)
      queryClient.setQueryData<Partial<ChatSettings>>(SETTINGS_KEY, (old = {}) => ({ ...old, ...newSettings }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(SETTINGS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}

// ─── Providers ─────────────────────────────────────────────────────────

export function useChatProviders() {
  return useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: async (): Promise<ChatProviderStatus[]> => {
      const res = await fetch('/api/modules/chat/providers')
      if (!res.ok) throw new Error(await readJsonError(res, 'Failed to load providers'))
      const data = await res.json()
      return data.providers || []
    },
  })
}
