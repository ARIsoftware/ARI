import { describe, it, expect } from 'vitest'
import { humanizeBoardError } from '@/modules-core/board-of-advisors/lib/errors'

describe('humanizeBoardError', () => {
  // ---------------------------------------------------------------------------
  // Module throttle messages (roundtable / too many questions)
  // ---------------------------------------------------------------------------
  it('passes through roundtable-running messages unchanged', () => {
    const result = humanizeBoardError('Roundtable is already running')
    expect(result.title).toBe('One roundtable at a time')
    expect(result.showIntegrations).toBe(false)
  })

  it('passes through too-many-questions messages unchanged', () => {
    const result = humanizeBoardError('Too many questions in a short time')
    expect(result.title).toBe('One roundtable at a time')
    expect(result.showIntegrations).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 412 / no provider configured
  // ---------------------------------------------------------------------------
  it('handles 412 status as "no provider configured"', () => {
    const result = humanizeBoardError('Provider request failed (412): precondition failed')
    expect(result.title).toBe('No AI provider configured')
    expect(result.showIntegrations).toBe(true)
  })

  it('handles "no ai provider selected" text', () => {
    const result = humanizeBoardError('No AI provider selected')
    expect(result.title).toBe('No AI provider configured')
    expect(result.showIntegrations).toBe(true)
  })

  it('handles "no api key configured" text', () => {
    const result = humanizeBoardError('No API key configured')
    expect(result.title).toBe('No AI provider configured')
  })

  it('handles "add an api key" text', () => {
    const result = humanizeBoardError('Please add an api key to continue')
    expect(result.title).toBe('No AI provider configured')
  })

  it('handles "not configured" text', () => {
    const result = humanizeBoardError('The provider is not configured')
    expect(result.title).toBe('No AI provider configured')
  })

  // ---------------------------------------------------------------------------
  // "Add at least one advisor"
  // ---------------------------------------------------------------------------
  it('handles empty board error', () => {
    const result = humanizeBoardError('Add at least one advisor before asking')
    expect(result.title).toBe('Your board is empty')
    expect(result.showIntegrations).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 401 / 403 — invalid key
  // ---------------------------------------------------------------------------
  it('handles 401 status as invalid key', () => {
    const result = humanizeBoardError('Provider request failed (401): {"message":"Incorrect API key"}')
    expect(result.title).toBe('Your API key was rejected')
    expect(result.showIntegrations).toBe(true)
    expect(result.detail).toBeDefined()
  })

  it('handles 403 status as invalid key', () => {
    const result = humanizeBoardError('Provider request failed (403): forbidden')
    expect(result.title).toBe('Your API key was rejected')
  })

  it('handles "authentication" keyword', () => {
    const result = humanizeBoardError('Authentication failed')
    expect(result.title).toBe('Your API key was rejected')
  })

  it('handles "invalid_api_key" keyword', () => {
    const result = humanizeBoardError('Provider request failed (401): {"error":{"message":"invalid_api_key"}}')
    expect(result.title).toBe('Your API key was rejected')
  })

  it('handles "expired" keyword', () => {
    const result = humanizeBoardError('The key is expired')
    expect(result.title).toBe('Your API key was rejected')
  })

  // ---------------------------------------------------------------------------
  // 429 / rate limit
  // ---------------------------------------------------------------------------
  it('handles 429 status as rate limit', () => {
    const result = humanizeBoardError('Provider request failed (429): rate limit reached')
    expect(result.title).toBe('Rate limit or quota reached')
    expect(result.showIntegrations).toBe(false)
  })

  it('handles "rate limit" text without status code', () => {
    const result = humanizeBoardError('Rate limit exceeded for this API key')
    expect(result.title).toBe('Rate limit or quota reached')
  })

  it('handles "insufficient_quota" keyword', () => {
    const result = humanizeBoardError('insufficient_quota: you have exceeded your quota')
    expect(result.title).toBe('Rate limit or quota reached')
  })

  it('handles billing keyword', () => {
    const result = humanizeBoardError('billing: update your payment method')
    expect(result.title).toBe('Rate limit or quota reached')
  })

  it('handles "insufficient funds" keyword', () => {
    const result = humanizeBoardError('Insufficient funds in account')
    expect(result.title).toBe('Rate limit or quota reached')
  })

  // ---------------------------------------------------------------------------
  // 5xx / server unavailable
  // ---------------------------------------------------------------------------
  it('handles 500 status as provider unavailable', () => {
    const result = humanizeBoardError('Provider request failed (500): internal server error')
    expect(result.title).toBe('The AI provider is temporarily unavailable')
    expect(result.showIntegrations).toBe(false)
  })

  it('handles 503 status as provider unavailable', () => {
    const result = humanizeBoardError('Provider request failed (503): service unavailable')
    expect(result.title).toBe('The AI provider is temporarily unavailable')
  })

  it('handles "overloaded" keyword', () => {
    const result = humanizeBoardError('The model is overloaded, please try again later')
    expect(result.title).toBe('The AI provider is temporarily unavailable')
  })

  // ---------------------------------------------------------------------------
  // 400 / 404 — bad model or request
  // ---------------------------------------------------------------------------
  it('handles 400 status as bad request (likely bad model)', () => {
    const result = humanizeBoardError('Provider request failed (400): bad request')
    expect(result.title).toBe('The request was rejected')
    expect(result.showIntegrations).toBe(true)
  })

  it('handles 404 status as model not found', () => {
    const result = humanizeBoardError('Provider request failed (404): model not found')
    expect(result.title).toBe('The request was rejected')
  })

  it('handles "does not exist" keyword', () => {
    const result = humanizeBoardError('The requested model does not exist')
    expect(result.title).toBe('The request was rejected')
  })

  it('handles "not_found_error" keyword', () => {
    const result = humanizeBoardError('not_found_error: resource missing')
    expect(result.title).toBe('The request was rejected')
  })

  // ---------------------------------------------------------------------------
  // Network error — no HTTP status
  // ---------------------------------------------------------------------------
  it('handles "failed to fetch" as network error', () => {
    const result = humanizeBoardError('Failed to fetch')
    // Title uses a curly apostrophe in the source
    expect(result.title).toContain('reach the AI provider')
    expect(result.showIntegrations).toBe(false)
  })

  it('handles "timeout" as network error', () => {
    const result = humanizeBoardError('Request timed out')
    expect(result.title).toContain('reach the AI provider')
  })

  it('handles "ECONNREFUSED" as network error', () => {
    // "econn" is in the network-error regex
    const result = humanizeBoardError('ECONNREFUSED — the connection was refused')
    expect(result.title).toContain('reach the AI provider')
  })

  it('handles "fetch failed" as network error', () => {
    // "fetch failed" is unambiguous — unlike ENOTFOUND which contains "not...found"
    // and is matched by the bad-model/bad-request branch first.
    const result = humanizeBoardError('fetch failed')
    expect(result.title).toContain('reach the AI provider')
  })

  // Network errors only apply when there is NO HTTP status. A 5xx takes priority.
  it('does NOT treat "timeout" with a 500 status as network error', () => {
    const result = humanizeBoardError('Provider request failed (500): timeout')
    expect(result.title).toBe('The AI provider is temporarily unavailable')
  })

  // ---------------------------------------------------------------------------
  // Fallback / unknown
  // ---------------------------------------------------------------------------
  it('returns a generic fallback for unrecognised errors', () => {
    const result = humanizeBoardError('something completely unexpected happened')
    expect(result.title).toBe('Something went wrong')
    expect(result.showIntegrations).toBe(true)
  })

  it('handles empty string gracefully', () => {
    const result = humanizeBoardError('')
    expect(result.title).toBe('Something went wrong')
  })

  // ---------------------------------------------------------------------------
  // JSON extraction of detail
  // ---------------------------------------------------------------------------
  it('extracts nested .error.message from JSON body', () => {
    const raw = 'Provider request failed (401): {"error":{"message":"Your API key is invalid"}}'
    const result = humanizeBoardError(raw)
    expect(result.detail).toBe('Your API key is invalid')
  })

  it('falls back to regex extraction when JSON.parse fails', () => {
    // Malformed JSON but still contains a "message" key
    const raw = 'Provider request failed (401): {broken json "message":"extracted via regex"}'
    const result = humanizeBoardError(raw)
    expect(result.detail).toBe('extracted via regex')
  })

  it('uses stripped trailing text as detail when no JSON', () => {
    const raw = 'Provider request failed (500): some plain error text'
    const result = humanizeBoardError(raw)
    expect(result.detail).toBe('some plain error text')
  })
})
