'use client'

import { useState } from 'react'
import { AiProviderCard } from '@/components/ai-provider-card'
import { useToast } from '@/hooks/use-toast'
import { GoogleCalendarCard } from './google-calendar-card'
import { ReadAloudCard } from './read-aloud-card'
import {
  useTodaysBriefSettings,
  useUpdateTodaysBriefSettings,
} from '@/modules/todays-brief/hooks/use-todays-brief'
import type { TodaysBriefSettings } from '@/modules/todays-brief/types'

const DEFAULT_SETTINGS: TodaysBriefSettings = {
  selectedAiProvider: null,
  selectedVoiceProvider: null,
  elevenLabsVoiceId: null,
  aiProviderModels: {},
}

/**
 * Settings panel rendered both in Settings → Features and on the module's own
 * /todays-brief/settings subpage. Holds the AI provider picker and the Google
 * Calendar connection (with setup instructions).
 */
export function TodaysBriefSettingsPanel() {
  const { toast } = useToast()
  const { data: savedSettings } = useTodaysBriefSettings()
  const updateSettings = useUpdateTodaysBriefSettings()

  // Unsaved edits live in `draft`; while it is null the panel mirrors the saved
  // settings directly (so a refetch shows through), and a successful save clears
  // it. Derived rather than copied into state so no effect has to sync the two.
  const [draft, setDraft] = useState<TodaysBriefSettings | null>(null)
  const [saved, setSaved] = useState(false)

  const settings: TodaysBriefSettings = draft ?? { ...DEFAULT_SETTINGS, ...savedSettings }
  const setSettings = (update: (prev: TodaysBriefSettings) => TodaysBriefSettings) =>
    setDraft((prev) => update(prev ?? settings))

  const persist = (next: TodaysBriefSettings) => {
    setSaved(false)
    updateSettings.mutate(next, {
      onSuccess: () => {
        setDraft(null)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      },
      onError: (err) =>
        toast({
          variant: 'destructive',
          title: 'Failed to save settings',
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
    })
  }

  return (
    <div className="space-y-6">
      <AiProviderCard
        value={settings.selectedAiProvider}
        onChange={(id) => setSettings((prev) => ({ ...prev, selectedAiProvider: id }))}
        voiceValue={settings.selectedVoiceProvider}
        onVoiceChange={(id) => setSettings((prev) => ({ ...prev, selectedVoiceProvider: id }))}
        models={settings.aiProviderModels}
        onModelChange={(id, model) =>
          setSettings((prev) => ({
            ...prev,
            aiProviderModels: { ...(prev.aiProviderModels ?? {}), [id]: model },
          }))
        }
        onSave={() => persist(settings)}
        isSaving={updateSettings.isPending}
        justSaved={saved}
      />

      {/* The specific voice is only relevant once ElevenLabs is the chosen narrator. */}
      {settings.selectedVoiceProvider === 'elevenlabs' && (
        <ReadAloudCard
          value={settings.elevenLabsVoiceId}
          onChange={(voiceId) => setSettings((prev) => ({ ...prev, elevenLabsVoiceId: voiceId }))}
          onSave={() => persist(settings)}
          isSaving={updateSettings.isPending}
          justSaved={saved}
        />
      )}

      <GoogleCalendarCard />
    </div>
  )
}
