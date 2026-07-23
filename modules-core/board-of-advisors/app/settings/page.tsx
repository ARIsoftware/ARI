'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { AiProviderCard } from '@/components/ai-provider-card'
import {
  useBoardSettings,
  useUpdateBoardSettings,
} from '@/modules/board-of-advisors/hooks/use-board-of-advisors'
import { destructiveToast } from '@/modules/board-of-advisors/lib/utils'
import type { AiProviderId } from '@/modules/board-of-advisors/types'

export default function BoardOfAdvisorsSettingsPage() {
  const { toast } = useToast()

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
        <p className="text-sm text-muted-foreground mt-2">
          Choose which AI provider powers the roundtable. Manage who sits at the table on the
          Advisors page.
        </p>
      </div>

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
