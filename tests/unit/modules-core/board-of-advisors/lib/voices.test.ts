/**
 * Tests for board-of-advisors/lib/voices.ts — curated ElevenLabs voices and
 * deterministic advisor → voice resolution. Pure module, no mocks.
 */
import { describe, it, expect } from 'vitest'
import {
  CURATED_VOICES,
  DEFAULT_VOICE_ID,
  resolveVoiceId,
  type AdvisorSex,
} from '@/modules-core/board-of-advisors/lib/voices'

const advisor = (id: string, sex: AdvisorSex, voice_id: string | null = null) => ({ id, sex, voice_id })

// ─── CURATED_VOICES / DEFAULT_VOICE_ID ────────────────────────────────────────

describe('CURATED_VOICES', () => {
  it('has unique, non-empty ids', () => {
    const ids = CURATED_VOICES.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.length > 0)).toBe(true)
  })

  it('contains both male and female voices', () => {
    expect(CURATED_VOICES.some((v) => v.sex === 'male')).toBe(true)
    expect(CURATED_VOICES.some((v) => v.sex === 'female')).toBe(true)
  })

  it('DEFAULT_VOICE_ID is one of the curated voices (Rachel)', () => {
    const match = CURATED_VOICES.find((v) => v.id === DEFAULT_VOICE_ID)
    expect(match?.name).toBe('Rachel')
  })
})

// ─── resolveVoiceId ───────────────────────────────────────────────────────────

describe('resolveVoiceId', () => {
  it('returns the explicit voice_id when set', () => {
    expect(resolveVoiceId(advisor('a1', 'male', 'custom-voice'))).toBe('custom-voice')
  })

  it('picks a sex-matched voice for male advisors', () => {
    const id = resolveVoiceId(advisor('advisor-123', 'male'))
    expect(CURATED_VOICES.find((v) => v.id === id)?.sex).toBe('male')
  })

  it('picks a sex-matched voice for female advisors', () => {
    const id = resolveVoiceId(advisor('advisor-456', 'female'))
    expect(CURATED_VOICES.find((v) => v.id === id)?.sex).toBe('female')
  })

  it('picks from the full pool when sex is not specified', () => {
    const id = resolveVoiceId(advisor('advisor-789', 'not_specified'))
    expect(CURATED_VOICES.some((v) => v.id === id)).toBe(true)
  })

  it('is deterministic — the same advisor id always maps to the same voice', () => {
    const first = resolveVoiceId(advisor('stable-id', 'female'))
    for (let i = 0; i < 5; i++) {
      expect(resolveVoiceId(advisor('stable-id', 'female'))).toBe(first)
    }
  })

  it('spreads different advisor ids across the pool deterministically', () => {
    // Not a randomness test — just pin the hash-based pick for known inputs so
    // an accidental algorithm change (voices reshuffled for everyone) fails loudly.
    const a = resolveVoiceId(advisor('a', 'not_specified'))
    const b = resolveVoiceId(advisor('b', 'not_specified'))
    expect(CURATED_VOICES.some((v) => v.id === a)).toBe(true)
    expect(CURATED_VOICES.some((v) => v.id === b)).toBe(true)
    // 'a'(97) % 10 and 'b'(98) % 10 land on adjacent pool slots.
    expect(a).toBe(CURATED_VOICES[97 % CURATED_VOICES.length].id)
    expect(b).toBe(CURATED_VOICES[98 % CURATED_VOICES.length].id)
  })

  it('empty-string voice_id falls through to the automatic pick', () => {
    const id = resolveVoiceId({ id: 'x', sex: 'male', voice_id: '' as unknown as null })
    expect(CURATED_VOICES.find((v) => v.id === id)?.sex).toBe('male')
  })
})
