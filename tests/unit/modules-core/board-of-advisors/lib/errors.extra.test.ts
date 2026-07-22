/**
 * Extra coverage for board-of-advisors/lib/errors.ts
 *
 * Uncovered branches/lines:
 * - extractMessage() recursive paths: o.error (line 18) and o.detail (line 19-20)
 * - extractMessage() when obj is falsy or non-object (line 15 — false branch)
 * - catch block when regex does NOT match (branch 42,'9','1')
 */
import { describe, it, expect } from 'vitest'
import { humanizeBoardError } from '@/modules-core/board-of-advisors/lib/errors'

describe('humanizeBoardError — extractMessage recursive paths', () => {
  it('extracts message from nested .error.message (recursive via o.error)', () => {
    // JSON has a nested error object with the message inside
    const raw = 'Provider request failed (401): {"error":{"message":"nested error message"}}'
    const result = humanizeBoardError(raw)
    expect(result.detail).toBe('nested error message')
  })

  it('extracts message from .detail.message (recursive via o.detail)', () => {
    // JSON where the message is nested under "detail"
    const raw = 'Provider request failed (401): {"detail":{"message":"detail-nested message"}}'
    const result = humanizeBoardError(raw)
    expect(result.detail).toBe('detail-nested message')
  })

  it('returns undefined from extractMessage when obj is null', () => {
    // A JSON body where top-level is null causes extractMessage to return undefined,
    // triggering the fallback detail path
    const raw = 'Provider request failed (500): null'
    const result = humanizeBoardError(raw)
    // detail falls back to stripped trailing text 'null'
    expect(result.title).toBe('The AI provider is temporarily unavailable')
  })

  it('returns undefined from extractMessage when recursive call receives non-object', () => {
    // JSON where "error" key is a truthy non-object (a string)
    // o.error is "some string" (truthy), so extractMessage("some string") is called
    // inside extractMessage: !obj is false, but typeof obj !== 'object' is true → return undefined
    const raw = 'Provider request failed (500): {"error": "raw string error"}'
    const result = humanizeBoardError(raw)
    // extractMessage("raw string error") returns undefined (not an object)
    expect(result.title).toBe('The AI provider is temporarily unavailable')
  })

  it('returns undefined from extractMessage when top-level is falsy (null JSON)', () => {
    // JSON.parse("null") produces null — extractMessage(null) → !obj is true → undefined
    const raw = 'Provider request failed (500): null'
    const result = humanizeBoardError(raw)
    expect(result.title).toBe('The AI provider is temporarily unavailable')
  })

  it('returns fallback stripped text as detail when top-level JSON has no message/error/detail', () => {
    // JSON with no extractable message — detail falls through to stripped text
    const raw = 'Provider request failed (500): {"code":503,"status":"service_unavailable"}'
    const result = humanizeBoardError(raw)
    expect(result.title).toBe('The AI provider is temporarily unavailable')
    // extractMessage returns undefined (no message/error/detail keys), so
    // detail falls back to the stripped trailing text (the JSON string itself)
    expect(result.detail).toBe('{"code":503,"status":"service_unavailable"}')
  })
})

describe('humanizeBoardError — catch block regex no-match', () => {
  it('falls back to stripped text when broken JSON has no "message" key', () => {
    // Malformed JSON that fails JSON.parse AND has no "message" key (regex doesn't match)
    const raw = 'Provider request failed (500): {broken json no msg key here}'
    const result = humanizeBoardError(raw)
    // No detail extracted from broken JSON (regex for "message" key did not match)
    // Falls back to stripped text which is the raw JSON fragment
    expect(result.title).toBe('The AI provider is temporarily unavailable')
    // detail comes from the stripped trailing text fallback
    expect(result.detail).toBe('{broken json no msg key here}')
  })
})

describe('humanizeBoardError — roundtable description contains original text', () => {
  it('description equals the original raw text for roundtable messages', () => {
    const raw = 'Roundtable is already running — please wait for it to finish'
    const result = humanizeBoardError(raw)
    expect(result.description).toBe(raw)
  })
})
