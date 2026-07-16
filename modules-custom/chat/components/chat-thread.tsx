'use client'

import { memo, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, Check, Copy, Paperclip, RefreshCw, Settings as SettingsIcon, Sparkles } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  sendMessageStream,
  useChatConversationDetail,
} from '@/modules/chat/hooks/use-chat'
import { humanizeChatError, type FriendlyChatError } from '@/modules/chat/lib/errors'
import { formatBytes, PROVIDER_LABELS } from '@/modules/chat/lib/utils'
import { Composer } from './composer'
import { Markdown } from './markdown'
import type { ChatAttachment, ChatConversation, ChatMessage } from '@/modules/chat/types'

interface ChatThreadProps {
  conversationId: string | null
  onCreateConversation?: () => Promise<ChatConversation>
  onActivate?: (id: string) => void
}

interface StreamingMessage {
  id: string
  content: string
  partial: boolean
}

const SUGGESTIONS = [
  { title: 'Draft a polite email', sub: 'declining a meeting invitation', prompt: 'Draft a polite email declining a meeting invitation.' },
  { title: 'Explain a concept', sub: 'how does HTTPS keep data secure?', prompt: 'Explain simply: how does HTTPS keep data secure?' },
  { title: 'Plan a weekend trip', sub: 'two days in Lisbon on a budget', prompt: 'Plan a weekend trip: two days in Lisbon on a budget.' },
  { title: 'Write some code', sub: 'a debounce function in TypeScript', prompt: 'Write a debounce function in TypeScript, with comments.' },
]

const FOOTER_NOTE = 'ARI Chat can make mistakes. Check important info.'

export function ChatThread({ conversationId, onCreateConversation, onActivate }: ChatThreadProps) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useChatConversationDetail(conversationId)
  const conversation = data?.conversation
  const persistedMessages = data?.messages ?? []

  const [pendingUser, setPendingUser] = useState<ChatMessage | null>(null)
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<FriendlyChatError | null>(null)
  const [lastSend, setLastSend] = useState<{ content: string; attachments: ChatAttachment[] } | null>(null)
  const sendingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset transient state when the user switches to a different conversation —
  // but never while a send is mid-flight (e.g. a brand-new chat being created).
  useEffect(() => {
    if (sendingRef.current) return
    setPendingUser(null)
    setStreaming(null)
    setIsSending(false)
    setError(null)
  }, [conversationId])

  // Auto-scroll to the bottom as new tokens arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [persistedMessages.length, pendingUser, streaming?.content, error])

  const handleSend = async (content: string, attachments: ChatAttachment[]) => {
    if (sendingRef.current) return

    sendingRef.current = true
    setIsSending(true)
    setError(null)
    setLastSend({ content, attachments })
    setPendingUser({
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId ?? '',
      user_id: '',
      role: 'user',
      content,
      attachments,
      created_at: new Date().toISOString(),
    })
    setStreaming({ id: 'streaming', content: '', partial: false })

    let cid = conversationId
    let streamError: string | null = null
    try {
      if (!cid) {
        if (!onCreateConversation) throw new Error('Cannot start a new chat here.')
        const convo = await onCreateConversation()
        cid = convo.id
        onActivate?.(convo.id)
      }
      await sendMessageStream({
        conversationId: cid,
        content,
        attachments,
        onDelta: (text) => {
          setStreaming((prev) => prev ? { ...prev, content: prev.content + text } : prev)
        },
        onError: (message) => {
          streamError = message
        },
      })
    } catch (err) {
      streamError = err instanceof Error ? err.message : 'Please try again.'
    } finally {
      sendingRef.current = false
      // Refetch the persisted turns into cache BEFORE dropping the optimistic
      // user bubble + streaming text, so the completed exchange never flickers
      // out (and a brand-new chat doesn't flash back to the welcome screen).
      if (cid) {
        try {
          await queryClient.refetchQueries({ queryKey: ['chat-conversation', cid] })
        } catch {
          // Fall through — the optimistic state is cleared below regardless.
        }
        queryClient.invalidateQueries({ queryKey: ['chat-conversations'] })
      }
      setPendingUser(null)
      setStreaming(null)
      setIsSending(false)
      if (streamError) setError(humanizeChatError(streamError))
    }
  }

  const retryLastSend = () => {
    if (lastSend) handleSend(lastSend.content, lastSend.attachments)
  }

  const visibleMessages: ChatMessage[] = [...persistedMessages]
  if (pendingUser) visibleMessages.push(pendingUser)

  // Loading an existing conversation that hasn't streamed yet.
  if (conversationId && isLoading && persistedMessages.length === 0 && !pendingUser && !streaming) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b px-5 py-3.5">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex-1 space-y-6 p-6">
          <Skeleton className="ml-auto h-12 w-1/2 rounded-3xl" />
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="ml-auto h-12 w-2/5 rounded-3xl" />
        </div>
      </div>
    )
  }

  // A failed fetch must not fall through to the "new chat" welcome screen —
  // the conversation exists, we just couldn't load it. Only show the error
  // state when there's nothing else on screen: a failed *background* refetch
  // (e.g. after a send) still has cached data / an in-flight send to show.
  if (conversationId && isError && !data && !pendingUser && !streaming) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ErrorCard
            error={{
              title: 'Failed to load this conversation',
              description: 'The chat could not be fetched. Check your connection and try again.',
              showIntegrations: false,
            }}
            onRetry={() => refetch()}
          />
        </div>
      </div>
    )
  }

  const showWelcome = visibleMessages.length === 0 && !streaming

  // ChatGPT-style centered welcome: heading, composer in the middle, prompts below.
  if (showWelcome) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-4 py-10">
          <div className="mb-7 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-accent/25 blur-xl" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent/60 shadow-lg shadow-accent/20">
                <Sparkles className="h-7 w-7 text-accent-foreground" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What can I help with?</h2>
          </div>

          <Composer conversationId={conversationId} onSend={handleSend} isSending={isSending} />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{FOOTER_NOTE}</p>

          {error && (
            <div className="mt-5">
              <ErrorCard error={error} onRetry={lastSend ? retryLastSend : undefined} />
            </div>
          )}

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {SUGGESTIONS.map(({ title, sub, prompt }) => (
              <button
                key={title}
                type="button"
                onClick={() => handleSend(prompt, [])}
                disabled={isSending}
                className="group rounded-2xl border bg-card/60 px-4 py-3 text-left transition-all hover:border-accent/50 hover:bg-accent/5 hover:shadow-sm disabled:opacity-50"
              >
                <span className="block text-sm font-medium transition-colors group-hover:text-accent">{title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {conversation && (
        <header className="flex items-center justify-between gap-3 border-b bg-background/60 px-5 py-3 backdrop-blur-sm">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{conversation.title}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              {PROVIDER_LABELS[conversation.provider] || conversation.provider}
              <span className="opacity-40">·</span>
              <span className="font-mono">{conversation.model}</span>
              <span className="opacity-40">·</span>
              started {formatRelativeTime(new Date(conversation.created_at))}
            </p>
          </div>
        </header>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-7 px-4 py-6">
          {visibleMessages.map((msg) => <MessageRow key={msg.id} message={msg} />)}
          {streaming && (
            <MessageRow
              message={{
                id: streaming.id,
                conversation_id: conversationId ?? '',
                user_id: '',
                role: 'assistant',
                content: streaming.content,
                attachments: [],
                created_at: new Date().toISOString(),
              }}
              streaming
            />
          )}
          {error && <ErrorCard error={error} onRetry={lastSend ? retryLastSend : undefined} />}
        </div>
      </div>

      <div className="px-4 pb-8 pt-3">
        <div className="mx-auto max-w-3xl">
          <Composer conversationId={conversationId} onSend={handleSend} isSending={isSending} />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{FOOTER_NOTE}</p>
        </div>
      </div>
    </div>
  )
}

function Attachments({ items, align }: { items: ChatAttachment[]; align: 'start' | 'end' }) {
  if (items.length === 0) return null
  return (
    <div className={cn('flex flex-wrap gap-1.5', align === 'end' && 'justify-end')}>
      {items.map((a) => (
        <div
          key={a.upload_id}
          className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1 text-[11px] shadow-sm"
        >
          <Paperclip className="h-3 w-3 text-muted-foreground" />
          <span className="max-w-[180px] truncate">{a.original_name}</span>
          <span className="text-muted-foreground">{formatBytes(a.size)}</span>
        </div>
      ))}
    </div>
  )
}

function ErrorCard({ error, onRetry }: { error: FriendlyChatError; onRetry?: () => void }) {
  return (
    <div className="group flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-semibold text-destructive">{error.title}</p>
        <p className="mt-1 text-sm text-foreground/80">{error.description}</p>
        {error.detail && (
          <p className="mt-2 break-words rounded-md bg-foreground/5 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
            {error.detail}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {error.showIntegrations && (
            <Button asChild size="sm" variant="outline">
              <Link href="/settings?tab=integrations">
                <SettingsIcon className="mr-1.5 h-3.5 w-3.5" />
                Open Integrations
              </Link>
            </Button>
          )}
          {onRetry && (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

const MessageRow = memo(function MessageRow({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  // User — subtle gray pill on the right, no avatar.
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-3xl bg-secondary px-4 py-2.5 text-sm leading-relaxed text-secondary-foreground">
          {message.content}
        </div>
        <Attachments items={message.attachments} align="end" />
      </div>
    )
  }

  // Assistant — no bubble, just avatar + content + action row.
  return (
    <div className="group flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-accent-foreground shadow-sm ring-2 ring-accent/15">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {streaming && !message.content ? (
          <span className="inline-flex items-center gap-1 py-1.5 text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
          </span>
        ) : streaming ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-current align-middle opacity-70" />
          </div>
        ) : (
          <Markdown content={message.content} />
        )}

        <Attachments items={message.attachments} align="start" />

        {!streaming && message.content && (
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-all hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
          >
            {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
})
