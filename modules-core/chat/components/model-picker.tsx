'use client'

import Link from 'next/link'
import { Check, ChevronDown, KeyRound, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { CHAT_TYPE_CLASS, PROVIDER_LABELS } from '@/modules/chat/lib/utils'
import type { ChatProvider, ChatProviderStatus } from '@/modules/chat/types'

export interface ModelChoice {
  provider: ChatProvider
  model: string
}

interface ModelPickerProps {
  value: ModelChoice | null
  providers: ChatProviderStatus[]
  onChange: (choice: ModelChoice) => void
  disabled?: boolean
  /** Shown under the menu heading, e.g. "Applies to this chat". */
  hint?: string
}

const providerModel = (p: ChatProviderStatus) => p.configuredModel ?? p.defaultModel

/**
 * Composer pill that switches provider + model. Lists each configured
 * provider with its configured model; a custom model already in use (e.g.
 * a saved default) is kept as its own checked entry so it's never lost.
 */
export function ModelPicker({ value, providers, onChange, disabled, hint }: ModelPickerProps) {
  const configured = providers.filter((p) => p.configured)
  const options: ModelChoice[] = configured.map((p) => ({ provider: p.id, model: providerModel(p) }))
  if (value && !options.some((o) => o.provider === value.provider && o.model === value.model)) {
    options.unshift(value)
  }
  const hasUnconfigured = providers.some((p) => !p.configured)

  if (!value) {
    return (
      <Link
        href="/settings?tab=integrations"
        className="flex min-w-0 shrink items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-accent/40 hover:bg-accent/5"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
        <span className="whitespace-nowrap">No provider configured</span>
      </Link>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="group flex min-w-0 shrink items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs shadow-sm outline-none transition-colors hover:border-accent/40 hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 data-[state=open]:border-accent/40 data-[state=open]:bg-accent/5"
        aria-label="Choose model"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        <span className="whitespace-nowrap font-medium">{PROVIDER_LABELS[value.provider] ?? value.provider}</span>
        <span className="hidden max-w-[16ch] truncate font-mono text-muted-foreground sm:inline">{value.model}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('w-72', CHAT_TYPE_CLASS)}>
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Model{hint ? <span className="font-normal"> · {hint}</span> : null}
        </DropdownMenuLabel>
        {options.map((o) => {
          const active = o.provider === value.provider && o.model === value.model
          return (
            <DropdownMenuItem
              key={`${o.provider}:${o.model}`}
              onSelect={() => {
                if (!active) onChange(o)
              }}
              className="flex items-start gap-2.5 py-2"
            >
              <Check className={cn('mt-0.5 h-4 w-4 shrink-0 text-accent', !active && 'invisible')} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{PROVIDER_LABELS[o.provider] ?? o.provider}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{o.model}</span>
              </span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/chat/settings" className="flex items-center gap-2.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            Default model &amp; chat settings
          </Link>
        </DropdownMenuItem>
        {hasUnconfigured && (
          <DropdownMenuItem asChild>
            <Link href="/settings?tab=integrations" className="flex items-center gap-2.5 text-xs">
              <KeyRound className="h-3.5 w-3.5" />
              Add another provider
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
