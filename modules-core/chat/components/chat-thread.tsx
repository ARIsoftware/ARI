'use client'

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AlertTriangle, ImagePlus, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import {
  CONVERSATIONS_KEY,
  conversationDetailKey,
  streamTurn,
  useChatConversationDetail,
  useUpdateConversation,
  type ChatTurnRequest,
  type ConversationDetail,
} from '@/modules/chat/hooks/use-chat'
import { humanizeChatError, type FriendlyChatError } from '@/modules/chat/lib/errors'
import { dayLabel, localDayKey } from '@/modules/chat/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { ChatStyles } from './chat-styles'
import { Composer, type ComposerHandle } from './composer'
import { ConversationActions } from './conversation-actions'
import { AssistantMessage, StreamingMessage, UserMessage } from './message'
import { ModelPicker, type ModelChoice } from './model-picker'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from './ui/message-scroller'
import { Marker, MarkerContent } from './ui/marker'
import { Welcome } from './welcome'
import type { ChatConversation, ChatMessage, ChatProviderStatus } from '@/modules/chat/types'

interface ChatThreadProps {
  conversationId: string | null
  onCreateConversation: () => Promise<ChatConversation>
  onActivate: (id: string) => void
  onDeleted: (id: string) => void
  providers: ChatProviderStatus[]
  /** Provider + model new chats start with. */
  defaultChoice: ModelChoice | null
  onChangeDefault: (choice: ModelChoice) => void
}

/** What the thread shows while a reply is in flight (or just stopped). */
interface ActiveTurn {
  conversationId: string | null
  /** Optimistic user bubble — a new message, or an edited one. */
  pendingUser: ChatMessage | null
  /** Persisted messages from this id on are hidden (they're being replaced). */
  hideFromId: string | null
  /** Ids after the answered turn when the turn started — never "the new reply". */
  replacedIds: string[]
  /** The user turn being answered, once the server confirms it. */
  userTurnId: string | null
  content: string
  /** A long step the server reported (e.g. "Generating image…"), if any. */
  status: string | null
  phase: 'streaming' | 'stopped'
}

interface FailedTurn {
  error: FriendlyChatError
  request: ChatTurnRequest
}

const FOOTER_NOTE =
  'AI-generated information may contain errors. Use appropriate judgment and verify critical details.'

/** Polls after Stop until the server's saved partial reply shows up. */
const STOP_POLL_MS = 700
const STOP_POLL_TRIES = 6

/**
 * Whether the reply for this turn is now in the persisted list: the answered
 * user turn is followed by an assistant message that isn't one it replaces.
 * Checked during render so the live copy and the saved one never both show.
 */
function replyLanded(turn: ActiveTurn, persisted: ChatMessage[]): boolean {
  if (!turn.userTurnId) return false
  const i = persisted.findIndex((m) => m.id === turn.userTurnId)
  if (i === -1) return false
  const next = persisted[i + 1]
  return !!next && next.role === 'assistant' && !turn.replacedIds.includes(next.id)
}

function lastIndexOfRole(messages: ChatMessage[], role: ChatMessage['role']): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === role) return i
  return -1
}

/** Always calls the latest `fn` — lets memoised rows take stable callbacks. */
function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}

export function ChatThread({
  conversationId,
  onCreateConversation,
  onActivate,
  onDeleted,
  providers,
  defaultChoice,
  onChangeDefault,
}: ChatThreadProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading, isError, refetch } = useChatConversationDetail(conversationId)
  const updateConversation = useUpdateConversation()
  const conversation = data?.conversation
  const persisted = useMemo(() => data?.messages ?? [], [data])

  const [turn, setTurn] = useState<ActiveTurn | null>(null)
  const [failed, setFailed] = useState<FailedTurn | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const sendingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const composerRef = useRef<ComposerHandle>(null)
  const dragDepth = useRef(0)

  // Streamed text is batched per animation frame — one render per frame, not per token.
  const deltaBuffer = useRef('')
  const deltaFrame = useRef<number | null>(null)
  const flushDeltas = useCallback(() => {
    if (deltaFrame.current !== null) cancelAnimationFrame(deltaFrame.current)
    deltaFrame.current = null
    const chunk = deltaBuffer.current
    if (!chunk) return
    deltaBuffer.current = ''
    setTurn((t) => (t ? { ...t, content: t.content + chunk } : t))
  }, [])
  const queueDelta = useCallback(
    (text: string) => {
      deltaBuffer.current += text
      if (deltaFrame.current === null) deltaFrame.current = requestAnimationFrame(flushDeltas)
    },
    [flushDeltas],
  )

  // Reset transient state when the user switches to a different conversation —
  // but never while a send is mid-flight (e.g. a brand-new chat being created).
  useEffect(() => {
    if (sendingRef.current) return
    setTurn(null)
    setFailed(null)
    setEditingId(null)
  }, [conversationId])

  const liveTurn = turn && turn.conversationId === conversationId && !replyLanded(turn, persisted) ? turn : null
  const isStreaming = turn?.phase === 'streaming'

  // A stopped reply is saved by the server after the connection drops; keep
  // showing the local copy and poll until the saved one arrives (or give up).
  const stoppedTurn = turn?.phase === 'stopped' ? turn : null
  useEffect(() => {
    if (!stoppedTurn?.conversationId) return
    const cid = stoppedTurn.conversationId
    let tries = 0
    const timer = setInterval(async () => {
      tries++
      if (tries <= STOP_POLL_TRIES) {
        try {
          await queryClient.refetchQueries({ queryKey: conversationDetailKey(cid) })
        } catch {
          // Try again on the next tick.
        }
        const detail = queryClient.getQueryData<ConversationDetail>(conversationDetailKey(cid))
        if (!detail || !replyLanded(stoppedTurn, detail.messages)) return
      }
      clearInterval(timer)
      setTurn((t) => (t === stoppedTurn ? null : t))
    }, STOP_POLL_MS)
    return () => clearInterval(timer)
  }, [stoppedTurn, queryClient])

  // ─── Running a turn ──────────────────────────────────────────────────

  const viewFor = (request: ChatTurnRequest): Pick<ActiveTurn, 'pendingUser' | 'hideFromId' | 'replacedIds' | 'userTurnId'> => {
    switch (request.kind) {
      case 'send':
        return {
          pendingUser: {
            id: `optimistic-${Date.now()}`,
            conversation_id: conversationId ?? '',
            user_id: '',
            role: 'user',
            content: request.content,
            attachments: request.attachments,
            created_at: new Date().toISOString(),
          },
          hideFromId: null,
          replacedIds: [],
          userTurnId: null,
        }
      case 'regenerate': {
        const lastUser = lastIndexOfRole(persisted, 'user')
        const after = persisted.slice(lastUser + 1)
        return {
          pendingUser: null,
          hideFromId: after[0]?.id ?? null,
          replacedIds: after.map((m) => m.id),
          userTurnId: persisted[lastUser]?.id ?? null,
        }
      }
      case 'edit': {
        const i = persisted.findIndex((m) => m.id === request.messageId)
        const target = persisted[i]
        return {
          pendingUser: target ? { ...target, content: request.content } : null,
          hideFromId: request.messageId,
          replacedIds: persisted.slice(i + 1).map((m) => m.id),
          userTurnId: request.messageId,
        }
      }
    }
  }

  const runTurn = async (request: ChatTurnRequest) => {
    if (sendingRef.current) return
    sendingRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    setFailed(null)
    setEditingId(null)
    setTurn({ conversationId, ...viewFor(request), content: '', status: null, phase: 'streaming' })

    let cid = conversationId
    let streamError: string | null = null
    let received = ''
    try {
      if (!cid) {
        const convo = await onCreateConversation()
        cid = convo.id
        setTurn((t) => (t ? { ...t, conversationId: convo.id } : t))
        onActivate(convo.id)
      }
      await streamTurn({
        conversationId: cid,
        request,
        signal: controller.signal,
        onUserMessageId: (id) => setTurn((t) => (t ? { ...t, userTurnId: id } : t)),
        onDelta: (text) => {
          received += text
          queueDelta(text)
        },
        onStatus: (text) => {
          flushDeltas()
          setTurn((t) => (t ? { ...t, status: text } : t))
        },
        onError: (message) => {
          streamError = message
        },
      })
    } catch (err) {
      if (!controller.signal.aborted) {
        streamError = streamError ?? (err instanceof Error ? err.message : 'Please try again.')
      }
    } finally {
      flushDeltas()
      const stopped = controller.signal.aborted
      sendingRef.current = false
      abortRef.current = null
      if (stopped && received) {
        // Keep the partial on screen until the server's saved copy lands.
        setTurn((t) => (t ? { ...t, phase: 'stopped' } : t))
      } else {
        // Refetch the persisted turns into cache BEFORE dropping the live
        // copy, so the completed exchange never flickers out (and a brand-new
        // chat doesn't flash back to the welcome screen).
        if (cid) {
          try {
            await queryClient.refetchQueries({ queryKey: conversationDetailKey(cid) })
          } catch {
            // Fall through — the live copy is cleared below regardless.
          }
        }
        setTurn(null)
      }
      if (cid) queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
      if (streamError) setFailed({ error: humanizeChatError(streamError), request })
    }
  }

  const stop = useCallback(() => abortRef.current?.abort(), [])

  // Esc stops the reply (unless something else — a dialog, the edit box — handled it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !abortRef.current) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      e.preventDefault()
      abortRef.current.abort()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSend = (content: string, attachments: ChatMessage['attachments']) =>
    runTurn({ kind: 'send', content, attachments })
  const handleRegenerate = useStableCallback(() => runTurn({ kind: 'regenerate' }))
  const handleSubmitEdit = useStableCallback((messageId: string, content: string) =>
    runTurn({ kind: 'edit', messageId, content }),
  )
  const handleStartEdit = useStableCallback((id: string) => {
    if (!sendingRef.current) setEditingId(id)
  })
  const handleCancelEdit = useStableCallback(() => {
    setEditingId(null)
    composerRef.current?.focus()
  })
  const retry = () => {
    if (failed) runTurn(failed.request)
  }

  const handleModelChange = (choice: ModelChoice) => {
    if (!conversationId) return
    updateConversation.mutate(
      { id: conversationId, provider: choice.provider, model: choice.model },
      {
        onError: (err) =>
          toast({
            variant: 'destructive',
            title: 'Failed to switch model',
            description: err instanceof Error ? err.message : 'Please try again.',
          }),
      },
    )
  }

  // ─── Drag & drop anywhere on the thread ──────────────────────────────

  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      dragDepth.current++
      setDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault()
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      composerRef.current?.addFiles(Array.from(e.dataTransfer.files))
    },
  }

  const dropOverlay = dragging && (
    <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent/60 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="flex flex-col items-center gap-2 text-center">
        <ImagePlus className="h-8 w-8 text-accent" />
        <p className="text-sm font-medium">Drop files to attach</p>
        <p className="text-xs text-muted-foreground">Images and text files, up to 10 per message</p>
      </div>
    </div>
  )

  // ─── Loading / error states ──────────────────────────────────────────

  // Loading an existing conversation that hasn't streamed yet.
  if (conversationId && isLoading && persisted.length === 0 && !liveTurn) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b px-5 py-3.5">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
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
  if (conversationId && isError && !data && !liveTurn) {
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

  // ─── What's on screen ────────────────────────────────────────────────

  let visible = persisted
  if (liveTurn?.hideFromId) {
    const cut = persisted.findIndex((m) => m.id === liveTurn.hideFromId)
    if (cut !== -1) visible = persisted.slice(0, cut)
  }
  const rows: ChatMessage[] = [...visible]
  if (liveTurn?.pendingUser) {
    const pendingId = liveTurn.userTurnId ?? liveTurn.pendingUser.id
    // Once the server has the user turn it's already in the list — don't show it twice.
    if (!visible.some((m) => m.id === pendingId)) rows.push({ ...liveTurn.pendingUser, id: pendingId })
  }

  const showWelcome = rows.length === 0 && !liveTurn

  const errorCard = failed && <ErrorCard error={failed.error} onRetry={retry} />

  if (showWelcome) {
    return (
      <TooltipProvider delayDuration={300}>
        <ChatStyles />
        <div className="relative flex flex-1 flex-col" {...dropHandlers}>
          {dropOverlay}
          <Welcome
            error={errorCard}
            composer={
              <>
                <Composer
                  ref={composerRef}
                  conversationId={conversationId}
                  onSend={handleSend}
                  onStop={stop}
                  isStreaming={isStreaming}
                  size="large"
                  autoFocus
                  accessory={
                    <ModelPicker
                      value={conversation ? { provider: conversation.provider, model: conversation.model } : defaultChoice}
                      providers={providers}
                      onChange={conversation ? handleModelChange : onChangeDefault}
                      hint={conversation ? 'this chat' : 'new chats'}
                    />
                  }
                />
                <p className="mt-2 text-center text-[11px] text-muted-foreground">{FOOTER_NOTE}</p>
              </>
            }
          />
        </div>
      </TooltipProvider>
    )
  }

  const lastUserIdx = lastIndexOfRole(rows, 'user')
  const lastAssistantIdx = lastIndexOfRole(rows, 'assistant')
  const canAct = !isStreaming && !liveTurn
  // A user turn left without a reply (a failed send, seen after a reload).
  const unanswered = canAct && !failed && !!conversationId && rows[rows.length - 1]?.role === 'user'
  // Day separators only when the chat actually spans more than one day.
  const multiDay = new Set([...rows.map((m) => localDayKey(m.created_at)), ...(liveTurn ? [localDayKey(new Date().toISOString())] : [])]).size > 1

  return (
    <TooltipProvider delayDuration={300}>
      <ChatStyles />
      <div className="relative flex h-full min-w-0 flex-1 flex-col" {...dropHandlers}>
        {dropOverlay}
        {conversation && (
          <header className="flex items-center justify-between gap-3 border-b bg-background/60 px-5 py-2.5 backdrop-blur-sm">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{conversation.title}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Started {formatRelativeTime(new Date(conversation.created_at))}
                <span className="opacity-40"> · </span>
                {persisted.length} message{persisted.length === 1 ? '' : 's'}
              </p>
            </div>
            <ConversationActions conversation={conversation} onDeleted={onDeleted} />
          </header>
        )}

        <MessageScrollerProvider key={conversationId ?? 'new'} autoScroll defaultScrollPosition="last-anchor">
          <MessageScroller className="flex-1">
            <MessageScrollerViewport aria-label="Conversation">
              <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-7 px-4 py-6">
                {rows.map((msg, i) => {
                  const day = localDayKey(msg.created_at)
                  const newDay = multiDay && (i === 0 || day !== localDayKey(rows[i - 1].created_at))
                  return (
                    <Fragment key={msg.id}>
                      {newDay && (
                        <MessageScrollerItem messageId={`day-${day}`}>
                          <Marker variant="separator">
                            <MarkerContent>{dayLabel(msg.created_at)}</MarkerContent>
                          </Marker>
                        </MessageScrollerItem>
                      )}
                      <MessageScrollerItem messageId={msg.id} scrollAnchor={msg.role === 'user'}>
                        {msg.role === 'user' ? (
                          <UserMessage
                            message={msg}
                            hasLaterMessages={i < rows.length - 1}
                            isEditing={editingId === msg.id}
                            canEdit={canAct && !!conversationId && !msg.id.startsWith('optimistic-')}
                            onStartEdit={handleStartEdit}
                            onCancelEdit={handleCancelEdit}
                            onSubmitEdit={handleSubmitEdit}
                          />
                        ) : (
                          <AssistantMessage
                            message={msg}
                            canRegenerate={canAct && i === lastAssistantIdx && i > lastUserIdx}
                            onRegenerate={handleRegenerate}
                          />
                        )}
                      </MessageScrollerItem>
                    </Fragment>
                  )
                })}
                {liveTurn && (
                  <MessageScrollerItem messageId="live-reply">
                    <StreamingMessage
                      content={liveTurn.content}
                      status={liveTurn.status}
                      stopped={liveTurn.phase === 'stopped'}
                    />
                  </MessageScrollerItem>
                )}
                {errorCard && <MessageScrollerItem messageId="turn-error">{errorCard}</MessageScrollerItem>}
                {unanswered && (
                  <MessageScrollerItem messageId="unanswered">
                    <Marker className="text-xs">
                      <MarkerContent>This message hasn&apos;t been answered.</MarkerContent>
                      <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={handleRegenerate}>
                        <RefreshCw className="mr-1.5 h-3 w-3" />
                        Generate reply
                      </Button>
                    </Marker>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        <div className="px-4 pb-20 pt-2">
          <div className="mx-auto max-w-3xl">
            <Composer
              ref={composerRef}
              conversationId={conversationId}
              onSend={handleSend}
              onStop={stop}
              isStreaming={isStreaming}
              autoFocus
              onEditLast={() => {
                const last = rows[lastUserIdx]
                if (last && canAct && conversationId) setEditingId(last.id)
              }}
              accessory={
                <ModelPicker
                  value={conversation ? { provider: conversation.provider, model: conversation.model } : defaultChoice}
                  providers={providers}
                  onChange={handleModelChange}
                  disabled={isStreaming || !conversation}
                  hint="this chat"
                />
              }
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{FOOTER_NOTE}</p>
          </div>
        </div>
      </div>
    </TooltipProvider>
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
