/**
 * AiProviderCard — shared ARI settings card for picking which AI provider(s) a
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
 * Layout: a single list of provider rows grouped by section ("Language models",
 * "Voices"). Each row shows a radio, the provider icon, its name + env-var key,
 * a short description, and — on the right — the already-configured API key as
 * masked, read-only text plus a status badge (keys are still managed only in
 * ARI Settings / .env.local — this is a confirmation, not an editor). The
 * "Language models" header carries the Docs + Add provider actions.
 *
 * Per-module model: pass `models` + `onModelChange` to reveal an editable
 * "model" field that expands inline under the SELECTED provider's row. This is
 * a PER-MODULE override (stored on the host's own settings), so one module can
 * run gpt-5 while another runs gpt-5-mini off the same key. Leaving it blank
 * falls back to the global model from Settings → Integrations, then the
 * provider's built-in default. Omit both props to hide the model field.
 *
 * Two sections: by default it lists "Language models" (chat/LLM providers). A
 * host that also needs a voice can pass `voiceValue` + `onVoiceChange` to render
 * a selectable "Voices" section (e.g. ElevenLabs) — the two selections are
 * independent. When a host doesn't consume voice, configured voice providers
 * are still shown, read-only, for reference.
 *
 * Save button: optional. Pass `onSave` to render an embedded Save button inside
 * the card (useful when the card stands alone). Omit it when the host page has
 * its own page-level Save that already persists the whole settings object.
 *
 * MUST be used inside a client component (it is marked 'use client').
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Loader2,
  Save,
  CheckCircle2,
  Check,
  ChevronsUpDown,
  Pencil,
  ExternalLink,
  Plug,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_INTEGRATIONS_DOCS_URL } from '@/lib/constants'
import {
  AI_CHAT_PROVIDERS,
  AI_VOICE_PROVIDERS,
  type AiProvider,
  type AiProviderId,
} from '@/lib/ai-providers'
import { useApiKeysStatus, type ApiKeysStatus } from '@/hooks/use-api-keys-status'
import { useProviderModels } from '@/hooks/use-provider-models'

export interface AiProviderCardProps {
  /** Currently selected language-model provider id, or null when none is chosen. */
  value: AiProviderId | null
  /** Called when the user picks (or unpicks) a language-model provider. */
  onChange: (id: AiProviderId | null) => void
  /**
   * Currently selected voice provider id, or null. Provide this together with
   * `onVoiceChange` to render a selectable "Voices" section (e.g. ElevenLabs)
   * below the language models. Omit both to show voice providers read-only.
   */
  voiceValue?: AiProviderId | null
  /** Called when the user picks (or unpicks) a voice provider. */
  onVoiceChange?: (id: AiProviderId | null) => void
  /**
   * Per-module model overrides, keyed by provider id. Provide together with
   * `onModelChange` to reveal an editable model field under the selected
   * provider's row. Omit both to hide the model field entirely.
   */
  models?: Partial<Record<AiProviderId, string>>
  /** Called when the user edits the per-module model for a provider. */
  onModelChange?: (id: AiProviderId, model: string) => void
  /**
   * Optional. When provided, an embedded Save button is rendered. Omit it when
   * the host page has its own page-level Save that persists settings.
   */
  onSave?: () => void
  /** Show the embedded Save button in its loading state. */
  isSaving?: boolean
  /** Briefly flip the embedded Save button to a "Saved!" confirmation. */
  justSaved?: boolean
}

/**
 * Per-module model field for the selected provider. Renders a searchable
 * dropdown of the provider's live models (fetched + cached 8h via
 * useProviderModels) plus an "Other (enter manually)" escape that reveals a
 * free-text input. Falls back to the plain text input while loading, and
 * permanently when the provider has no list endpoint or the fetch fails.
 *
 * The stored value is always a plain model-id string ('' = use the default).
 */
function ProviderModelField({
  providerId,
  value,
  defaultModel,
  onChange,
}: {
  providerId: AiProviderId
  value: string
  defaultModel: string
  onChange: (model: string) => void
}) {
  const { data, isLoading } = useProviderModels(providerId)
  const models = data?.models ?? []
  const hasModels = models.length > 0
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState(false)

  const matched = models.find((m) => m.id === value)
  // A saved value that isn't one of the fetched ids is treated as "custom".
  const isCustom = value !== '' && !matched
  const manualMode = manual || isCustom

  const label = (
    <p className="mb-1.5 text-xs font-medium">
      Model <span className="font-normal text-muted-foreground">— optional</span>
    </p>
  )
  const defaultHint = (
    <p className="mt-1.5 text-[11px] text-muted-foreground">
      Leave blank to use {defaultModel || 'the default model'}.
    </p>
  )

  // While loading, show a disabled trigger so the field doesn't flash.
  if (isLoading) {
    return (
      <div className="max-w-md">
        {label}
        <Button
          variant="outline"
          disabled
          className="w-full justify-between font-mono text-xs"
        >
          Loading models…
          <Loader2 className="ml-2 h-3.5 w-3.5 shrink-0 animate-spin opacity-70" />
        </Button>
        {defaultHint}
      </div>
    )
  }

  // No list endpoint / fetch failed → plain text input (the original behavior).
  if (!hasModels) {
    return (
      <div className="max-w-md">
        {label}
        <Input
          type="text"
          value={value}
          placeholder={defaultModel}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
        />
        {data?.source === 'unavailable' ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Live model list isn&apos;t available for this provider — type the model id.
            Leave blank for the default{defaultModel ? ` (${defaultModel})` : ''}.
          </p>
        ) : (
          defaultHint
        )}
      </div>
    )
  }

  const triggerLabel = manualMode
    ? 'Custom model'
    : matched
      ? matched.id
      : `Default${defaultModel ? ` — ${defaultModel}` : ''}`

  return (
    <div className="max-w-md">
      {label}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-mono text-xs"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="p-0"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <Command>
            <CommandInput placeholder="Search models…" className="text-xs" />
            <CommandList>
              <CommandEmpty>No models found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__default__ use default model"
                  onSelect={() => {
                    onChange('')
                    setManual(false)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5',
                      value === '' && !manualMode ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  Default{defaultModel ? ` — ${defaultModel}` : ''}
                </CommandItem>
                {models.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.id} ${m.label ?? ''}`}
                    onSelect={() => {
                      onChange(m.id)
                      setManual(false)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-3.5 w-3.5 shrink-0',
                        value === m.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate font-mono">{m.id}</span>
                    {m.label && m.label !== m.id && (
                      <span className="ml-2 truncate text-muted-foreground">{m.label}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__other__ enter custom model manually"
                  onSelect={() => {
                    setManual(true)
                    setOpen(false)
                  }}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5 shrink-0" />
                  Other (enter manually)
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {manualMode && (
        <Input
          type="text"
          value={value}
          placeholder={defaultModel}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 font-mono text-xs"
        />
      )}
      {defaultHint}
    </div>
  )
}

/** One provider row in a section list. Interactive rows (chat, or voice when
 *  the host consumes voice) render a leading radio and select on click; the
 *  selected row's background extends down to hold an inline model field. In
 *  `readOnly` mode the row is inert reference (no radio, "Configured" badge). */
function ProviderRow({
  provider,
  providerKeys,
  selected,
  onSelect,
  showModel,
  models,
  onModelChange,
  readOnly = false,
}: {
  provider: AiProvider
  providerKeys: ApiKeysStatus
  selected: boolean
  onSelect?: () => void
  showModel: boolean
  models?: Partial<Record<AiProviderId, string>>
  onModelChange?: (id: AiProviderId, model: string) => void
  readOnly?: boolean
}) {
  // Configured key, shown masked + read-only (managed in ARI Settings).
  const maskedKey = providerKeys[provider.primaryEnvKey]?.masked ?? null
  // Placeholder = the effective default this module would use if left blank:
  // the global model from Integrations, else the registry default.
  const modelDefault =
    providerKeys[provider.modelEnvKey]?.masked || provider.modelPlaceholder

  // Name/description + right-aligned key & status badge. Shared by the
  // interactive and read-only layouts; only the leading radio differs.
  const body = (
    <>
      <div className="m-[5px] min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{provider.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {provider.primaryEnvKey}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{provider.description}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {maskedKey ? (
          <span className="hidden break-all font-mono text-xs text-muted-foreground sm:inline">
            {maskedKey}
          </span>
        ) : (
          <span className="hidden text-xs italic text-muted-foreground sm:inline">
            No API key found
          </span>
        )}
        {readOnly ? (
          <Badge variant="secondary" className="shrink-0">
            Configured
          </Badge>
        ) : (
          <Badge className="shrink-0 gap-1.5 border-transparent bg-green-600/15 text-green-700 hover:bg-green-600/15 dark:bg-green-500/15 dark:text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Key set
          </Badge>
        )}
      </div>
    </>
  )

  return (
    <div className={cn('transition-colors', selected && !readOnly && 'bg-muted/50')}>
      {readOnly ? (
        // pl-14 stands in for the missing radio (radio 20 + gap 16 = 36 over
        // px-5's 20) so read-only names align with the selectable rows above.
        <div className="flex items-center gap-4 py-4 pl-14 pr-5">{body}</div>
      ) : (
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={onSelect}
          className="group flex w-full items-center gap-4 px-5 py-4 text-left"
        >
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              selected
                ? 'border-primary'
                : 'border-muted-foreground/40 group-hover:border-primary/60',
            )}
          >
            {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
          </span>
          {body}
        </button>
      )}

      {!readOnly && selected && showModel && onModelChange && (
        // Indented to align under the provider name: px-5 (20) + radio (20) +
        // gap-4 (16) = 3.5rem.
        <div className="pb-5 pl-14 pr-5">
          <ProviderModelField
            providerId={provider.id}
            value={models?.[provider.id] ?? ''}
            defaultModel={modelDefault}
            onChange={(model) => onModelChange(provider.id, model)}
          />
        </div>
      )}
    </div>
  )
}

/** A labelled section (header + optional actions) wrapping a list of rows. */
function ProviderSection({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-0.5">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:flex-shrink-0">{actions}</div>}
      </div>
      <div className="divide-y divide-border border-t border-border">{children}</div>
    </section>
  )
}

export function AiProviderCard({
  value,
  onChange,
  voiceValue = null,
  onVoiceChange,
  models,
  onModelChange,
  onSave,
  isSaving = false,
  justSaved = false,
}: AiProviderCardProps) {
  const { data: providerKeys = {} } = useApiKeysStatus()
  const isConfigured = (envKey: string) => providerKeys[envKey]?.configured ?? false

  // Only providers with an API key configured are offered for selection;
  // unconfigured ones are set up via Settings → Integrations first.
  const configuredChat = AI_CHAT_PROVIDERS.filter((p) => isConfigured(p.primaryEnvKey))
  const configuredVoice = AI_VOICE_PROVIDERS.filter((p) => isConfigured(p.primaryEnvKey))

  // Whether this host actually consumes a voice (and so can select one). When
  // it doesn't, configured voice providers are still shown — but read-only.
  const voiceEnabled = typeof onVoiceChange === 'function'
  const showVoiceSection = configuredVoice.length > 0
  const modelEditable = typeof onModelChange === 'function'

  // When exactly one language model is configured and nothing is selected yet,
  // auto-select it — there is no meaningful choice to make. Voice selection is
  // left manual (narration is opt-in).
  const onlyChatId = configuredChat.length === 1 ? configuredChat[0].id : null
  useEffect(() => {
    if (value === null && onlyChatId !== null) {
      onChange(onlyChatId)
    }
  }, [value, onlyChatId, onChange])

  const nothingConfigured = configuredChat.length === 0 && configuredVoice.length === 0

  const languageActions = (
    <>
      <Button asChild size="sm" variant="outline">
        <a href={API_INTEGRATIONS_DOCS_URL} target="_blank" rel="noopener noreferrer">
          Docs
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </a>
      </Button>
      <Button asChild size="sm">
        <Link href="/settings?tab=integrations">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add provider
        </Link>
      </Button>
    </>
  )

  return (
    <Card className="overflow-hidden">
      {nothingConfigured ? (
        // Empty state: no API keys configured anywhere in ARI yet.
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Plug className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium">
            You have not setup any AI Providers yet.
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add an API key for a provider and it will appear here, ready to use
            with this module.
          </p>
          <Button asChild className="mt-5">
            <Link href="/settings?tab=integrations">Set up AI Providers</Link>
          </Button>
        </div>
      ) : (
        <>
          <ProviderSection
            title="Language models"
            subtitle="Select one provider as the active model."
            actions={languageActions}
          >
            {configuredChat.length > 0 ? (
              configuredChat.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  providerKeys={providerKeys}
                  selected={value === provider.id}
                  onSelect={() => onChange(value === provider.id ? null : provider.id)}
                  showModel={modelEditable}
                  models={models}
                  onModelChange={onModelChange}
                />
              ))
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                No language model providers set up yet — add one via Add provider.
              </p>
            )}
          </ProviderSection>

          {showVoiceSection && (
            <div className="border-t border-border">
              <ProviderSection
                title="Voices"
                subtitle={
                  voiceEnabled
                    ? 'Pick a voice for this module.'
                    : "Configured in ARI settings, shown for reference. This module doesn't use voice."
                }
              >
                {configuredVoice.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    providerKeys={providerKeys}
                    selected={voiceEnabled && voiceValue === provider.id}
                    onSelect={
                      voiceEnabled
                        ? () => onVoiceChange!(voiceValue === provider.id ? null : provider.id)
                        : undefined
                    }
                    showModel={voiceEnabled && modelEditable}
                    models={models}
                    onModelChange={voiceEnabled ? onModelChange : undefined}
                    readOnly={!voiceEnabled}
                  />
                ))}
              </ProviderSection>
            </div>
          )}

          {onSave && (
            <div className="flex items-center gap-2 border-t border-border px-5 py-4">
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
    </Card>
  )
}
