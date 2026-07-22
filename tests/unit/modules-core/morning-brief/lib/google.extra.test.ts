/**
 * Extra coverage for morning-brief/lib/google.ts.
 *
 * Targets uncovered branches:
 * - line 39: anonymous function inside getTimezoneOffset catch block
 * - formatTimeInTz with invalid timezone → catch branch (line 218)
 * - toBriefMeeting: endISO is null but !allDay (line 200 branch)
 * - fetchTodaysEvents: event with both date+dateTime (allDay detection)
 * - exchangeCodeForTokens: text() throws on error
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/modules/morning-brief/types', () => ({}))

import {
  formatTimeInTz,
  getDayBoundsISO,
  toBriefMeeting,
} from '@/modules-core/morning-brief/lib/google'

describe('formatTimeInTz — invalid timezone fallback', () => {
  it('does not throw and returns a string for bad timezone', () => {
    const result = formatTimeInTz('2024-01-15T14:00:00Z', 'Not/AValidZone')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('getDayBoundsISO — timezone offset fallback', () => {
  it('falls back to +00:00 when timezone is invalid', () => {
    const { timeMin } = getDayBoundsISO('Invalid/Timezone_XXXX')
    expect(timeMin).toContain('+00:00')
  })
})

describe('toBriefMeeting — edge cases', () => {
  it('endLabel is null when endISO is null and not allDay', () => {
    const result = toBriefMeeting(
      {
        id: 'e1',
        title: 'Event',
        location: null,
        startISO: '2024-01-15T10:00:00Z',
        endISO: null,
        allDay: false,
      },
      'UTC',
    )
    expect(result.endLabel).toBeNull()
  })

  it('endLabel is null when allDay even if endISO is provided', () => {
    const result = toBriefMeeting(
      {
        id: 'e2',
        title: 'Holiday',
        location: null,
        startISO: '2024-01-15',
        endISO: '2024-01-16',
        allDay: true,
      },
      'UTC',
    )
    expect(result.endLabel).toBeNull()
  })
})
