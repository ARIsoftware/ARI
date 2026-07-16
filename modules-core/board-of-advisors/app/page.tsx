'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Settings, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import {
  useAdvisors,
  useBoardConversations,
  useBoardProviderStatus,
  useBoardSettings,
  useCreateBoardConversation,
  useUpdateBoardSettings,
} from '@/modules/board-of-advisors/hooks/use-board-of-advisors'
import { useRandomQuote } from '@/modules/board-of-advisors/hooks/use-random-quote'
import { destructiveToast } from '@/modules/board-of-advisors/lib/utils'
import { ConversationList } from '@/modules/board-of-advisors/components/conversation-list'
import { BoardThread } from '@/modules/board-of-advisors/components/board-thread'
import { BoardOnboarding } from '@/modules/board-of-advisors/components/onboarding'

export default function BoardOfAdvisorsPage() {
  const { toast } = useToast()
  const { quotesEnabled, randomQuote } = useRandomQuote()

  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch: refetchSettings,
  } = useBoardSettings()
  const updateSettings = useUpdateBoardSettings()

  const { data: advisors = [] } = useAdvisors()
  const { data: providerStatus } = useBoardProviderStatus()
  const { data: conversations = [] } = useBoardConversations()
  const createConversation = useCreateBoardConversation()

  const [activeId, setActiveId] = useState<string | null>(null)
  const autoSelectedRef = useRef(false)

  // Default-select the most recent discussion ONCE on initial load. A later
  // null activeId is deliberate (e.g. the active discussion was deleted) and
  // must not be overridden back to some older discussion.
  useEffect(() => {
    if (!autoSelectedRef.current && !activeId && conversations.length > 0) {
      autoSelectedRef.current = true
      setActiveId(conversations[0].id)
    }
  }, [conversations, activeId])

  const handleCreateConversation = () => {
    createConversation.mutate(undefined, {
      onSuccess: (convo) => setActiveId(convo.id),
      onError: (err) => toast(destructiveToast('Failed to start a discussion', err)),
    })
  }

  // Used by the welcome composer to start a discussion on the first question.
  const createConversationForSend = async () => {
    return createConversation.mutateAsync()
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // A failed settings fetch must not re-show onboarding to an onboarded user.
  if (settingsError) {
    return (
      <div className="flex items-center justify-center h-96 p-6">
        <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-semibold text-destructive">Couldn&apos;t load Board of Advisors</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Something went wrong fetching the module settings. Check your connection and try again.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => refetchSettings()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (!settings?.onboardingCompleted) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <h1 className="text-4xl font-medium">Board of Advisors</h1>
          {quotesEnabled && randomQuote && (
            <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>
          )}
        </div>
        <BoardOnboarding
          isPending={updateSettings.isPending}
          onComplete={() => {
            updateSettings.mutate(
              { onboardingCompleted: true },
              { onError: (err) => toast(destructiveToast('Failed to save', err)) },
            )
          }}
        />
      </div>
    )
  }

  const provider = providerStatus?.selected ?? null
  const providerReady = !!provider?.configured

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] min-h-[600px]">
      <div className="border-b px-6 pb-3 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-medium tracking-tight">Board of Advisors</h1>
            {quotesEnabled && randomQuote && (
              <p className="mt-1.5 text-sm italic text-[#aa2020]">&ldquo;{randomQuote.quote}&rdquo;</p>
            )}
          </div>
          <Link
            href="/board-of-advisors/settings"
            className="group flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs shadow-sm transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            {providerReady ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="font-medium">{provider!.name}</span>
                <span className="font-mono text-muted-foreground">{provider!.model}</span>
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

      {providerStatus && !providerReady && (
        <div className="px-6 pt-4">
          <Alert>
            <Users className="w-4 h-4" />
            <AlertTitle>The board needs an AI provider.</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                {providerStatus.configured_count === 0
                  ? 'Add an API key in Integrations, then pick the provider in this module’s Settings.'
                  : 'Pick which provider powers the board in this module’s Settings.'}
              </span>
              <Button asChild size="sm">
                {providerStatus.configured_count === 0 ? (
                  <Link href="/settings?tab=integrations">Open Integrations</Link>
                ) : (
                  <Link href="/board-of-advisors/settings">Open Settings</Link>
                )}
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
        <BoardThread
          conversationId={activeId}
          advisors={advisors}
          onCreateConversation={createConversationForSend}
          onActivate={setActiveId}
        />
      </div>
    </div>
  )
}
