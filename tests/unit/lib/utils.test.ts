import { describe, it, expect, vi, afterEach } from 'vitest'
import { cn, parseUserAgent, formatRelativeTime } from '@/lib/utils'

// ─── cn ─────────────────────────────────────────────────────────────────────

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('deduplicates Tailwind utility conflicts (last wins)', () => {
    // tailwind-merge keeps the last conflicting utility
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('handles conditional class names', () => {
    expect(cn('base', false && 'not-this', 'also-this')).toBe('base also-this')
  })

  it('handles undefined inputs', () => {
    expect(cn(undefined, 'foo')).toBe('foo')
  })

  it('returns empty string with no arguments', () => {
    expect(cn()).toBe('')
  })

  it('handles array inputs via clsx', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })

  it('handles object inputs via clsx', () => {
    expect(cn({ active: true, disabled: false })).toBe('active')
  })
})

// ─── parseUserAgent ──────────────────────────────────────────────────────────

describe('parseUserAgent — null/undefined/empty', () => {
  it('returns "Unknown device" and "Unknown browser" for null', () => {
    expect(parseUserAgent(null)).toEqual({ device: 'Unknown device', browser: 'Unknown browser' })
  })

  it('returns "Unknown device" and "Unknown browser" for undefined', () => {
    expect(parseUserAgent(undefined)).toEqual({ device: 'Unknown device', browser: 'Unknown browser' })
  })

  it('returns "Unknown device" and "Unknown browser" for empty string', () => {
    expect(parseUserAgent('')).toEqual({ device: 'Unknown device', browser: 'Unknown browser' })
  })
})

describe('parseUserAgent — device detection', () => {
  it('detects iPhone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
    expect(parseUserAgent(ua).device).toBe('iPhone')
  })

  it('detects iPad', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
    expect(parseUserAgent(ua).device).toBe('iPad')
  })

  it('detects Android', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36'
    expect(parseUserAgent(ua).device).toBe('Android')
  })

  it('detects Mac', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    expect(parseUserAgent(ua).device).toBe('Mac')
  })

  it('detects Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    expect(parseUserAgent(ua).device).toBe('Windows')
  })

  it('detects Linux', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    expect(parseUserAgent(ua).device).toBe('Linux')
  })

  it('falls back to "Desktop" for unknown platform', () => {
    const ua = 'SomeUnknownBot/1.0'
    expect(parseUserAgent(ua).device).toBe('Desktop')
  })
})

describe('parseUserAgent — browser detection', () => {
  it('detects Chrome (no Edge)', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(parseUserAgent(ua).browser).toBe('Chrome')
  })

  it('detects Safari (no Chrome)', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    expect(parseUserAgent(ua).browser).toBe('Safari')
  })

  it('detects Firefox', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
    expect(parseUserAgent(ua).browser).toBe('Firefox')
  })

  it('detects Edge (has Edg in ua)', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    expect(parseUserAgent(ua).browser).toBe('Edge')
  })

  it('Chrome with Edg substring is classified as Edge, not Chrome', () => {
    // ua has both Chrome and Edg; Edge check comes after Chrome, but Chrome excludes "Edg"
    const ua = 'Chrome/120 Edg/120'
    expect(parseUserAgent(ua).browser).toBe('Edge')
  })

  it('returns "Unknown" for unrecognized browser', () => {
    const ua = 'curl/7.84.0'
    expect(parseUserAgent(ua).browser).toBe('Unknown')
  })
})

// ─── formatRelativeTime ──────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Just now" for < 1 minute ago', () => {
    vi.useFakeTimers()
    const now = new Date('2024-01-01T12:00:00Z')
    vi.setSystemTime(now)
    const thirtySecondsAgo = new Date(now.getTime() - 30_000)
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('Just now')
  })

  it('returns minutes ago for < 60 minutes', () => {
    vi.useFakeTimers()
    const now = new Date('2024-01-01T12:00:00Z')
    vi.setSystemTime(now)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000)
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago')
  })

  it('returns hours ago for < 24 hours', () => {
    vi.useFakeTimers()
    const now = new Date('2024-01-01T12:00:00Z')
    vi.setSystemTime(now)
    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000)
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago')
  })

  it('returns days ago for >= 24 hours and < 7 days', () => {
    vi.useFakeTimers()
    const now = new Date('2024-01-08T12:00:00Z')
    vi.setSystemTime(now)
    const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000)
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago')
  })

  it('returns a localeDateString for >= 7 days', () => {
    vi.useFakeTimers()
    const now = new Date('2024-01-15T12:00:00Z')
    vi.setSystemTime(now)
    const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000)
    const result = formatRelativeTime(tenDaysAgo)
    // Should be a locale date string, not a relative string
    expect(result).not.toMatch(/ago$/)
    expect(result).not.toBe('Just now')
    expect(result).toBe(tenDaysAgo.toLocaleDateString())
  })

  it('handles exactly 59 minutes (still "Xm ago")', () => {
    vi.useFakeTimers()
    const now = new Date('2024-01-01T12:00:00Z')
    vi.setSystemTime(now)
    const fiftyNineMinutesAgo = new Date(now.getTime() - 59 * 60_000)
    expect(formatRelativeTime(fiftyNineMinutesAgo)).toBe('59m ago')
  })

  it('handles exactly 23 hours (still "Xh ago")', () => {
    vi.useFakeTimers()
    const now = new Date('2024-01-01T12:00:00Z')
    vi.setSystemTime(now)
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 3_600_000)
    expect(formatRelativeTime(twentyThreeHoursAgo)).toBe('23h ago')
  })

  it('handles exactly 6 days (still "Xd ago")', () => {
    vi.useFakeTimers()
    const now = new Date('2024-01-08T12:00:00Z')
    vi.setSystemTime(now)
    const sixDaysAgo = new Date(now.getTime() - 6 * 86_400_000)
    expect(formatRelativeTime(sixDaysAgo)).toBe('6d ago')
  })
})
