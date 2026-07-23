/**
 * Tests for modules-core/chat/lib/errors.ts — humanizeChatError branch matrix:
 * status-based classification, keyword classification, JSON detail extraction
 * (nested error/detail recursion, malformed JSON regex fallback), and the
 * "Provider request failed (NNN):" prefix-strip detail path.
 */
import { describe, it, expect } from 'vitest'
import { humanizeChatError } from '@/modules-core/chat/lib/errors'

// ─── Not configured (412 / keywords) ─────────────────────────────────────────

describe('humanizeChatError — provider not configured', () => {
  it('classifies status 412 as not configured', () => {
    const r = humanizeChatError('Provider request failed (412): precondition')
    expect(r.title).toBe('No AI provider configured')
    expect(r.showIntegrations).toBe(true)
  })

  it('classifies "No API key configured" keyword without a status', () => {
    const r = humanizeChatError('No API key configured for openai')
    expect(r.title).toBe('No AI provider configured')
  })

  it('classifies "add an API key" keyword', () => {
    const r = humanizeChatError('Please add an API key first')
    expect(r.title).toBe('No AI provider configured')
  })
})

// ─── Rejected key (401/403 / keywords) ───────────────────────────────────────

describe('humanizeChatError — rejected key', () => {
  it('classifies status 401 and extracts nested error.message from JSON', () => {
    const r = humanizeChatError(
      'Provider request failed (401): {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    )
    expect(r.title).toBe('Your API key was rejected')
    expect(r.detail).toBe('invalid x-api-key')
    expect(r.showIntegrations).toBe(true)
  })

  it('classifies status 403', () => {
    const r = humanizeChatError('Provider request failed (403): nope')
    expect(r.title).toBe('Your API key was rejected')
    expect(r.detail).toBe('nope') // prefix-strip detail path
  })

  it('classifies "unauthorized" keyword without a status', () => {
    const r = humanizeChatError('request was unauthorized by upstream')
    expect(r.title).toBe('Your API key was rejected')
  })
})

// ─── Rate limit / quota (429 / keywords) ─────────────────────────────────────

describe('humanizeChatError — rate limit / quota', () => {
  it('classifies status 429', () => {
    const r = humanizeChatError('Provider request failed (429): {"error":{"message":"Too many requests"}}')
    expect(r.title).toBe('Rate limit or quota reached')
    expect(r.detail).toBe('Too many requests')
    expect(r.showIntegrations).toBe(false)
  })

  it('classifies "insufficient_quota" keyword without a status', () => {
    const r = humanizeChatError('insufficient_quota: you exceeded your current plan')
    expect(r.title).toBe('Rate limit or quota reached')
  })
})

// ─── Bad request / model (400/404 / keywords) ────────────────────────────────

describe('humanizeChatError — bad request / model', () => {
  it('classifies status 400', () => {
    const r = humanizeChatError('Provider request failed (400): bad body')
    expect(r.title).toBe('The request was rejected')
    expect(r.showIntegrations).toBe(true)
  })

  it('classifies status 404 with a top-level JSON message', () => {
    const r = humanizeChatError('Provider request failed (404): {"message":"model gone"}')
    expect(r.title).toBe('The request was rejected')
    expect(r.detail).toBe('model gone')
  })

  it('classifies "model ... does not exist" keyword without a status', () => {
    const r = humanizeChatError('The model gpt-99 does not exist')
    expect(r.title).toBe('The request was rejected')
  })
})

// ─── Provider outage (>=500 / 529 / keywords) ────────────────────────────────

describe('humanizeChatError — provider outage', () => {
  it('classifies status 500', () => {
    const r = humanizeChatError('Provider request failed (500): Internal Server Error')
    expect(r.title).toBe('The AI provider is temporarily unavailable')
    expect(r.detail).toBe('Internal Server Error')
    expect(r.showIntegrations).toBe(false)
  })

  it('classifies status 529', () => {
    const r = humanizeChatError('Provider request failed (529): {"error":{"message":"Overloaded"}}')
    expect(r.title).toBe('The AI provider is temporarily unavailable')
    expect(r.detail).toBe('Overloaded')
  })

  it('classifies "overloaded" keyword without a status', () => {
    const r = humanizeChatError('The engine is overloaded right now')
    expect(r.title).toBe('The AI provider is temporarily unavailable')
  })
})

// ─── Network errors (no status) ──────────────────────────────────────────────

describe('humanizeChatError — network errors', () => {
  it('classifies "fetch failed" without a status', () => {
    const r = humanizeChatError('TypeError: fetch failed')
    expect(r.title).toBe('Couldn’t reach the AI provider')
    expect(r.showIntegrations).toBe(false)
  })

  it('classifies "ECONNREFUSED" without a status', () => {
    const r = humanizeChatError('connect ECONNREFUSED 127.0.0.1:443')
    expect(r.title).toBe('Couldn’t reach the AI provider')
  })
})

// ─── Fallback ────────────────────────────────────────────────────────────────

describe('humanizeChatError — fallback', () => {
  it('falls back for unrecognized text, keeping it as detail', () => {
    const r = humanizeChatError('mysterious kaboom')
    expect(r.title).toBe('Something went wrong')
    expect(r.detail).toBe('mysterious kaboom')
    expect(r.showIntegrations).toBe(true)
  })

  it('returns fallback with no detail for empty input', () => {
    const r = humanizeChatError('')
    expect(r.title).toBe('Something went wrong')
    expect(r.detail).toBeUndefined()
  })
})

// ─── JSON detail extraction ──────────────────────────────────────────────────

describe('humanizeChatError — detail extraction', () => {
  it('recurses into {detail:{message}}', () => {
    const r = humanizeChatError('Provider request failed (500): {"detail":{"message":"deep detail"}}')
    expect(r.detail).toBe('deep detail')
  })

  it('ignores whitespace-only message and falls back to the raw JSON tail', () => {
    // extractMessage skips "   " (trim-empty), so detail comes from prefix-strip.
    const r = humanizeChatError('Provider request failed (500): {"message":"   "}')
    expect(r.detail).toBe('{"message":"   "}')
  })

  it('ignores non-object error values (error is a plain string)', () => {
    const r = humanizeChatError('Provider request failed (500): {"error":"just a string"}')
    expect(r.detail).toBe('{"error":"just a string"}')
  })

  it('ignores non-string message values', () => {
    const r = humanizeChatError('Provider request failed (500): {"message":42}')
    expect(r.detail).toBe('{"message":42}')
  })

  it('extracts message via regex when JSON is malformed', () => {
    const r = humanizeChatError('Provider request failed (500): {broken json "message": "regex extracted" more')
    expect(r.detail).toBe('regex extracted')
  })

  it('keeps detail undefined-path when malformed JSON has no message (raw tail used)', () => {
    const r = humanizeChatError('Provider request failed (503): {garbage')
    expect(r.title).toBe('The AI provider is temporarily unavailable')
    expect(r.detail).toBe('{garbage')
  })

  it('strips the "Provider request failed (NNN):" prefix for plain-text details', () => {
    const r = humanizeChatError('Provider request failed (500): upstream exploded')
    expect(r.detail).toBe('upstream exploded')
  })

  it('leaves detail undefined when the prefix strip removes everything', () => {
    const r = humanizeChatError('Provider request failed (500):')
    expect(r.title).toBe('The AI provider is temporarily unavailable')
    expect(r.detail).toBeUndefined()
  })
})
