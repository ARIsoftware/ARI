import { describe, it, expect } from 'vitest'
import { describeElevenLabsError } from '@/modules-core/morning-brief/lib/elevenlabs'

describe('describeElevenLabsError', () => {
  it('quota_exceeded with message', () => {
    const body = JSON.stringify({ detail: { status: 'quota_exceeded', message: 'No credits left' } })
    const result = describeElevenLabsError(403, body)
    expect(result).toContain('out of credits')
    expect(result).toContain('No credits left')
    expect(result).toContain('Add credits')
  })

  it('quota_exceeded without message', () => {
    const body = JSON.stringify({ detail: { status: 'quota_exceeded' } })
    const result = describeElevenLabsError(403, body)
    expect(result).toContain('out of credits')
    expect(result).not.toContain(':')
  })

  it('missing_permissions with message', () => {
    const body = JSON.stringify({ detail: { status: 'missing_permissions', message: 'Needs tts endpoint' } })
    const result = describeElevenLabsError(403, body)
    expect(result).toContain('missing a required permission')
    expect(result).toContain('Needs tts endpoint')
    expect(result).toContain('HTTP 403')
  })

  it('missing_permissions without message', () => {
    const body = JSON.stringify({ detail: { status: 'missing_permissions' } })
    const result = describeElevenLabsError(401, body)
    expect(result).toContain('missing a required permission')
  })

  it('invalid_api_key with message', () => {
    const body = JSON.stringify({ detail: { status: 'invalid_api_key', message: 'Bad key' } })
    const result = describeElevenLabsError(401, body)
    expect(result).toContain('rejected the key')
    expect(result).toContain('Bad key')
    expect(result).toContain('HTTP 401')
  })

  it('401 status with no detail status falls back to invalid_api_key branch', () => {
    const body = JSON.stringify({ detail: { message: 'Unauthorized' } })
    const result = describeElevenLabsError(401, body)
    expect(result).toContain('rejected the key')
    expect(result).toContain('Unauthorized')
  })

  it('detail as string uses it as message', () => {
    const body = JSON.stringify({ detail: 'some error string' })
    const result = describeElevenLabsError(500, body)
    expect(result).toContain('some error string')
    expect(result).toContain('ElevenLabs request failed')
    expect(result).toContain('HTTP 500')
  })

  it('non-JSON body falls back gracefully', () => {
    const result = describeElevenLabsError(500, 'not json {{{')
    expect(result).toContain('ElevenLabs request failed')
    expect(result).toContain('HTTP 500')
    expect(result).not.toContain('undefined')
  })

  it('empty body falls back gracefully', () => {
    const result = describeElevenLabsError(503, '')
    expect(result).toContain('ElevenLabs request failed')
    expect(result).toContain('HTTP 503')
  })

  it('no-detail JSON falls back to generic message', () => {
    const result = describeElevenLabsError(500, JSON.stringify({ error: 'oops' }))
    expect(result).toContain('ElevenLabs request failed')
    expect(result).toContain('HTTP 500')
  })

  it('detail object with no status/message', () => {
    const body = JSON.stringify({ detail: { foo: 'bar' } })
    const result = describeElevenLabsError(500, body)
    expect(result).toContain('ElevenLabs request failed')
  })
})
