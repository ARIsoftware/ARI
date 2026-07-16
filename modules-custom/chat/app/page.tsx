'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, Settings, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'
import {
  useChatSettings,
  useUpdateChatSettings,
  useChatProviders,
  useChatConversations,
  useCreateConversation,
} from '@/modules/chat/hooks/use-chat'
import { useRandomQuote } from '@/modules/chat/hooks/use-quote'
import { ConversationList } from '@/modules/chat/components/conversation-list'
import { ChatThread } from '@/modules/chat/components/chat-thread'
import { ChatOnboarding } from '@/modules/chat/components/onboarding'
import { PROVIDER_LABELS } from '@/modules/chat/lib/utils'
import type { ChatProvider } from '@/modules/chat/types'

export default function ChatPage() {
  const { toast } = useToast()
  const randomQuote = useRandomQuote()

  const { data: settings, isLoading: settingsLoading, isError: settingsError, refetch: refetchSettings } = useChatSettings()
  const updateSettings = useUpdateChatSettings()

  const { data: providers = [], isLoading: providersLoading, isError: providersError, refetch: refetchProviders } = useChatProviders()
  const { data: conversations = [] } = useChatConversations()
  const createConversation = useCreateConversation()

  const [activeId, setActiveId] = useState<string | null>(null)

  // Once we have conversations, default-select the most recent.
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id)
    }
  }, [conversations, activeId])

  const activeProvider = useMemo<{ id: ChatProvider; model: string } | null>(() => {
    if (providers.length === 0) return null
    const configured = providers.filter((p) => p.configured)
    if (configured.length === 0) return null

    const preferred = configured.find((p) => p.id === settings?.defaultProvider) ?? configured[0]
    // Only apply the saved default model when the saved provider is actually
    // the one we're using; otherwise a stale model would be paired with a
    // different provider and every send would 400.
    const useSavedModel = preferred.id === settings?.defaultProvider && !!settings?.defaultModel?.trim()
    const model = useSavedModel
      ? settings!.defaultModel!.trim()
      : preferred.configuredModel ?? preferred.defaultModel
    return { id: preferred.id, model }
  }, [providers, settings])

  const handleCreateConversation = () => {
    if (!activeProvider) {
      toast({
        variant: 'destructive',
        title: 'No provider configured',
        description: 'Add an API key in Settings → Integrations first.',
      })
      return
    }
    createConversation.mutate(
      { provider: activeProvider.id, model: activeProvider.model },
      {
        onSuccess: (convo) => setActiveId(convo.id),
        onError: (err) => toast({
          variant: 'destructive',
          title: 'Failed to start chat',
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
      },
    )
  }

  // Used by the welcome composer to start a chat on the first message (ChatGPT-style).
  const createConversationForSend = async () => {
    if (!activeProvider) throw new Error('Add an API key in Settings → Integrations first.')
    return createConversation.mutateAsync({ provider: activeProvider.id, model: activeProvider.model })
  }

  if (settingsLoading || providersLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // A failed fetch must not masquerade as "no providers configured".
  if (settingsError || providersError) {
    return (
      <div className="flex items-center justify-center h-96 p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>Failed to load chat</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>The chat settings could not be fetched. Check your connection and try again.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (settingsError) refetchSettings()
                if (providersError) refetchProviders()
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!settings?.onboardingCompleted) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <h1 className="text-4xl font-medium">Chat</h1>
          {randomQuote && (
            <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>
          )}
        </div>
        <ChatOnboarding
          isPending={updateSettings.isPending}
          onComplete={() => {
            updateSettings.mutate(
              { onboardingCompleted: true },
              {
                onError: (err) => toast({
                  variant: 'destructive',
                  title: 'Failed to save',
                  description: err instanceof Error ? err.message : 'Please try again.',
                }),
              },
            )
          }}
        />
      </div>
    )
  }

  const configuredCount = providers.filter((p) => p.configured).length

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] min-h-[600px]">
      <div className="border-b px-6 pb-3 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/60 text-accent-foreground shadow-sm shadow-accent/20">
                <Sparkles className="h-5 w-5" />
              </span>
              <h1 className="text-3xl font-medium tracking-tight">Chat</h1>
            </div>
            {randomQuote && (
              <p className="mt-1.5 text-sm italic text-[#aa2020]">&ldquo;{randomQuote.quote}&rdquo;</p>
            )}
          </div>
          <Link
            href="/chat/settings"
            className="group flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs shadow-sm transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            {activeProvider ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="font-medium">{PROVIDER_LABELS[activeProvider.id] ?? activeProvider.id}</span>
                <span className="font-mono text-muted-foreground">{activeProvider.model}</span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground">No provider configured</span>
              </>
            )}
            <Settings className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-foreground" />
          </Link>
        </div>
      </div>

      {configuredCount === 0 && (
        <div className="px-6 pt-4">
          <Alert>
            <Sparkles className="w-4 h-4" />
            <AlertTitle>You haven&apos;t configured an AI provider yet.</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>Add a key in Integrations to start chatting.</span>
              <Button asChild size="sm">
                <Link href="/settings?tab=integrations">Open Integrations</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <ConversationList
          activeId={activeId}
          onSelect={(id) => setActiveId(id || null)}
          onCreate={handleCreateConversation}
          isCreating={createConversation.isPending}
        />
        <ChatThread
          conversationId={activeId}
          onCreateConversation={createConversationForSend}
          onActivate={setActiveId}
        />
      </div>
    </div>
  )
}
