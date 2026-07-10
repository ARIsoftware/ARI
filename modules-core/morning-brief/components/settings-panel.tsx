'use client'

import { useEffect, useState } from 'react'
import { AiProviderCard } from '@/components/ai-provider-card'
import { useToast } from '@/hooks/use-toast'
import { GoogleCalendarCard } from './google-calendar-card'
import { ReadAloudCard } from './read-aloud-card'
import {
  useMorningBriefSettings,
  useUpdateMorningBriefSettings,
} from '@/modules/morning-brief/hooks/use-morning-brief'
import type { MorningBriefSettings } from '@/modules/morning-brief/types'

const DEFAULT_SETTINGS: MorningBriefSettings = {
  selectedAiProvider: null,
  selectedVoiceProvider: null,
  elevenLabsVoiceId: null,
  aiProviderModels: {},
}

/**
 * Settings panel rendered both in Settings → Features and on the module's own
 * /morning-brief/settings subpage. Holds the AI provider picker and the Google
 * Calendar connection (with setup instructions).
 */
export function MorningBriefSettingsPanel() {
  const { toast } = useToast()
  const { data: savedSettings } = useMorningBriefSettings()
  const updateSettings = useUpdateMorningBriefSettings()

  const [settings, setSettings] = useState<MorningBriefSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (savedSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
    }
  }, [savedSettings])

  const persist = (next: MorningBriefSettings) => {
    setSaved(false)
    updateSettings.mutate(next, {
      onSuccess: () => {
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
