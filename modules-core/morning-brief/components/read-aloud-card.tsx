'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  AudioLines,
  Loader2,
  Save,
  CheckCircle2,
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useApiKeysStatus } from '@/hooks/use-api-keys-status'
import { useElevenLabsVoices, usePlayUrl } from '@/modules/morning-brief/hooks/use-morning-brief'

// The integrations env key that backs the ElevenLabs voice provider.
const ELEVENLABS_API_KEY_ENV = 'ELEVENLABS_API_KEY'

interface ReadAloudCardProps {
  /** Currently selected ElevenLabs voice id, or null for the default voice. */
  value: string | null
  onChange: (voiceId: string | null) => void
  onSave: () => void
  isSaving: boolean
  justSaved: boolean
}

/** Build a short, human label for a voice: "Rachel · American, female". */
function voiceSubtitle(labels: Record<string, string> | null, category: string | null): string {
  const parts = [labels?.accent, labels?.gender, labels?.use_case]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.replace(/_/g, ' '))
  if (parts.length === 0 && category) parts.push(category)
  return parts.join(', ')
}

/**
 * Settings card for the Morning Brief "Read aloud" feature.
 *
 * Whether ElevenLabs is enabled is read from the shared api-keys status (the
 * same source the Settings → AI Providers tab updates the instant a key is
 * saved), so this card never goes stale. When enabled it also offers a live
 * voice picker (fetched from the user's ElevenLabs account) with a preview.
 */
export function ReadAloudCard({ value, onChange, onSave, isSaving, justSaved }: ReadAloudCardProps) {
  const { data: providerKeys = {} } = useApiKeysStatus()
  const configured = providerKeys[ELEVENLABS_API_KEY_ENV]?.configured ?? false

  // Only hit ElevenLabs for the voice list once the key is actually configured.
  const { data, isLoading, isError, error, refetch, isFetching } = useElevenLabsVoices(configured)
  const voices = data?.voices ?? []
  const selected = voices.find((v) => v.voiceId === value) ?? null

  const preview = usePlayUrl()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <AudioLines className="h-4 w-4 text-primary" />
          </span>
          <CardTitle>Read Aloud</CardTitle>
        </div>
        <CardDescription>
          Have your Morning Brief read out loud in a natural ElevenLabs voice when you press{' '}
          <span className="font-medium text-foreground">Listen</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!configured ? (
          // ── Not set up yet ──────────────────────────────────────────────
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ElevenLabs integration is required if you would like your Morning Brief to be read
              out loud. Add an ElevenLabs API key to enable spoken briefs.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings?tab=integrations">
                Setup Your ElevenLabs API Key
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          // ── Enabled ─────────────────────────────────────────────────────
          <div className="space-y-4">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-green-600/50 bg-green-600/10 text-green-700 hover:bg-green-600/20 hover:text-green-700 dark:text-green-400"
            >
              <Link href="/settings?tab=integrations">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                ElevenLabs Enabled
              </Link>
            </Button>

            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading voices…
              </div>
            ) : isError ? (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error instanceof Error ? error.message : 'Could not load voices.'}
              </p>
            ) : voices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No voices found on your ElevenLabs account yet.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mb-voice">Voice</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={value ?? undefined}
                      onValueChange={(v) => {
                        preview.stop()
                        onChange(v)
                      }}
                    >
                      <SelectTrigger id="mb-voice" className="flex-1">
                        <SelectValue placeholder="Select a voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {voices.map((v) => {
                          const subtitle = voiceSubtitle(v.labels, v.category)
                          return (
                            <SelectItem key={v.voiceId} value={v.voiceId}>
                              {v.name}
                              {subtitle && (
                                <span className="text-muted-foreground"> · {subtitle}</span>
                              )}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => preview.toggle(selected?.previewUrl)}
                      disabled={!selected?.previewUrl}
                      title={selected?.previewUrl ? 'Preview voice' : 'No preview available'}
                      aria-label="Preview voice"
                    >
                      {preview.playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => refetch()}
                      disabled={isFetching}
                      title="Refresh voice list"
                      aria-label="Refresh voice list"
                    >
                      <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                    </Button>
                  </div>
                </div>

                {/* Escape hatch: paste any voice ID (e.g. a Voice Library voice not
                    in your account, which the dropdown above can't list). */}
                <div className="space-y-1">
                  <Input
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value.trim() || null)}
                    placeholder="…or paste a voice ID"
                    className="font-mono text-xs"
                    aria-label="Voice ID"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use any voice from the ElevenLabs Voice Library — open it, ⋮ →{' '}
                    <span className="font-medium text-foreground">Copy voice ID</span>, and paste it
                    here. It doesn&apos;t need to be in your dropdown.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button onClick={onSave} disabled={isSaving} size="sm">
                    {isSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : justSaved ? (
                      <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {justSaved ? 'Saved' : 'Save'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
