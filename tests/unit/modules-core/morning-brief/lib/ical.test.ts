import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ical.ts imports from '@/modules/morning-brief/types' (resolves via @/modules/* alias
// in tsconfig but not in vitest). Mock the type-only import and google helpers.
vi.mock('@/modules/morning-brief/types', () => ({}))

vi.mock('@/modules-core/morning-brief/lib/google', () => ({
  getDayBoundsISO: (_tz: string) => ({
    timeMin: '2024-01-15T00:00:00+00:00',
    timeMax: '2024-01-16T00:00:00+00:00',
  }),
  toBriefMeeting: (fields: {
    id: string
    title: string
    location: string | null
    startISO: string | null
    endISO: string | null
    allDay: boolean
  }, _tz: string) => ({
    id: fields.id,
    title: fields.title || '(no title)',
    startLabel: fields.allDay ? 'All day' : '10:00 AM',
    endLabel: fields.allDay || !fields.endISO ? null : '11:00 AM',
    allDay: fields.allDay,
    location: fields.location,
    start: fields.startISO,
  }),
}))

// Mock ical-expander to avoid real iCal parsing in unit tests
vi.mock('ical-expander', () => {
  return {
    default: class IcalExpander {
      private ics: string
      constructor(opts: { ics: string }) {
        this.ics = opts.ics
      }
      between(_after: Date, _before: Date) {
        // Simulate two events
        const startDate = {
          toJSDate: () => new Date('2024-01-15T10:00:00Z'),
          isDate: false,
        }
        const endDate = {
          toJSDate: () => new Date('2024-01-15T11:00:00Z'),
        }
        return {
          events: [
            {
              uid: 'event-1',
              summary: 'Test Event',
              location: 'Room 101',
              startDate,
              endDate,
            },
          ],
          occurrences: [
            {
              item: {
                uid: 'event-2',
                summary: 'Recurring Event',
                location: '',
              },
              startDate: {
                toJSDate: () => new Date('2024-01-15T14:00:00Z'),
                isDate: false,
              },
              endDate: {
                toJSDate: () => new Date('2024-01-15T15:00:00Z'),
              },
            },
          ],
        }
      }
    },
  }
})

import { looksLikeIcs, fetchIcsText, fetchTodaysIcalEvents } from '@/modules-core/morning-brief/lib/ical'

describe('looksLikeIcs', () => {
  it('returns true for valid ICS text', () => {
    expect(looksLikeIcs('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBe(true)
  })

  it('returns false for non-ICS text', () => {
    expect(looksLikeIcs('<html>some page</html>')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(looksLikeIcs('')).toBe(false)
  })

  it('returns false for JSON', () => {
    expect(looksLikeIcs('{"key": "value"}')).toBe(false)
  })
})

describe('fetchIcsText', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns text on successful response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    } as Response)
    const result = await fetchIcsText('https://example.com/calendar.ics')
    expect(result).toContain('BEGIN:VCALENDAR')
  })

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)
    await expect(fetchIcsText('https://example.com/calendar.ics')).rejects.toThrow('404')
  })

  it('sends correct Accept header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'BEGIN:VCALENDAR',
    } as Response)
    await fetchIcsText('https://example.com/calendar.ics')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
    })
  })
})

describe('fetchTodaysIcalEvents', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns sorted events from the ical feed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    } as Response)
    const events = await fetchTodaysIcalEvents('https://example.com/calendar.ics', 'UTC')
    // Our mock returns 1 regular event + 1 occurrence = 2 total
    expect(events.length).toBe(2)
    expect(events[0].title).toBe('Test Event')
    expect(events[1].title).toBe('Recurring Event')
  })

  it('throws when response does not look like ICS', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '<html>Not a calendar</html>',
    } as Response)
    await expect(fetchTodaysIcalEvents('https://example.com/bad', 'UTC')).rejects.toThrow(
      'That link did not return a calendar (.ics) feed'
    )
  })

  it('throws when fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response)
    await expect(fetchTodaysIcalEvents('https://example.com/calendar.ics', 'UTC')).rejects.toThrow('403')
  })

  it('uses event uid in returned id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    } as Response)
    const events = await fetchTodaysIcalEvents('https://example.com/calendar.ics', 'UTC')
    expect(events[0].id).toContain('event-1')
  })
})
