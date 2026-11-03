'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from 'lucide-react'
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
import { CHAT_TYPE_CLASS } from '@/modules/chat/lib/utils'
import type { ChatProvider } from '@/modules/chat/types'

export default function ChatPage() {
  const { toast } = useToast()
  const randomQuote = useRandomQuote()

  const { data: settings, isLoading: settingsLoading, isError: settingsError, refetch: refetchSettings } = useChatSettings()
  const updateSettings = useUpdateChatSettings()

  const { data: providers = [], isLoading: providersLoading, isError: providersError, refetch: refetchProviders } = useChatProviders()
  const { data: conversations = [], isLoading: conversationsLoading } = useChatConversations()
  const createConversation = useCreateConversation()

  // undefined = nothing chosen yet (open the most recent chat); null = a new,
  // not-yet-created chat — it's created on its first message, so "New chat"
  // never leaves empty conversations behind.
  const [chosenId, setActiveId] = useState<string | null | undefined>(undefined)
  const activeId = chosenId === undefined ? (conversations[0]?.id ?? null) : chosenId


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

  // Used by the welcome composer to start a chat on the first message (ChatGPT-style).
  const createConversationForSend = async () => {
    if (!activeProvider) throw new Error('Add an API key in Settings → Integrations first.')
    return createConversation.mutateAsync({ provider: activeProvider.id, model: activeProvider.model })
  }

  const changeDefaultModel = (choice: { provider: ChatProvider; model: string }) => {
    updateSettings.mutate(
      { defaultProvider: choice.provider, defaultModel: choice.model },
      {
        onError: (err) => toast({
          variant: 'destructive',
          title: 'Failed to change the default model',
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
      },
    )
  }

  if (settingsLoading || providersLoading || conversationsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // A failed fetch must not masquerade as "no providers configured".
  if (settingsError || providersError) {
    return (
      <div className={`flex items-center justify-center h-96 p-6 text-foreground ${CHAT_TYPE_CLASS}`}>
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
      <div className={`p-6 text-foreground ${CHAT_TYPE_CLASS}`}>
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
    <div className={`relative flex flex-col h-[calc(100vh-4rem)] min-h-[600px] text-foreground ${CHAT_TYPE_CLASS}`}>
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
          onCreate={() => setActiveId(null)}
          isCreating={createConversation.isPending}
        />
        <ChatThread
          conversationId={activeId}
          onCreateConversation={createConversationForSend}
          onActivate={setActiveId}
          onDeleted={(id) => { if (activeId === id) setActiveId(null) }}
          providers={providers}
          defaultChoice={activeProvider ? { provider: activeProvider.id, model: activeProvider.model } : null}
          onChangeDefault={changeDefaultModel}
        />
      </div>
    </div>
  )
}
