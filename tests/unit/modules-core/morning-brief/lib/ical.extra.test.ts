/**
 * Extra coverage for morning-brief/lib/ical.ts.
 *
 * Targets:
 * - fetchTodaysIcalEvents: occurrence with null endDate (line 85 `o.endDate` branch)
 * - normalize: end=undefined → endDate=null (line 61 `end ? end.toJSDate() : null`)
 * - fetchTodaysIcalEvents: uid empty → fallback to 'event' in id (line 94)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// Mock ical-expander with events that have no endDate (undefined) and empty uid
vi.mock('ical-expander', () => {
  return {
    default: class IcalExpander {
      between(_after: Date, _before: Date) {
        const startDate = {
          toJSDate: () => new Date('2024-01-15T09:00:00Z'),
          isDate: false,
        }
        return {
          events: [
            {
              uid: '', // empty uid → fallback 'event' in id
              summary: 'No UID Event',
              location: null,
              startDate,
              endDate: undefined, // triggers null path in normalize
            },
          ],
          occurrences: [
            {
              item: {
                uid: 'recurring-uid',
                summary: 'Recurring No End',
                location: 'Virtual',
              },
              startDate: {
                toJSDate: () => new Date('2024-01-15T14:00:00Z'),
                isDate: true, // allDay
              },
              endDate: undefined, // triggers null path
            },
          ],
        }
      }
    },
  }
})

import { fetchTodaysIcalEvents } from '@/modules-core/morning-brief/lib/ical'

describe('fetchTodaysIcalEvents — edge cases', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('handles events with no endDate (endDate=undefined → endISO=null)', async () => {
    const events = await fetchTodaysIcalEvents('https://example.com/cal.ics', 'UTC')
    expect(events.length).toBe(2)
    // Events without endDate should have null endISO → endLabel=null
    expect(events[0].endLabel).toBeNull()
  })

  it('uses fallback id when uid is empty', async () => {
    const events = await fetchTodaysIcalEvents('https://example.com/cal.ics', 'UTC')
    // first event has empty uid → id should contain 'event'
    expect(events[0].id).toContain('event')
  })

  it('handles allDay occurrence with no endDate', async () => {
    const events = await fetchTodaysIcalEvents('https://example.com/cal.ics', 'UTC')
    // occurrence has isDate=true → allDay
    expect(events[1].allDay).toBe(true)
    expect(events[1].endLabel).toBeNull()
  })
})
