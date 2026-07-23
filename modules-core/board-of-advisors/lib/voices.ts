/**
 * Board of Advisors — curated ElevenLabs voices + automatic voice selection.
 *
 * Client + server safe (no server-only imports): the advisor dialog uses
 * CURATED_VOICES for its picker, and the TTS route uses resolveVoiceId() to
 * turn an advisor into a concrete ElevenLabs voice id.
 *
 * An advisor's voice is either explicit (`voice_id`) or "Auto" (`voice_id`
 * null), in which case we pick a stable, sex-matched voice deterministically
 * from the advisor's id — so the same advisor always sounds the same, without
 * persisting anything extra.
 */

export type AdvisorSex = 'male' | 'female' | 'not_specified'

export interface CuratedVoice {
  id: string
  name: string
  sex: 'male' | 'female'
}

/**
 * A fixed set of ElevenLabs premade voices, tagged by sex. Rachel matches
 * Morning Brief's default. These are stock voice ids available on every
 * ElevenLabs account; DEFAULT_VOICE_ID is the always-safe fallback.
 */
export const CURATED_VOICES: CuratedVoice[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', sex: 'female' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', sex: 'female' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', sex: 'female' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', sex: 'female' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', sex: 'female' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', sex: 'male' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', sex: 'male' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', sex: 'male' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', sex: 'male' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', sex: 'male' },
]

/** ElevenLabs "Rachel" — the same stable default Morning Brief falls back to. */
export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

/** Deterministic, non-negative hash of a string (stable across runs). */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Resolve an advisor to a concrete ElevenLabs voice id:
 *   1. an explicit voice_id, if set;
 *   2. else a deterministic, sex-matched pick (stable per advisor id);
 *   3. else the default voice.
 */
export function resolveVoiceId(advisor: { id: string; sex: AdvisorSex; voice_id: string | null }): string {
  if (advisor.voice_id) return advisor.voice_id
  const pool =
    advisor.sex === 'male' || advisor.sex === 'female'
      ? CURATED_VOICES.filter((v) => v.sex === advisor.sex)
      : CURATED_VOICES
  const list = pool.length ? pool : CURATED_VOICES
  if (!list.length) return DEFAULT_VOICE_ID
  return list[hashString(advisor.id) % list.length].id
}
