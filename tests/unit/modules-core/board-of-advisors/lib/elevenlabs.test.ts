/**
 * Tests for board-of-advisors/lib/elevenlabs.ts — decoding ElevenLabs'
 * ambiguous 401 responses into actionable messages. Pure function, no mocks.
 */
import { describe, it, expect } from 'vitest'
import { describeElevenLabsError } from '@/modules-core/board-of-advisors/lib/elevenlabs'

const body = (detail: unknown) => JSON.stringify({ detail })

describe('describeElevenLabsError', () => {
  it('decodes quota_exceeded with the provider message as suffix', () => {
    const msg = describeElevenLabsError(401, body({ status: 'quota_exceeded', message: 'You are out of credits.' }))
    expect(msg).toContain('out of credits')
    expect(msg).toContain(': You are out of credits.')
  })

  it('decodes quota_exceeded without a message (no suffix)', () => {
    const msg = describeElevenLabsError(401, body({ status: 'quota_exceeded' }))
    expect(msg).toBe('ElevenLabs is out of credits. Add credits to your ElevenLabs account, then try again.')
  })

  it('decodes missing_permissions with the HTTP status', () => {
    const msg = describeElevenLabsError(401, body({ status: 'missing_permissions', message: 'text_to_speech not allowed' }))
    expect(msg).toContain('missing a required permission')
    expect(msg).toContain('(HTTP 401)')
    expect(msg).toContain('text_to_speech not allowed')
  })

  it('decodes invalid_api_key regardless of HTTP status', () => {
    const msg = describeElevenLabsError(403, body({ status: 'invalid_api_key' }))
    expect(msg).toContain('rejected the key')
    expect(msg).toContain('(HTTP 403)')
  })

  it('treats a plain 401 without detail.status as a rejected key', () => {
    const msg = describeElevenLabsError(401, body({ message: 'nope' }))
    expect(msg).toContain('rejected the key')
    expect(msg).toContain(': nope')
  })

  it('uses a string detail as the message', () => {
    const msg = describeElevenLabsError(500, body('internal error'))
    expect(msg).toBe('ElevenLabs request failed: internal error (HTTP 500).')
  })

  it('falls back to the status code alone on a non-JSON body', () => {
    expect(describeElevenLabsError(502, '<html>Bad Gateway</html>')).toBe('ElevenLabs request failed (HTTP 502).')
  })

  it('ignores non-string status/message fields in detail', () => {
    const msg = describeElevenLabsError(429, body({ status: 42, message: { nested: true } }))
    expect(msg).toBe('ElevenLabs request failed (HTTP 429).')
  })

  it('generic failure for non-401 statuses without a recognized detail.status', () => {
    const msg = describeElevenLabsError(503, body({ status: 'server_busy', message: 'try later' }))
    expect(msg).toBe('ElevenLabs request failed: try later (HTTP 503).')
  })
})
