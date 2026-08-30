/**
 * Tests for modules-core/timezones/lib/time.ts — zone math, DST round-trips,
 * label formatting, and the free-text time parser. Uses the runtime's real
 * Intl/ICU data (Node ships full ICU), with fixed instants so results are
 * deterministic regardless of the machine's own zone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getZonedParts,
  getZoneOffsetMs,
  zoneOffsetFromParts,
  zonedPartsToInstant,
  reanchor,
  formatOffsetLabel,
  zoneOffsetLabel,
  formatTime12,
  formatDateLabel,
  formatDayDelta,
  parseTimeInput,
  zoneCityLabel,
  zoneRegionLabel,
  isValidTimeZone,
  listTimeZones,
  detectBrowserTimeZone,
} from '@/modules-core/timezones/lib/time'

// 2026-08-15T12:00:00Z — northern-hemisphere summer (DST active in NA/EU).
const SUMMER = Date.UTC(2026, 7, 15, 12, 0, 0)
// 2026-01-15T12:00:00Z — winter (standard time in NA/EU).
const WINTER = Date.UTC(2026, 0, 15, 12, 0, 0)

const HOUR = 3_600_000

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getZonedParts', () => {
  it('reads UTC parts back verbatim', () => {
    expect(getZonedParts('UTC', SUMMER)).toEqual({
      year: 2026,
      month: 8,
      day: 15,
      hour: 12,
      minute: 0,
      second: 0,
    })
  })

  it('applies the zone offset (Tokyo is UTC+9, next-day rollover included)', () => {
    const parts = getZonedParts('Asia/Tokyo', Date.UTC(2026, 7, 15, 21, 30, 5))
    expect(parts).toEqual({ year: 2026, month: 8, day: 16, hour: 6, minute: 30, second: 5 })
  })
})

describe('offsets', () => {
  it('is positive east and negative west of Greenwich', () => {
    expect(getZoneOffsetMs('Asia/Tokyo', SUMMER)).toBe(9 * HOUR)
    expect(getZoneOffsetMs('America/Toronto', SUMMER)).toBe(-4 * HOUR) // EDT
    expect(getZoneOffsetMs('America/Toronto', WINTER)).toBe(-5 * HOUR) // EST
  })

  it('zoneOffsetFromParts matches getZoneOffsetMs without re-formatting', () => {
    const parts = getZonedParts('Europe/Paris', SUMMER)
    expect(zoneOffsetFromParts(parts, SUMMER)).toBe(getZoneOffsetMs('Europe/Paris', SUMMER))
  })

  it('drops sub-second precision from the instant', () => {
    const parts = getZonedParts('UTC', SUMMER + 250)
    expect(zoneOffsetFromParts(parts, SUMMER + 250)).toBe(0)
  })
})

describe('zonedPartsToInstant', () => {
  it('round-trips an unambiguous wall-clock time', () => {
    const instant = zonedPartsToInstant('America/Toronto', {
      year: 2026,
      month: 8,
      day: 15,
      hour: 9,
      minute: 30,
    })
    expect(getZonedParts('America/Toronto', instant)).toMatchObject({ hour: 9, minute: 30, day: 15 })
    expect(instant).toBe(Date.UTC(2026, 7, 15, 13, 30)) // EDT = UTC-4
  })

  it('picks the earlier instant for an ambiguous fall-back time', () => {
    // US fall-back 2026: Nov 1, clocks repeat 01:00-01:59 EDT then EST.
    const instant = zonedPartsToInstant('America/New_York', {
      year: 2026,
      month: 11,
      day: 1,
      hour: 1,
      minute: 30,
    })
    // Earlier occurrence is EDT (UTC-4): 05:30Z, not the EST 06:30Z.
    expect(instant).toBe(Date.UTC(2026, 10, 1, 5, 30))
  })

  it('shifts forward past a spring-forward gap instead of backward into it', () => {
    // US spring-forward 2026: Mar 8, 02:00-02:59 EST does not exist.
    const instant = zonedPartsToInstant('America/New_York', {
      year: 2026,
      month: 3,
      day: 8,
      hour: 2,
      minute: 30,
    })
    const parts = getZonedParts('America/New_York', instant)
    // Lands after the gap (03:30 EDT), never before it.
    expect(parts).toMatchObject({ day: 8, hour: 3, minute: 30 })
  })
})

describe('reanchor', () => {
  it('overrides only the given fields, keeping the rest of the reading', () => {
    const moved = reanchor('America/Toronto', SUMMER, { hour: 17, minute: 45 })
    const parts = getZonedParts('America/Toronto', moved)
    expect(parts).toMatchObject({ year: 2026, month: 8, day: 15, hour: 17, minute: 45 })
  })

  it('re-anchoring across a DST boundary stays DST-correct', () => {
    // Move a summer instant's date into deep winter: offset must become EST.
    const moved = reanchor('America/Toronto', SUMMER, { month: 1, day: 15 })
    expect(getZoneOffsetMs('America/Toronto', moved)).toBe(-5 * HOUR)
  })
})

describe('formatOffsetLabel', () => {
  it('formats zero, whole hours, and half hours', () => {
    expect(formatOffsetLabel(0)).toBe('GMT')
    expect(formatOffsetLabel(9 * HOUR)).toBe('GMT+9')
    expect(formatOffsetLabel(-4 * HOUR)).toBe('GMT-4')
    expect(formatOffsetLabel(5.5 * HOUR)).toBe('GMT+5:30')
    expect(formatOffsetLabel(-9.5 * HOUR)).toBe('GMT-9:30')
  })
})

describe('zoneOffsetLabel', () => {
  it('labels a zone and serves repeats from the cache within a bucket', () => {
    expect(zoneOffsetLabel('Asia/Kolkata', SUMMER)).toBe('GMT+5:30')
    // Same quarter-hour bucket — cached path.
    expect(zoneOffsetLabel('Asia/Kolkata', SUMMER + 1000)).toBe('GMT+5:30')
  })

  it('recomputes when the quarter-hour bucket rolls over', () => {
    expect(zoneOffsetLabel('America/Toronto', SUMMER)).toBe('GMT-4')
    // Different bucket AND different season → different label proves recompute.
    expect(zoneOffsetLabel('America/Toronto', WINTER)).toBe('GMT-5')
  })
})

describe('formatTime12', () => {
  it('covers midnight, noon, AM and PM', () => {
    expect(formatTime12({ hour: 0, minute: 5 })).toBe('12:05 AM')
    expect(formatTime12({ hour: 12, minute: 0 })).toBe('12:00 PM')
    expect(formatTime12({ hour: 9, minute: 30 })).toBe('9:30 AM')
    expect(formatTime12({ hour: 23, minute: 59 })).toBe('11:59 PM')
  })
})

describe('formatDateLabel', () => {
  it('renders weekday, month and day', () => {
    expect(formatDateLabel({ year: 2026, month: 8, day: 26 })).toBe('Wed, Aug 26')
    expect(formatDateLabel({ year: 2026, month: 1, day: 1 })).toBe('Thu, Jan 1')
  })
})

describe('formatDayDelta', () => {
  const ref = { year: 2026, month: 8, day: 15 }

  it('returns null on the same date', () => {
    expect(formatDayDelta({ ...ref }, ref)).toBeNull()
  })

  it('formats singular and plural deltas in both directions', () => {
    expect(formatDayDelta({ year: 2026, month: 8, day: 16 }, ref)).toBe('+1 day')
    expect(formatDayDelta({ year: 2026, month: 8, day: 13 }, ref)).toBe('-2 days')
    expect(formatDayDelta({ year: 2026, month: 9, day: 15 }, ref)).toBe('+31 days')
  })
})

describe('parseTimeInput', () => {
  it('parses the documented shapes', () => {
    expect(parseTimeInput('3pm')).toEqual({ hour: 15, minute: 0 })
    expect(parseTimeInput('3:30 PM')).toEqual({ hour: 15, minute: 30 })
    expect(parseTimeInput('15:00')).toEqual({ hour: 15, minute: 0 })
    expect(parseTimeInput('1500')).toEqual({ hour: 15, minute: 0 })
    expect(parseTimeInput('9:30 am')).toEqual({ hour: 9, minute: 30 })
    expect(parseTimeInput('9.45p')).toEqual({ hour: 21, minute: 45 })
    expect(parseTimeInput('7h15')).toEqual({ hour: 7, minute: 15 })
    expect(parseTimeInput('noon')).toEqual({ hour: 12, minute: 0 })
    expect(parseTimeInput('midday')).toEqual({ hour: 12, minute: 0 })
    expect(parseTimeInput('midnight')).toEqual({ hour: 0, minute: 0 })
  })

  it('wraps 12am/12pm correctly', () => {
    expect(parseTimeInput('12am')).toEqual({ hour: 0, minute: 0 })
    expect(parseTimeInput('12pm')).toEqual({ hour: 12, minute: 0 })
  })

  it('parses a bare hour as o-clock', () => {
    expect(parseTimeInput('7')).toEqual({ hour: 7, minute: 0 })
    expect(parseTimeInput('23')).toEqual({ hour: 23, minute: 0 })
  })

  it('rejects non-times', () => {
    expect(parseTimeInput('')).toBeNull()
    expect(parseTimeInput('   ')).toBeNull()
    expect(parseTimeInput('banana')).toBeNull()
    expect(parseTimeInput('25:00')).toBeNull() // hour too large, 24h form
    expect(parseTimeInput('12:75')).toBeNull() // minute too large
    expect(parseTimeInput('0pm')).toBeNull() // 12-hour input below 1
    expect(parseTimeInput('13pm')).toBeNull() // 12-hour input above 12
  })
})

describe('zone labels', () => {
  it('extracts the city and region, un-snaking underscores', () => {
    expect(zoneCityLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
    expect(zoneCityLabel('Europe/London')).toBe('London')
    expect(zoneRegionLabel('America/Argentina/Buenos_Aires')).toBe('America · Argentina')
    expect(zoneRegionLabel('Europe/London')).toBe('Europe')
  })

  it('returns an empty region for single-segment zones', () => {
    expect(zoneRegionLabel('UTC')).toBe('')
    expect(zoneCityLabel('UTC')).toBe('UTC')
  })
})

describe('isValidTimeZone', () => {
  it('accepts known zones and rejects junk', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Not/A_Zone')).toBe(false)
  })
})

describe('listTimeZones', () => {
  it('lists real zones with precomputed search keys, sorted by city', () => {
    const zones = listTimeZones()
    expect(zones.length).toBeGreaterThan(50)
    const tokyo = zones.find((z) => z.zone === 'Asia/Tokyo')
    expect(tokyo).toMatchObject({ city: 'tokyo', haystack: 'asia tokyo' })
    expect(zones.some((z) => z.zone === 'UTC')).toBe(true)
    const cities = zones.map((z) => z.city)
    expect([...cities].sort((a, b) => a.localeCompare(b))).toEqual(cities)
  })

  it('returns the same cached array on repeat calls', () => {
    expect(listTimeZones()).toBe(listTimeZones())
  })

  it('falls back to the built-in list when supportedValuesOf is missing', async () => {
    vi.resetModules()
    const original = (Intl as { supportedValuesOf?: unknown }).supportedValuesOf
    delete (Intl as { supportedValuesOf?: unknown }).supportedValuesOf
    try {
      const fresh = await import('@/modules-core/timezones/lib/time')
      const zones = fresh.listTimeZones()
      expect(zones.some((z) => z.zone === 'America/Toronto')).toBe(true)
      expect(zones.some((z) => z.zone === 'UTC')).toBe(true)
    } finally {
      ;(Intl as { supportedValuesOf?: unknown }).supportedValuesOf = original
      vi.resetModules()
    }
  })

  it('falls back when supportedValuesOf throws', async () => {
    vi.resetModules()
    const original = (Intl as { supportedValuesOf?: unknown }).supportedValuesOf
    ;(Intl as { supportedValuesOf?: unknown }).supportedValuesOf = () => {
      throw new Error('boom')
    }
    try {
      const fresh = await import('@/modules-core/timezones/lib/time')
      expect(fresh.listTimeZones().some((z) => z.zone === 'Pacific/Auckland')).toBe(true)
    } finally {
      ;(Intl as { supportedValuesOf?: unknown }).supportedValuesOf = original
      vi.resetModules()
    }
  })
})

describe('detectBrowserTimeZone', () => {
  it('returns the runtime zone when it is valid', () => {
    const zone = detectBrowserTimeZone()
    expect(isValidTimeZone(zone)).toBe(true)
  })

  it('falls back to UTC when resolvedOptions throws', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => {
      throw new Error('no zone')
    })
    expect(detectBrowserTimeZone()).toBe('UTC')
  })

  it('falls back to UTC when the reported zone is empty', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: '',
    } as Intl.ResolvedDateTimeFormatOptions)
    expect(detectBrowserTimeZone()).toBe('UTC')
  })
})
