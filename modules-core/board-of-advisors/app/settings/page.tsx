'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { AiProviderCard } from '@/components/ai-provider-card'
import {
  useBoardSettings,
  useUpdateBoardSettings,
} from '@/modules/board-of-advisors/hooks/use-board-of-advisors'
import { useRandomQuote } from '@/modules/board-of-advisors/hooks/use-random-quote'
import { destructiveToast } from '@/modules/board-of-advisors/lib/utils'
import { AdvisorList } from '@/modules/board-of-advisors/components/advisor-list'
import type { AiProviderId } from '@/modules/board-of-advisors/types'

export default function BoardOfAdvisorsSettingsPage() {
  const { toast } = useToast()
  const { quotesEnabled, randomQuote } = useRandomQuote()

  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch: refetchSettings,
  } = useBoardSettings()
  const updateSettings = useUpdateBoardSettings()

  const [selectedProvider, setSelectedProvider] = useState<AiProviderId | null>(null)
  const [providerModels, setProviderModels] = useState<Partial<Record<AiProviderId, string>>>({})
  const [justSaved, setJustSaved] = useState(false)
  const seeded = useRef(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed local form state once, when settings first arrive — later background
  // refetches must not clobber in-progress edits.
  useEffect(() => {
    if (!seeded.current && settings) {
      seeded.current = true
      setSelectedProvider(settings.selectedAiProvider ?? null)
      setProviderModels(settings.aiProviderModels ?? {})
    }
  }, [settings])

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  const handleSaveProvider = () => {
    updateSettings.mutate(
      { selectedAiProvider: selectedProvider, aiProviderModels: providerModels },
      {
        onSuccess: () => {
          setJustSaved(true)
          if (savedTimer.current) clearTimeout(savedTimer.current)
          savedTimer.current = setTimeout(() => setJustSaved(false), 2000)
        },
        onError: (err) => toast(destructiveToast('Failed to save', err)),
      },
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-medium">Board settings</h1>
        {quotesEnabled && randomQuote && (
          <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          Manage who sits at the table, their speaking order, and which AI provider powers the
          roundtable.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-accent" />
            Your advisors
          </CardTitle>
          <CardDescription>
            Each advisor answers every question, in this order. Drag to change who speaks first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdvisorList />
        </CardContent>
      </Card>

      {settingsLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : settingsError ? (
        // Never render the provider card unseeded — saving from a blank form
        // would overwrite the stored selection with null/{}.
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-semibold text-destructive">Couldn&apos;t load the provider settings</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check your connection and try again before making changes.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => refetchSettings()}>
            Try again
          </Button>
        </div>
      ) : (
        <AiProviderCard
          value={selectedProvider}
          onChange={setSelectedProvider}
          models={providerModels}
          onModelChange={(id, model) => setProviderModels((prev) => ({ ...prev, [id]: model }))}
          onSave={handleSaveProvider}
          isSaving={updateSettings.isPending}
          justSaved={justSaved}
        />
      )}
    </div>
  )
}
