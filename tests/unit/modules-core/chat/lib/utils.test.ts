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
  PROVIDER_LABELS,
  PROVIDER_DEFAULT_MODELS,
  isImageMime,
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

// ─── PROVIDER_LABELS / PROVIDER_DEFAULT_MODELS ────────────────────────────────

describe('PROVIDER_LABELS', () => {
  it('has the chat-specific display labels', () => {
    expect(PROVIDER_LABELS).toEqual({
      openai: 'OpenAI',
      anthropic: 'Anthropic Claude',
      gemini: 'Google Gemini',
      openrouter: 'OpenRouter',
    })
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
