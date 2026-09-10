'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { AiProviderCard } from '@/components/ai-provider-card'
import {
  useChatProviders,
  useChatSettings,
  useUpdateChatSettings,
} from '@/modules/chat/hooks/use-chat'
import { useRandomQuote } from '@/modules/chat/hooks/use-quote'
import { CHAT_REGISTRY_IDS, chatToRegistryId, registryToChatId } from '@/modules/chat/lib/utils'
import type { AiProviderId } from '@/lib/ai-providers'

export default function ChatSettingsPage() {
  const { toast } = useToast()
  const randomQuote = useRandomQuote()

  const { data: settings, isLoading } = useChatSettings()
  const { data: providers, isLoading: providersLoading } = useChatProviders()
  const updateSettings = useUpdateChatSettings()

  // Selection and model edits are stored as user overrides on top of the
  // server-derived defaults below; `undefined` = untouched, so the defaults
  // show through and background refetches can never stomp in-progress edits.
  const [selectedOverride, setSelectedOverride] = useState<AiProviderId | null>()
  const [modelEdits, setModelEdits] = useState<Partial<Record<AiProviderId, string>>>({})
  const [saved, setSaved] = useState(false)
  // "Saved!" flash timer: cleared on each new save (so back-to-back saves
  // don't cut the flash short) and on unmount (no setState after unmount).
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  // Default selection derived from saved settings + provider status. Mirrors
  // the chat page's runtime pick exactly: the saved default only counts while
  // that provider is still configured, otherwise the first configured
  // provider — the one new chats will actually use. Matching against the
  // providers list also shrugs off an out-of-range stored defaultProvider
  // (hand-edited row, restored backup) instead of crashing on the
  // chat→registry id mapping.
  const derived = useMemo(() => {
    const configured = (providers ?? []).filter((p) => p.configured)
    const savedProvider = configured.find((p) => p.id === settings?.defaultProvider)
    const effective = savedProvider ?? configured[0]
    if (!effective) return { selected: null, models: {} }
    const registryId = chatToRegistryId(effective.id)
    return {
      selected: registryId,
      // Only pair the saved model with the provider it was saved for —
      // applied to a different provider it would 400 on every send.
      models:
        savedProvider && settings?.defaultModel ? { [registryId]: settings.defaultModel } : {},
    }
  }, [settings, providers])

  const selected = selectedOverride === undefined ? derived.selected : selectedOverride
  const models = { ...derived.models, ...modelEdits }

  const handleSave = () => {
    const chatId = selected ? registryToChatId(selected) : null
    if (!chatId) {
      toast({
        variant: 'destructive',
        title: 'Pick a provider',
        description: 'Choose one of the configured providers first.',
      })
      return
    }

    setSaved(false)
    updateSettings.mutate(
      // Blank model = fall back to the global model from Integrations, then
      // the provider default (same semantics as the main chat page).
      { defaultProvider: chatId, defaultModel: (models[selected!] ?? '').trim() },
      {
        onSuccess: () => {
          setSaved(true)
          if (savedTimer.current) clearTimeout(savedTimer.current)
          savedTimer.current = setTimeout(() => setSaved(false), 3000)
        },
        onError: (err) =>
          toast({
            variant: 'destructive',
            title: 'Failed to save',
            description: err instanceof Error ? err.message : 'Please try again.',
          }),
      },
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-medium">Chat settings</h1>
        {randomQuote && <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>}
        <p className="text-sm text-muted-foreground mt-2">
          Pick which provider new chats use by default. API keys are managed in
          <Link href="/settings?tab=integrations" className="underline hover:text-foreground ml-1">
            Settings → Integrations
          </Link>
          .
        </p>
      </div>

      {isLoading || providersLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <AiProviderCard
          value={selected}
          onChange={setSelectedOverride}
          models={models}
          onModelChange={(id, model) => setModelEdits((prev) => ({ ...prev, [id]: model }))}
          allowedProviders={CHAT_REGISTRY_IDS}
          onSave={handleSave}
          isSaving={updateSettings.isPending}
          justSaved={saved}
        />
      )}
    </div>
  )
}
