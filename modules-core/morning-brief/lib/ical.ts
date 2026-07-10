/**
 * Morning Brief - iCal subscription parsing
 *
 * Fetches a subscribed `.ics` feed (e.g. Google Calendar's "secret address in
 * iCal format") and returns today's events in the SAME `BriefMeeting` shape the
 * Google OAuth path produces, so the UI is agnostic to the calendar source.
 *
 * Recurring events (RRULE) and per-occurrence exceptions are expanded by
 * `ical-expander` (built on ical.js); "today" is bounded in the user's timezone
 * via the shared `getDayBoundsISO` helper.
 */
import IcalExpander from 'ical-expander'
import type ICAL from 'ical.js'
import { getDayBoundsISO, toBriefMeeting } from './google'
import type { BriefMeeting } from '@/modules/morning-brief/types'

const FETCH_TIMEOUT_MS = 10_000

/** Quick shape check so we fail with a clear message on a non-calendar URL. */
export function looksLikeIcs(text: string): boolean {
  return text.includes('BEGIN:VCALENDAR')
}

/** Fetch the raw `.ics` text for a feed URL (with a request timeout). */
export async function fetchIcsText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' },
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Calendar feed responded ${res.status}`)
  }
  return res.text()
}

/** An expander event/occurrence reduced to the fields we display, with its
 *  start/end converted to JS Dates exactly once (cheaper sort + reuse below). */
interface RawEvent {
  uid: string
  summary: string
  location: string
  startDate: Date
  endDate: Date | null
  allDay: boolean
}

function normalize(
  uid: string,
  summary: string,
  location: string,
  start: ICAL.Time,
  end: ICAL.Time | undefined,
): RawEvent {
  return {
    uid,
    summary,
    location,
    startDate: start.toJSDate(),
    endDate: end ? end.toJSDate() : null,
    allDay: start.isDate,
  }
}

/**
 * Today's events from a subscribed iCal feed, in the user's timezone, as
 * display-ready rows. Mirrors `fetchTodaysEvents` (the Google path).
 */
export async function fetchTodaysIcalEvents(url: string, timezone: string): Promise<BriefMeeting[]> {
  const ics = await fetchIcsText(url)
  if (!looksLikeIcs(ics)) {
    throw new Error('That link did not return a calendar (.ics) feed')
  }

  const { timeMin, timeMax } = getDayBoundsISO(timezone)
  const after = new Date(timeMin)
  const before = new Date(timeMax)

  const expander = new IcalExpander({ ics, maxIterations: 2000, skipInvalidDates: true })
  const { events, occurrences } = expander.between(after, before)

  const raw: RawEvent[] = [
    ...events.map((e) => normalize(e.uid, e.summary, e.location, e.startDate, e.endDate)),
    ...occurrences.map((o) => normalize(o.item.uid, o.item.summary, o.item.location, o.startDate, o.endDate)),
  ]

  raw.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  return raw.map((it, i) =>
    toBriefMeeting(
      {
        // Deterministic + unique even when feeds reuse UIDs across occurrences.
        id: `${it.uid || 'event'}-${it.startDate.getTime()}-${i}`,
        title: it.summary,
        location: it.location || null,
        startISO: it.startDate.toISOString(),
        endISO: it.endDate ? it.endDate.toISOString() : null,
        allDay: it.allDay,
      },
      timezone,
    ),
  )
}
