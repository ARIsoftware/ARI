import { describe, it, expect } from 'vitest'
import { stripSurroundingQuotes, formatBriefDate } from '@/modules-core/morning-brief/lib/format'

describe('stripSurroundingQuotes', () => {
  it('strips straight double quotes', () => {
    expect(stripSurroundingQuotes('"Hello world"')).toBe('Hello world')
  })

  it('strips curly double open/close quotes', () => {
    expect(stripSurroundingQuotes('“Hello world”')).toBe('Hello world')
  })

  it('strips straight single quotes', () => {
    expect(stripSurroundingQuotes("'Hello world'")).toBe('Hello world')
  })

  it('strips curly single quotes', () => {
    expect(stripSurroundingQuotes('‘Hello world’')).toBe('Hello world')
  })

  it('strips stacked double wrapping', () => {
    expect(stripSurroundingQuotes('""text""')).toBe('text')
  })

  it('does not strip mismatched quotes', () => {
    // open double, close single — not a valid pair
    expect(stripSurroundingQuotes('"Hello world\'')).toBe('"Hello world\'')
  })

  it('does not strip when only one end matches', () => {
    expect(stripSurroundingQuotes('"Hello world')).toBe('"Hello world')
  })

  it('returns empty string unchanged', () => {
    expect(stripSurroundingQuotes('')).toBe('')
  })

  it('trims surrounding whitespace', () => {
    expect(stripSurroundingQuotes('  "Hello"  ')).toBe('Hello')
  })

  it('text without quotes returned unchanged', () => {
    expect(stripSurroundingQuotes('No quotes here')).toBe('No quotes here')
  })

  it('single character string not stripped', () => {
    expect(stripSurroundingQuotes('"')).toBe('"')
  })

  it('two-char matching quote pair strips to empty', () => {
    expect(stripSurroundingQuotes('""')).toBe('')
  })
})

describe('formatBriefDate', () => {
  it('formats a YYYY-MM-DD date string into a readable form', () => {
    const result = formatBriefDate('2024-01-15')
    // Should include the year and day number
    expect(result).toContain('2024')
    expect(result).toContain('15')
  })

  it('without argument uses current date (contains current year)', () => {
    const result = formatBriefDate()
    const year = new Date().getFullYear().toString()
    expect(result).toContain(year)
  })

  it('formats with weekday included', () => {
    // 2024-01-15 is a Monday
    const result = formatBriefDate('2024-01-15')
    expect(result).toMatch(/Monday|Mon/)
  })

  it('formats a different date correctly', () => {
    const result = formatBriefDate('2023-07-04')
    expect(result).toContain('2023')
    expect(result).toContain('4')
  })
})
