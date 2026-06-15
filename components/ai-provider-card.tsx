/**
 * AiProviderCard — shared ARI settings card for picking which AI provider a
 * module should use.
 *
 * Build once, reference everywhere: any module's settings panel can render this
 * card by importing it. Update this file and every module gets the new version.
 *
 *   import { AiProviderCard } from '@/components/ai-provider-card'
 *
 *   <AiProviderCard
 *     value={settings.selectedAiProvider}
 *     onChange={(id) => updateSetting('selectedAiProvider', id)}
 *   />
 *
 * It is a CONTROLLED component: the host module owns the value (typically a
 * `selectedAiProvider` field on its `module_settings` JSON) and persists it
 * however it already saves settings. Only providers that have an API key
 * configured under Settings → Integrations are offered for selection.
 *
 * Save button: optional. Pass `onSave` to render an embedded Save button inside
 * the card (useful when the card stands alone). Omit it when the host page has
 * its own page-level Save that already persists the whole settings object.
 *
 * MUST be used inside a client component (it is marked 'use client').
 */

'use client'

import { useEffect } from 'react'
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
  Loader2,
  Save,
  CheckCircle2,
  Check,
  Sparkles,
  Bot,
  Layers,
  Network,
  Atom,
  Wind,
  Search,
  Zap,
  Compass,
  Server,
  ExternalLink,
  Plug,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AI_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'
import { useApiKeysStatus } from '@/hooks/use-api-keys-status'

const PROVIDER_ICONS: Record<AiProviderId, LucideIcon> = {
  openrouter: Network,
  claude: Sparkles,
  openai: Bot,
  gemini: Layers,
  xai: Atom,
  mistral: Wind,
  deepseek: Search,
  groq: Zap,
  perplexity: Compass,
  ollama: Server,
}

export interface AiProviderCardProps {
  /** Currently selected provider id, or null when none is chosen. */
  value: AiProviderId | null
  /** Called when the user picks (or unpicks) a provider. */
  onChange: (id: AiProviderId | null) => void
  /**
   * Optional. When provided, an embedded Save button is rendered. Omit it when
   * the host page has its own page-level Save that persists settings.
   */
  onSave?: () => void
  /** Show the embedded Save button in its loading state. */
  isSaving?: boolean
  /** Briefly flip the embedded Save button to a "Saved!" confirmation. */
  justSaved?: boolean
  /** Override the card description line. */
  description?: string
}

export function AiProviderCard({
  value,
  onChange,
  onSave,
  isSaving = false,
  justSaved = false,
  description = 'Configure the AI Providers to use with this module.',
}: AiProviderCardProps) {
  const { data: providerKeys = {} } = useApiKeysStatus()

  // Only providers with an API key configured are offered for selection;
  // unconfigured ones are set up via Settings → Integrations first.
  const configuredProviders = AI_PROVIDERS.filter(
    p => providerKeys[p.primaryEnvKey]?.configured ?? false,
  )

  // When exactly one provider is configured and nothing is selected yet,
  // auto-select it — there is no meaningful choice for the user to make.
  // The host receives this via onChange and persists it like any other change.
  const onlyProviderId =
    configuredProviders.length === 1 ? configuredProviders[0].id : null
  useEffect(() => {
    if (value === null && onlyProviderId !== null) {
      onChange(onlyProviderId)
    }
  }, [value, onlyProviderId, onChange])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>AI Providers</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
            <Button asChild size="sm">
              <Link href="/settings?tab=integrations">Manage Providers</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <a
                href="https://ari.software/docs/api-integrations"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Documentation
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {configuredProviders.length === 0 ? (
          // Empty state: no API keys configured anywhere in ARI yet.
          // Replaces the whole card body with a single clear call to action.
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Plug className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium">
              You have not setup any AI Providers yet.
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add an API key for a provider and it will appear here, ready to
              use with this module.
            </p>
            <Button asChild className="mt-5">
              <Link href="/settings?tab=integrations">Set up AI Providers</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-muted/30 p-5">
              <p className="text-sm font-medium text-foreground">
                Choose the AI Provider that this module should use. You can add or manage additional AI Providers in{' '}
                <Link
                  href="/settings?tab=integrations"
                  className="underline underline-offset-4 hover:text-foreground/80"
                >
                  ARI settings
                </Link>
                .
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {configuredProviders.map(({ id, name, description }) => {
                const Icon = PROVIDER_ICONS[id]
                const selected = value === id
                // Selected: filled check. Otherwise an empty radio circle that
                // highlights on hover — signals "click to select".
                const badge = selected ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 transition-colors group-hover:border-green-600" />
                )

                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange(selected ? null : id)}
                    className={cn(
                      'group relative flex flex-col gap-3 rounded-xl border p-4 text-left transition',
                      selected
                        ? // Same green as enabled provider cards on /settings?tab=integrations
                          'border-green-600/40 bg-green-600/40'
                        : 'cursor-pointer border-border bg-card shadow-sm hover:border-green-600/50 hover:shadow-md',
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-foreground/80" />
                      </div>
                      {badge}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {onSave && (
              <div className="flex items-center gap-2 border-t pt-4">
                <Button onClick={onSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : justSaved ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                      Saved!
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
