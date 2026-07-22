/**
 * Pure date/streak helpers for the Tasks Analytics page.
 *
 * Self-contained copies (the module must not import from other modules). All
 * functions operate on bare "YYYY-MM-DD" strings parsed at UTC midnight so they
 * are independent of the runtime timezone. ISO-8601 weekday convention:
 * 1 = Monday … 7 = Sunday.
 */

export interface WeekdayInfo {
  value: number // 1..7 (ISO)
  label: string // e.g. "Monday"
  short: string // e.g. "Mon"
}

export const WEEKDAYS: readonly WeekdayInfo[] = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
]

/**
 * Calendar date ("YYYY-MM-DD") of an instant in the given IANA timezone.
 * Falls back to UTC if the timezone string is invalid. This is what makes a
 * completion count toward the user's local day, not the server's UTC day.
 */
export function dateStrInTimeZone(instant: string | Date, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant
  try {
    // en-CA renders as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
  }
}

/** Current calendar date ("YYYY-MM-DD") in the given IANA timezone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return dateStrInTimeZone(now, timeZone)
}

/** Add (or subtract) whole days to a "YYYY-MM-DD" string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * ISO weekday (1=Mon … 7=Sun) for a bare "YYYY-MM-DD" date string.
 * Parsed at UTC midnight so it is independent of the runtime timezone.
 */
export function isoWeekdayFromDate(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun … 6=Sat
  return dow === 0 ? 7 : dow
}

/** Monday ("YYYY-MM-DD") of the ISO week containing dateStr. */
export function startOfIsoWeek(dateStr: string): string {
  return addDays(dateStr, -(isoWeekdayFromDate(dateStr) - 1))
}

/**
 * Current streak = consecutive days ending today with ≥1 entry in `dates`.
 * One-day grace: if today isn't in the set yet, start from yesterday so an
 * active streak isn't shown as broken until the day actually ends.
 */
export function currentDayStreak(dates: Set<string>, today: string): number {
  let cursor = dates.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (dates.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Longest run of consecutive days present in a sorted (ascending) date list. */
export function computeLongestStreak(sortedDates: string[]): number {
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const date of sortedDates) {
    if (prev !== null && addDays(prev, 1) === date) {
      run += 1
    } else {
      run = 1
    }
    if (run > longest) longest = run
    prev = date
  }
  return longest
}
