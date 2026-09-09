/**
 * Timeline module - fixed date range and pure date helpers.
 *
 * The timeline spans a FIXED range (Sep 1 – Dec 31, 2026) per the module spec.
 * All dates are handled as 'YYYY-MM-DD' strings and mapped to UTC-midnight
 * milliseconds so day math is immune to DST shifts.
 */

export const TIMELINE_START = '2026-09-01'
export const TIMELINE_END = '2026-12-31'
export const TIMELINE_RANGE_LABEL = 'Sep 1 – Dec 31, 2026'

export const EVENT_NAME_MAX = 100

const DAY_MS = 86_400_000

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoToUtcMs(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/** True only for strings that are real calendar dates (rejects e.g. 2026-09-31). */
export function isValidIsoDate(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

/** Zero-based day offset from TIMELINE_START. */
export function dayIndexOf(iso: string): number {
  return Math.round((isoToUtcMs(iso) - isoToUtcMs(TIMELINE_START)) / DAY_MS)
}

export const TOTAL_DAYS = dayIndexOf(TIMELINE_END) + 1

export interface DayInfo {
  iso: string
  day: number
  month: number
}

export function dayInfoOf(index: number): DayInfo {
  const d = new Date(isoToUtcMs(TIMELINE_START) + index * DAY_MS)
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  return { iso: `${d.getUTCFullYear()}-${pad2(month)}-${pad2(day)}`, day, month }
}

/** Today's date in the user's local timezone as 'YYYY-MM-DD'. */
export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** '2026-09-08' → 'Sep 8' */
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split('-').map(Number)
  return `${MONTH_SHORT[month - 1]} ${day}`
}

export interface MonthSegment {
  label: string
  startIndex: number
  endIndex: number
}

function buildMonthSegments(): MonthSegment[] {
  const segments: MonthSegment[] = []
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const { month } = dayInfoOf(i)
    const label = MONTH_SHORT[month - 1].toUpperCase()
    const current = segments[segments.length - 1]
    if (current && current.label === label) {
      current.endIndex = i
    } else {
      segments.push({ label, startIndex: i, endIndex: i })
    }
  }
  return segments
}

export const MONTH_SEGMENTS = buildMonthSegments()

/** Every day in the range, precomputed once at module load. */
export const ALL_DAYS: DayInfo[] = Array.from({ length: TOTAL_DAYS }, (_, i) => dayInfoOf(i))
