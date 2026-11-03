/**
 * Tests for modules-core/chat/lib/utils.ts — formatBytes, chat constants,
 * registry-derived provider metadata, and isImageMime.
 */
import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  CHAT_BUCKET,
  UUID_RE,
  chatProviderMeta,
  chatToRegistryId,
  registryToChatId,
  CHAT_PROVIDER_IDS,
  PROVIDER_LABELS,
  PROVIDER_DEFAULT_MODELS,
  isImageMime,
  localDayKey,
  dayLabel,
} from '@/modules-core/chat/lib/utils'
import { AI_PROVIDERS } from '@/lib/ai-providers'
import type { ChatProvider } from '@/modules-core/chat/types'

// ─── formatBytes ──────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats 0 bytes as B', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats just below 1 KB as B', () => {
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats exactly 1024 as KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  it('formats fractional KB with one decimal', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats just below 1 MB as KB', () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('formats exactly 1 MB as MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('formats fractional MB with one decimal', () => {
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB')
  })
})

// ─── Constants ────────────────────────────────────────────────────────────────

describe('CHAT_BUCKET / UUID_RE', () => {
  it('CHAT_BUCKET is "chat"', () => {
    expect(CHAT_BUCKET).toBe('chat')
  })

  it('UUID_RE matches a lowercase UUID', () => {
    expect(UUID_RE.test('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
  })

  it('UUID_RE matches an uppercase UUID (case-insensitive)', () => {
    expect(UUID_RE.test('123E4567-E89B-12D3-A456-426614174000')).toBe(true)
  })

  it('UUID_RE rejects non-UUID strings', () => {
    expect(UUID_RE.test('not-a-uuid')).toBe(false)
    expect(UUID_RE.test('123e4567e89b12d3a456426614174000')).toBe(false)
  })
})

// ─── chatProviderMeta ─────────────────────────────────────────────────────────

describe('chatProviderMeta', () => {
  it('maps openai to the openai registry entry', () => {
    expect(chatProviderMeta('openai').id).toBe('openai')
  })

  it('maps anthropic to the claude registry entry', () => {
    expect(chatProviderMeta('anthropic').id).toBe('claude')
  })

  it('maps gemini to the gemini registry entry', () => {
    expect(chatProviderMeta('gemini').id).toBe('gemini')
  })

  it('maps openrouter to the openrouter registry entry', () => {
    expect(chatProviderMeta('openrouter').id).toBe('openrouter')
  })

  it('throws for an unknown provider', () => {
    expect(() => chatProviderMeta('bogus' as ChatProvider)).toThrow('Unknown chat provider: bogus')
  })
})

// ─── chatToRegistryId / registryToChatId / CHAT_PROVIDER_IDS ──────────────────

describe('chatToRegistryId', () => {
  it('maps each chat provider to its registry id', () => {
    expect(chatToRegistryId('openai')).toBe('openai')
    expect(chatToRegistryId('anthropic')).toBe('claude')
    expect(chatToRegistryId('gemini')).toBe('gemini')
    expect(chatToRegistryId('openrouter')).toBe('openrouter')
  })

  it('throws for an unknown provider', () => {
    expect(() => chatToRegistryId('bogus' as ChatProvider)).toThrow('Unknown chat provider: bogus')
  })
})

describe('registryToChatId', () => {
  it('maps registry ids back to chat providers', () => {
    expect(registryToChatId('openai')).toBe('openai')
    expect(registryToChatId('claude')).toBe('anthropic')
    expect(registryToChatId('mistral')).toBe('mistral')
    expect(registryToChatId('ollama')).toBe('ollama')
  })

  it('returns null for voice providers', () => {
    expect(registryToChatId('elevenlabs')).toBeNull()
  })
})

describe('CHAT_PROVIDER_IDS', () => {
  it('lists every chat (non-voice) registry provider, with claude as anthropic', () => {
    expect(CHAT_PROVIDER_IDS).toEqual(
      AI_PROVIDERS.filter((p) => p.kind !== 'voice').map((p) => (p.id === 'claude' ? 'anthropic' : p.id)),
    )
    expect(CHAT_PROVIDER_IDS).toContain('cohere')
    expect(CHAT_PROVIDER_IDS).not.toContain('elevenlabs')
  })

  it('round-trips through chatToRegistryId', () => {
    for (const id of CHAT_PROVIDER_IDS) {
      expect(registryToChatId(chatToRegistryId(id))).toBe(id)
    }
  })
})

// ─── PROVIDER_LABELS / PROVIDER_DEFAULT_MODELS ────────────────────────────────

describe('PROVIDER_LABELS', () => {
  it('uses registry names, with the chat-specific Anthropic label', () => {
    expect(PROVIDER_LABELS.anthropic).toBe('Anthropic Claude')
    expect(PROVIDER_LABELS.openai).toBe('OpenAI')
    expect(PROVIDER_LABELS.gemini).toBe('Google Gemini')
    expect(PROVIDER_LABELS.cohere).toBe('Cohere')
    expect(Object.keys(PROVIDER_LABELS)).toEqual(CHAT_PROVIDER_IDS)
  })
})

describe('PROVIDER_DEFAULT_MODELS', () => {
  // Defaults must stay in lockstep with the shared registry (single source of truth).
  const registryPlaceholder = (id: string) => AI_PROVIDERS.find((p) => p.id === id)!.modelPlaceholder

  it('derives openai default from the registry', () => {
    expect(PROVIDER_DEFAULT_MODELS.openai).toBe(registryPlaceholder('openai'))
  })

  it('derives anthropic default from the claude registry entry', () => {
    expect(PROVIDER_DEFAULT_MODELS.anthropic).toBe(registryPlaceholder('claude'))
  })

  it('derives gemini default from the registry', () => {
    expect(PROVIDER_DEFAULT_MODELS.gemini).toBe(registryPlaceholder('gemini'))
  })

  it('derives openrouter default from the registry', () => {
    expect(PROVIDER_DEFAULT_MODELS.openrouter).toBe(registryPlaceholder('openrouter'))
  })

  it('derives cohere default from the registry', () => {
    expect(PROVIDER_DEFAULT_MODELS.cohere).toBe(registryPlaceholder('cohere'))
  })
})

// ─── isImageMime ──────────────────────────────────────────────────────────────

describe('isImageMime', () => {
  it('returns true for image mimes', () => {
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('image/jpeg')).toBe(true)
  })

  it('returns false for non-image mimes', () => {
    expect(isImageMime('text/plain')).toBe(false)
    expect(isImageMime('application/json')).toBe(false)
  })

  it('is case-sensitive (uppercase prefix is not an image)', () => {
    expect(isImageMime('IMAGE/png')).toBe(false)
  })
})

describe('localDayKey', () => {
  it('formats the local calendar day', () => {
    const d = new Date(2026, 0, 5, 23, 30)
    expect(localDayKey(d.toISOString())).toBe('2026-01-05')
  })
})

describe('dayLabel', () => {
  const now = new Date(2026, 8, 30, 12, 0) // Wed 30 Sep 2026
  const iso = (y: number, m: number, d: number) => new Date(y, m, d, 9, 0).toISOString()

  it('names today and yesterday', () => {
    expect(dayLabel(iso(2026, 8, 30), now)).toBe('Today')
    expect(dayLabel(iso(2026, 8, 29), now)).toBe('Yesterday')
  })

  it('uses the weekday within the last week', () => {
    expect(dayLabel(iso(2026, 8, 27), now)).toBe(new Date(2026, 8, 27).toLocaleDateString(undefined, { weekday: 'long' }))
  })

  it('uses a date for older days, with the year only when it differs', () => {
    const older = dayLabel(iso(2026, 7, 1), now)
    expect(older).toBe(new Date(2026, 7, 1).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))
    const lastYear = dayLabel(iso(2025, 7, 1), now)
    expect(lastYear).toContain('2025')
  })

  it('defaults to the current time', () => {
    expect(dayLabel(new Date().toISOString())).toBe('Today')
  })
})
