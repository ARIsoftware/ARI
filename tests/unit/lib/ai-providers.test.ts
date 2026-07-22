import { describe, it, expect } from 'vitest'
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  AI_CHAT_PROVIDERS,
  AI_VOICE_PROVIDERS,
  AI_PROVIDER_SECRET_ENV_KEYS,
  AI_PROVIDER_PLAINTEXT_ENV_KEYS,
  MODEL_ID_MAX_LENGTH,
} from '@/lib/ai-providers'

describe('AI_PROVIDER_IDS', () => {
  it('is a non-empty tuple of strings', () => {
    expect(AI_PROVIDER_IDS.length).toBeGreaterThan(0)
    for (const id of AI_PROVIDER_IDS) {
      expect(typeof id).toBe('string')
    }
  })

  it('contains the known provider ids', () => {
    expect(AI_PROVIDER_IDS).toContain('openai')
    expect(AI_PROVIDER_IDS).toContain('claude')
    expect(AI_PROVIDER_IDS).toContain('gemini')
    expect(AI_PROVIDER_IDS).toContain('ollama')
    expect(AI_PROVIDER_IDS).toContain('elevenlabs')
  })
})

describe('MODEL_ID_MAX_LENGTH', () => {
  it('is 200', () => {
    expect(MODEL_ID_MAX_LENGTH).toBe(200)
  })
})

describe('AI_PROVIDERS', () => {
  it('has the same length as AI_PROVIDER_IDS', () => {
    expect(AI_PROVIDERS.length).toBe(AI_PROVIDER_IDS.length)
  })

  it('every provider has required fields', () => {
    for (const p of AI_PROVIDERS) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.description).toBe('string')
      expect(typeof p.primaryEnvKey).toBe('string')
      expect(typeof p.modelEnvKey).toBe('string')
      expect(typeof p.modelPlaceholder).toBe('string')
    }
  })

  it('every provider id appears in AI_PROVIDER_IDS', () => {
    for (const p of AI_PROVIDERS) {
      expect(AI_PROVIDER_IDS).toContain(p.id)
    }
  })

  it('ollama has keyIsPlaintext=true', () => {
    const ollama = AI_PROVIDERS.find((p) => p.id === 'ollama')
    expect(ollama?.keyIsPlaintext).toBe(true)
  })

  it('elevenlabs has kind=voice', () => {
    const el = AI_PROVIDERS.find((p) => p.id === 'elevenlabs')
    expect(el?.kind).toBe('voice')
  })

  it('most providers do not have keyIsPlaintext set', () => {
    const plaintext = AI_PROVIDERS.filter((p) => p.keyIsPlaintext)
    expect(plaintext.length).toBeLessThan(AI_PROVIDERS.length)
  })
})

describe('AI_CHAT_PROVIDERS', () => {
  it('excludes voice-only providers', () => {
    const ids = AI_CHAT_PROVIDERS.map((p) => p.id)
    expect(ids).not.toContain('elevenlabs')
  })

  it('includes openai and claude', () => {
    const ids = AI_CHAT_PROVIDERS.map((p) => p.id)
    expect(ids).toContain('openai')
    expect(ids).toContain('claude')
  })

  it('every entry has kind undefined or "chat"', () => {
    for (const p of AI_CHAT_PROVIDERS) {
      expect(p.kind === undefined || p.kind === 'chat').toBe(true)
    }
  })
})

describe('AI_VOICE_PROVIDERS', () => {
  it('includes elevenlabs', () => {
    const ids = AI_VOICE_PROVIDERS.map((p) => p.id)
    expect(ids).toContain('elevenlabs')
  })

  it('every entry has kind="voice"', () => {
    for (const p of AI_VOICE_PROVIDERS) {
      expect(p.kind).toBe('voice')
    }
  })
})

describe('AI_PROVIDER_SECRET_ENV_KEYS', () => {
  it('is an array of strings', () => {
    expect(Array.isArray(AI_PROVIDER_SECRET_ENV_KEYS)).toBe(true)
    for (const k of AI_PROVIDER_SECRET_ENV_KEYS) {
      expect(typeof k).toBe('string')
    }
  })

  it('does not include OLLAMA_BASE_URL (plaintext key)', () => {
    expect(AI_PROVIDER_SECRET_ENV_KEYS).not.toContain('OLLAMA_BASE_URL')
  })

  it('includes OPENAI_API_KEY', () => {
    expect(AI_PROVIDER_SECRET_ENV_KEYS).toContain('OPENAI_API_KEY')
  })
})

describe('AI_PROVIDER_PLAINTEXT_ENV_KEYS', () => {
  it('includes OLLAMA_BASE_URL', () => {
    expect(AI_PROVIDER_PLAINTEXT_ENV_KEYS).toContain('OLLAMA_BASE_URL')
  })

  it('includes all model env keys', () => {
    for (const p of AI_PROVIDERS) {
      expect(AI_PROVIDER_PLAINTEXT_ENV_KEYS).toContain(p.modelEnvKey)
    }
  })

  it('does not include OPENAI_API_KEY (secret key)', () => {
    expect(AI_PROVIDER_PLAINTEXT_ENV_KEYS).not.toContain('OPENAI_API_KEY')
  })
})
