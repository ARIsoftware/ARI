import { describe, it, expect } from 'vitest'
import {
  sanitizeTaskTitlePrefill,
  buildAddTaskHref,
  TASK_TITLE_MAX_LENGTH,
  TASK_TITLE_PARAM,
} from '@/modules-core/tasks/lib/title-prefill'

describe('sanitizeTaskTitlePrefill', () => {
  it('passes ordinary text through unchanged', () => {
    expect(sanitizeTaskTitlePrefill('buy some milk, cakes and cheese')).toBe(
      'buy some milk, cakes and cheese',
    )
  })

  it('returns an empty string for missing or non-string input', () => {
    expect(sanitizeTaskTitlePrefill(null)).toBe('')
    expect(sanitizeTaskTitlePrefill(undefined)).toBe('')
    expect(sanitizeTaskTitlePrefill('')).toBe('')
    expect(sanitizeTaskTitlePrefill(42)).toBe('')
    expect(sanitizeTaskTitlePrefill(['a'])).toBe('')
  })

  it('returns an empty string when only whitespace / invisible characters remain', () => {
    expect(sanitizeTaskTitlePrefill('   \n\t ')).toBe('')
    expect(sanitizeTaskTitlePrefill('\u200B\u202E\uFEFF')).toBe('')
  })

  it('keeps markup-looking text as literal text (it is never rendered as HTML)', () => {
    const raw = '<script>alert(1)</script> fix <b>bold</b> & "quotes"'
    expect(sanitizeTaskTitlePrefill(raw)).toBe(raw)
  })

  it('collapses control characters and newlines into single spaces', () => {
    expect(sanitizeTaskTitlePrefill('line one\r\nline two\tthree\u0000four\u0085five')).toBe(
      'line one line two three four five',
    )
    expect(sanitizeTaskTitlePrefill('a\u2028b\u2029c')).toBe('abc')
  })

  it('strips bidi overrides and invisible characters used to disguise text', () => {
    // "Trojan Source"-style right-to-left override
    expect(sanitizeTaskTitlePrefill('pay \u202Eecivni\u202C now')).toBe('pay ecivni now')
    expect(sanitizeTaskTitlePrefill('\u2066isolate\u2069 \u200Ezero\u200Bwidth\u2060\uFEFF')).toBe(
      'isolate zerowidth',
    )
  })

  it('keeps emoji, joiners and non-Latin scripts', () => {
    expect(sanitizeTaskTitlePrefill('call 👨\u200D👩\u200D👧 family')).toBe('call 👨\u200D👩\u200D👧 family')
    expect(sanitizeTaskTitlePrefill('خرید\u200Cها — 牛奶を買う')).toBe('خرید\u200Cها — 牛奶を買う')
  })

  it('normalizes to NFC', () => {
    expect(sanitizeTaskTitlePrefill('cafe\u0301')).toBe('café')
  })

  it('removes lone surrogates', () => {
    expect(sanitizeTaskTitlePrefill('a\uD800b\uDC00c')).toBe('abc')
  })

  it('caps length at the API limit', () => {
    const result = sanitizeTaskTitlePrefill('x'.repeat(10_000))
    expect(result).toBe('x'.repeat(TASK_TITLE_MAX_LENGTH))
  })

  it('never splits an astral character when truncating (limit counts UTF-16 units)', () => {
    const result = sanitizeTaskTitlePrefill('a' + '😀'.repeat(300))
    expect(result.length).toBeLessThanOrEqual(TASK_TITLE_MAX_LENGTH)
    expect(result).toBe('a' + '😀'.repeat(127))
    expect(result.isWellFormed()).toBe(true)
  })

  it('trims trailing whitespace left at the truncation point', () => {
    const raw = 'x'.repeat(TASK_TITLE_MAX_LENGTH - 1) + ' yz'
    expect(sanitizeTaskTitlePrefill(raw)).toBe('x'.repeat(TASK_TITLE_MAX_LENGTH - 1))
  })
})

describe('buildAddTaskHref', () => {
  it('encodes the sanitized title as a query parameter on the fixed add route', () => {
    const href = buildAddTaskHref('buy milk & eggs?#now')
    expect(href.startsWith('/tasks/add?')).toBe(true)
    const params = new URL(href, 'http://localhost').searchParams
    expect(params.get(TASK_TITLE_PARAM)).toBe('buy milk & eggs?#now')
    expect([...params.keys()]).toEqual([TASK_TITLE_PARAM])
  })

  it('round-trips through URL parsing and sanitization unchanged', () => {
    const text = 'schedule a brainstorm session'
    const params = new URL(buildAddTaskHref(text), 'http://localhost').searchParams
    expect(sanitizeTaskTitlePrefill(params.get(TASK_TITLE_PARAM))).toBe(text)
  })

  it('sanitizes before encoding', () => {
    const params = new URL(buildAddTaskHref('  a\n\u202Eb  '), 'http://localhost').searchParams
    expect(params.get(TASK_TITLE_PARAM)).toBe('a b')
  })

  it('returns the bare add route when nothing usable remains', () => {
    expect(buildAddTaskHref('   ')).toBe('/tasks/add')
  })
})
