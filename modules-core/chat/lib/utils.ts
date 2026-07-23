import { AI_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'
import type { ChatProvider } from '../types'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const CHAT_BUCKET = 'chat'
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Chat uses the provider id `anthropic`; the shared registry uses `claude`.
// Map at this one boundary so env keys / default models come from the single
// source of truth (`lib/ai-providers.ts`) and can't drift.
const CHAT_TO_REGISTRY_ID: Record<ChatProvider, AiProviderId> = {
  openai: 'openai',
  anthropic: 'claude',
  gemini: 'gemini',
  openrouter: 'openrouter',
}

export function chatProviderMeta(provider: ChatProvider) {
  const meta = AI_PROVIDERS.find((p) => p.id === CHAT_TO_REGISTRY_ID[provider])
  if (!meta) throw new Error(`Unknown chat provider: ${provider}`)
  return meta
}

// Display labels are a chat-specific override (e.g. "Anthropic Claude" rather
// than the registry's "Claude"); the drift-prone config (env keys, default
// models) is derived from the registry above.
export const PROVIDER_LABELS: Record<ChatProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
}

export const PROVIDER_DEFAULT_MODELS: Record<ChatProvider, string> = {
  openai: chatProviderMeta('openai').modelPlaceholder,
  anthropic: chatProviderMeta('anthropic').modelPlaceholder,
  gemini: chatProviderMeta('gemini').modelPlaceholder,
  openrouter: chatProviderMeta('openrouter').modelPlaceholder,
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}
