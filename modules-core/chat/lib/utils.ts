import { AI_CHAT_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'
import type { ChatProvider } from '../types'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const CHAT_BUCKET = 'chat'
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Chat offers every chat (non-voice) provider in the shared registry
// (`lib/ai-providers.ts`), so a provider added there shows up here with no
// Chat change. The one id difference: Chat stores the registry's `claude` as
// `anthropic`. Map at this one boundary so env keys / default models come from
// the single source of truth and can't drift.
const toChatId = (id: AiProviderId) => (id === 'claude' ? 'anthropic' : id) as ChatProvider

/** Every provider Chat can talk to, in registry order. */
export const CHAT_PROVIDER_IDS: ChatProvider[] = AI_CHAT_PROVIDERS.map((p) => toChatId(p.id))

export function chatProviderMeta(provider: ChatProvider) {
  const id = provider === 'anthropic' ? 'claude' : provider
  const meta = AI_CHAT_PROVIDERS.find((p) => p.id === id)
  if (!meta) throw new Error(`Unknown chat provider: ${provider}`)
  return meta
}

/** Registry id for a chat provider (e.g. 'anthropic' → 'claude'). */
export function chatToRegistryId(provider: ChatProvider): AiProviderId {
  return chatProviderMeta(provider).id
}

/** Chat provider for a registry id, or null when it isn't a chat provider (e.g. a voice provider). */
export function registryToChatId(id: AiProviderId): ChatProvider | null {
  return AI_CHAT_PROVIDERS.some((p) => p.id === id) ? toChatId(id) : null
}

// Display labels come from the registry, except Anthropic, which Chat shows as
// "Anthropic Claude" rather than the registry's "Claude".
export const PROVIDER_LABELS = Object.fromEntries(
  CHAT_PROVIDER_IDS.map((id) => [id, id === 'anthropic' ? 'Anthropic Claude' : chatProviderMeta(id).name])
) as Record<ChatProvider, string>

export const PROVIDER_DEFAULT_MODELS = Object.fromEntries(
  CHAT_PROVIDER_IDS.map((id) => [id, chatProviderMeta(id).modelPlaceholder])
) as Record<ChatProvider, string>

// Chat's typography, matched to uiarc.dev's AI chat: Inter at 400 (font-normal
// overrides <body>'s app-wide 500) with
// grayscale smoothing (`antialiased`) and -0.01em tracking, in neutral greys
// instead of the theme's tinted text colours. The greys are uiarc's
// (oklch 15% / 59% on light, 96% / 64% on dark) as HSL, swapped in by
// redefining the theme tokens for Chat's subtree only. Inter is already loaded
// app-wide (self-hosted in app/fonts/). Apply this to the page root
// and to every portalled surface (menus, dialogs, tooltips), which render
// outside the page and would otherwise inherit the theme from <body>. The
// page root also needs `text-foreground`: <body>'s colour was computed from
// the theme's token and would otherwise be inherited unchanged. (Portals keep
// their own popover colours.)
export const CHAT_TYPE_CLASS = [
  "font-['Inter','Inter_Fallback',sans-serif] font-normal antialiased tracking-[-0.01em]",
  '[--foreground:0_0%_4%] [--muted-foreground:0_0%_49%]',
  'dark:[--foreground:0_0%_95%] dark:[--muted-foreground:0_0%_55%]',
].join(' ')

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

/** Local calendar day of an ISO timestamp, as YYYY-MM-DD (for grouping). */
export function localDayKey(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Label for a day separator: Today, Yesterday, a weekday this week, or a date. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days > 1 && days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}
