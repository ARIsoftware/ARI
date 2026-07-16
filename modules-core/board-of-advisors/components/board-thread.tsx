'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  askBoardStream,
  useBoardConversationDetail,
  CONVERSATIONS_KEY,
  conversationDetailKey,
} from '@/modules/board-of-advisors/hooks/use-board-of-advisors'
import { humanizeBoardError, type FriendlyBoardError } from '@/modules/board-of-advisors/lib/errors'
import { AdvisorAvatar } from './advisor-avatar'
import { Composer } from './composer'
import { CopyButton } from './copy-button'
import { Markdown } from './markdown'
import type { BoardAdvisor, BoardConversation, BoardMessage } from '@/modules/board-of-advisors/types'

interface BoardThreadProps {
  conversationId: string | null
  advisors: BoardAdvisor[]
  onCreateConversation?: () => Promise<BoardConversation>
  onActivate?: (id: string) => void
}

interface StreamingAdvisor {
  id: string
  name: string
  color: string
}

interface StreamingReply {
  advisor: StreamingAdvisor
  content: string
  conversationId: string
}

const SUGGESTIONS = [
  { title: 'Make a hard call', sub: 'should I sell my business?', prompt: 'Should I sell my business?' },
  { title: 'Pressure-test an idea', sub: 'poke holes in my new product concept', prompt: 'I want to pressure-test a new product idea. What questions should I be able to answer before building it?' },
  { title: 'Plan the next year', sub: 'what should my top 3 priorities be?', prompt: 'Help me decide: what should my top 3 priorities be for the next 12 months?' },
  { title: 'Negotiate better', sub: 'prepare me for a tough negotiation', prompt: 'I have a tough negotiation coming up. How should I prepare, and what leverage am I not seeing?' },
]

const FOOTER_NOTE = 'Advisors are AI personas and can make mistakes. Check important decisions.'

export function BoardThread({ conversationId, advisors, onCreateConversation, onActivate }: BoardThreadProps) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useBoardConversationDetail(conversationId)
  const conversation = data?.conversation
  const persistedMessages = useMemo(() => data?.messages ?? [], [data?.messages])

  const [pendingUser, setPendingUser] = useState<BoardMessage | null>(null)
  const [roundReplies, setRoundReplies] = useState<BoardMessage[]>([])
  const [streaming, setStreaming] = useState<StreamingReply | null>(null)
  const [isSending, setIsSending] = useState(false)
  // Stamped with the conversation they belong to, so a round that fails in
  // conversation A never shows its error (or reposts its question) in B.
  const [error, setError] = useState<{ cid: string; error: FriendlyBoardError } | null>(null)
  const [lastQuestion, setLastQuestion] = useState<{ cid: string; content: string } | null>(null)
  const sendingRef = useRef(false)
  const streamingAdvisorRef = useRef<StreamingAdvisor | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Only auto-scroll while the user is already at (or near) the bottom, so
  // scrolling up to re-read earlier replies isn't yanked back per token.
  const stickToBottomRef = useRef(true)

  // Reset transient state when the user switches to a different conversation —
  // but never while a send is mid-flight (e.g. a brand-new discussion being created).
  useEffect(() => {
    if (sendingRef.current) return
    setPendingUser(null)
    setRoundReplies([])
    setStreaming(null)
    setIsSending(false)
    setError(null)
  }, [conversationId])

  // Stop a running round if the user navigates away entirely.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  // Auto-scroll as new tokens arrive — coalesced to one scroll per frame, and
  // suspended while the user has scrolled up.
  useEffect(() => {
    if (!stickToBottomRef.current) return
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [persistedMessages.length, pendingUser, roundReplies.length, streaming?.content, error])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const handleSend = async (content: string) => {
    if (sendingRef.current) return

    sendingRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    stickToBottomRef.current = true
    setIsSending(true)
    setError(null)
    setLastQuestion({ cid: conversationId ?? '', content })
    setRoundReplies([])

    // Rows the server persisted this round, collected so the finally block can
    // merge them into the query cache without a blocking refetch.
    const collected: BoardMessage[] = []
    let userRow: BoardMessage = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId ?? '',
      user_id: '',
      role: 'user',
      advisor_id: null,
      advisor_name: null,
      advisor_color: null,
      content,
      created_at: new Date().toISOString(),
    }
    setPendingUser(userRow)

    let cid = conversationId
    let streamError: string | null = null
    let doneTitle: string | undefined
    try {
      if (!cid) {
        if (!onCreateConversation) throw new Error('Cannot start a new discussion here.')
        const convo = await onCreateConversation()
        cid = convo.id
        onActivate?.(convo.id)
      }
      const activeCid = cid
      userRow = { ...userRow, conversation_id: activeCid }
      setPendingUser(userRow)
      setLastQuestion({ cid: activeCid, content })

      await askBoardStream({
        conversationId: activeCid,
        content,
        signal: controller.signal,
        onUserMessageId: (id) => {
          // Swap in the real id so the row de-dupes against the refetched history.
          userRow = { ...userRow, id }
          setPendingUser(userRow)
        },
        onAdvisorStart: (advisor) => {
          streamingAdvisorRef.current = advisor
          setStreaming({ advisor, content: '', conversationId: activeCid })
        },
        onDelta: (text) => {
          setStreaming((prev) => (prev ? { ...prev, content: prev.content + text } : prev))
        },
        onAdvisorDone: (messageId, replyContent) => {
          const advisor = streamingAdvisorRef.current
          if (!advisor) return
          const row: BoardMessage = {
            id: messageId,
            conversation_id: activeCid,
            user_id: '',
            role: 'advisor',
            advisor_id: advisor.id,
            advisor_name: advisor.name,
            advisor_color: advisor.color,
            content: replyContent,
            created_at: new Date().toISOString(),
          }
          collected.push(row)
          streamingAdvisorRef.current = null
          setStreaming(null)
          setRoundReplies((replies) => [...replies, row])
        },
        onDone: (title) => {
          doneTitle = title
        },
        onError: (message) => {
          streamError = message
        },
      })

      if (doneTitle) {
        queryClient.setQueryData<BoardConversation[]>(CONVERSATIONS_KEY, (old = []) =>
          old.map((c) => (c.id === activeCid ? { ...c, title: doneTitle! } : c))
        )
      }
    } catch (err) {
      // An intentional Stop (or unmount) is not an error.
      if (!controller.signal.aborted) {
        streamError = err instanceof Error ? err.message : 'Please try again.'
      }
    } finally {
      abortRef.current = null
      if (streamError) {
        setError({ cid: cid ?? conversationId ?? '', error: humanizeBoardError(streamError) })
      }
      if (cid) {
        // Merge the rows we already hold into the cache (no blocking
        // re-download of the whole conversation), then reconcile in the
        // background for server timestamps and ordering.
        const rows = [userRow, ...collected].filter((r) => !r.id.startsWith('optimistic-'))
        queryClient.setQueryData<{ conversation: BoardConversation; messages: BoardMessage[] }>(
          conversationDetailKey(cid),
          (old) => {
            if (!old) return old
            const known = new Set(old.messages.map((m) => m.id))
            const fresh = rows.filter((r) => !known.has(r.id))
            return { ...old, messages: [...old.messages, ...fresh] }
          }
        )
        queryClient.invalidateQueries({ queryKey: conversationDetailKey(cid) })
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
        // After a Stop, the server persists the in-flight partial reply AFTER
        // the abort propagates — the immediate refetch above can race it.
        // Reconcile once more shortly after so the partial doesn't vanish.
        if (controller.signal.aborted) {
          const stoppedCid = cid
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: conversationDetailKey(stoppedCid) })
          }, 1500)
        }
      }
      setPendingUser(null)
      setRoundReplies([])
      setStreaming(null)
      streamingAdvisorRef.current = null
      setIsSending(false)
      sendingRef.current = false
    }
  }

  // Retry only applies in the conversation the question was asked in.
  const retryableQuestion = lastQuestion && lastQuestion.cid === (conversationId ?? '') ? lastQuestion.content : null
  const retryLastQuestion = () => {
    if (retryableQuestion) handleSend(retryableQuestion)
  }

  const visibleError = error && error.cid === (conversationId ?? '') ? error.error : null

  const stopRound = () => {
    abortRef.current?.abort()
  }

  // Transient rows render only in the conversation they belong to, and only
  // until the same id shows up in the persisted history.
  const visibleMessages = useMemo(() => {
    const persistedIds = new Set(persistedMessages.map((m) => m.id))
    const currentCid = conversationId ?? ''
    const transient = [
      ...(pendingUser ? [pendingUser] : []),
      ...roundReplies,
    ].filter((m) => m.conversation_id === currentCid && !persistedIds.has(m.id))
    return [...persistedMessages, ...transient]
  }, [persistedMessages, pendingUser, roundReplies, conversationId])

  const visibleStreaming = streaming && streaming.conversationId === conversationId ? streaming : null

  // Loading an existing discussion that hasn't streamed yet.
  if (conversationId && isLoading && persistedMessages.length === 0 && !pendingUser && !streaming) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b px-5 py-3.5">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex-1 space-y-6 p-6">
          <Skeleton className="ml-auto h-12 w-1/2 rounded-3xl" />
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="h-20 w-2/3" />
        </div>
      </div>
    )
  }

  // A failed fetch must not masquerade as an empty discussion. Only show the
  // error state when there's nothing else on screen: a failed *background*
  // refetch (e.g. after a send) still has cached data / an in-flight round to
  // show.
  if (conversationId && isError && !data && !pendingUser && roundReplies.length === 0 && !streaming) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ErrorCard
            error={{
              title: 'Couldn’t load this discussion',
              description: 'Something went wrong fetching the messages. Check your connection and try again.',
              showIntegrations: false,
            }}
            onRetry={() => refetch()}
          />
        </div>
      </div>
    )
  }

  const showWelcome = visibleMessages.length === 0 && !visibleStreaming

  // Centered welcome: heading, composer in the middle, board prompts below.
  if (showWelcome) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-4 py-10">
          <div className="mb-7 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-500">
            {advisors.length > 0 && (
              <div className="mb-4 flex -space-x-2.5">
                {advisors.slice(0, 6).map((a) => (
                  <AdvisorAvatar key={a.id} name={a.name} color={a.color} size="lg" className="border-2 border-background" />
                ))}
                {advisors.length > 6 && (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-muted text-sm font-semibold text-muted-foreground">
                    +{advisors.length - 6}
                  </span>
                )}
              </div>
            )}
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">The board is in session</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Set up your advisors in Settings, then use this chat whenever you need guidance. You can pressure-test an idea, explore a go-to-market strategy, or work through a challenging situation. Each advisor will respond one at a time, giving you a range of perspectives to consider.
            </p>
          </div>

          <Composer onSend={handleSend} isSending={isSending} advisorCount={advisors.length} onStop={stopRound} />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{FOOTER_NOTE}</p>

          {visibleError && (
            <div className="mt-5">
              <ErrorCard error={visibleError} onRetry={retryableQuestion ? retryLastQuestion : undefined} />
            </div>
          )}

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {SUGGESTIONS.map(({ title, sub, prompt }) => (
              <button
                key={title}
                type="button"
                onClick={() => handleSend(prompt)}
                disabled={isSending || advisors.length === 0}
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
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              started {formatRelativeTime(new Date(conversation.created_at))}
            </p>
          </div>
          {advisors.length > 0 && (
            <div className="flex shrink-0 -space-x-1.5" title={advisors.map((a) => a.name).join(', ')}>
              {advisors.slice(0, 5).map((a) => (
                <AdvisorAvatar key={a.id} name={a.name} color={a.color} size="sm" className="border-2 border-background" />
              ))}
              {advisors.length > 5 && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground">
                  +{advisors.length - 5}
                </span>
              )}
            </div>
          )}
        </header>
      )}

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-7 px-4 py-6">
          {visibleMessages.map((msg) => <MessageRow key={msg.id} message={msg} />)}
          {visibleStreaming && (
            <MessageRow
              message={{
                id: 'streaming',
                conversation_id: visibleStreaming.conversationId,
                user_id: '',
                role: 'advisor',
                advisor_id: visibleStreaming.advisor.id,
                advisor_name: visibleStreaming.advisor.name,
                advisor_color: visibleStreaming.advisor.color,
                content: visibleStreaming.content,
                created_at: new Date().toISOString(),
              }}
              streaming
            />
          )}
          {visibleError && <ErrorCard error={visibleError} onRetry={retryableQuestion ? retryLastQuestion : undefined} />}
        </div>
      </div>

      <div className="px-4 pb-8 pt-3">
        <div className="mx-auto max-w-3xl">
          <Composer onSend={handleSend} isSending={isSending} advisorCount={advisors.length} onStop={stopRound} />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{FOOTER_NOTE}</p>
        </div>
      </div>
    </div>
  )
}

function ErrorCard({ error, onRetry }: { error: FriendlyBoardError; onRetry?: () => void }) {
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
              Ask again
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5 text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  )
}

function AdvisorReplyBody({ content, streaming }: { content: string; streaming?: boolean }) {
  if (streaming && !content) {
    return <TypingDots />
  }
  if (streaming) {
    return (
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {content}
        <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-current align-middle opacity-70" />
      </div>
    )
  }
  return <Markdown content={content} />
}

const MessageRow = memo(function MessageRow({ message, streaming }: { message: BoardMessage; streaming?: boolean }) {
  // User — subtle pill on the right, no avatar.
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-3xl bg-secondary px-4 py-2.5 text-sm leading-relaxed text-secondary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  const advisorName = message.advisor_name ?? 'Advisor'
  const advisorColor = message.advisor_color ?? '#64748b'

  // Advisor — colored-initials avatar + name + content + action row.
  return (
    <div className="group flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <AdvisorAvatar name={advisorName} color={advisorColor} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-semibold" style={{ color: advisorColor }}>
          {advisorName}
        </p>
        <AdvisorReplyBody content={message.content} streaming={streaming} />
        {!streaming && message.content && (
          <CopyButton
            text={message.content}
            className={cn(
              'text-[11px] opacity-0 transition-all',
              'group-hover:opacity-100 focus-visible:opacity-100',
            )}
          />
        )}
      </div>
    </div>
  )
})
