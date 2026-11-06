/**
 * Timeline module - fixed date range and pure date helpers.
 *
 * The timeline spans a FIXED range (Sep 1, 2026 – Dec 31, 2040) per the module
 * spec. All dates are handled as 'YYYY-MM-DD' strings and mapped to UTC-midnight
 * milliseconds so day math is immune to DST shifts.
 */

export const TIMELINE_START = '2026-09-01'
export const TIMELINE_END = '2040-12-31'
export const TIMELINE_RANGE_LABEL = 'Sep 1, 2026 – Dec 31, 2040'

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
  year: number
}

export function dayInfoOf(index: number): DayInfo {
  const d = new Date(isoToUtcMs(TIMELINE_START) + index * DAY_MS)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  return { iso: `${year}-${pad2(month)}-${pad2(day)}`, day, month, year }
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

/**
 * Event label date: 'Sep 8' inside the current year, 'Sep 8, 2027' outside it,
 * so a multi-year timeline never shows an ambiguous month/day alone.
 */
export function formatEventDate(iso: string, today: string): string {
  const short = formatShortDate(iso)
  const year = iso.slice(0, 4)
  return year === today.slice(0, 4) ? short : `${short}, ${year}`
}

export interface MonthSegment {
  /** 'SEP 2026' on the first month and every January; 'OCT' etc. otherwise. */
  label: string
  year: number
  month: number
  startIndex: number
  endIndex: number
}

export interface YearSegment {
  year: number
  startIndex: number
  endIndex: number
}

function buildMonthSegments(): MonthSegment[] {
  const segments: MonthSegment[] = []
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const { month, year } = dayInfoOf(i)
    const current = segments[segments.length - 1]
    if (current && current.month === month && current.year === year) {
      current.endIndex = i
    } else {
      const name = MONTH_SHORT[month - 1].toUpperCase()
      const label = segments.length === 0 || month === 1 ? `${name} ${year}` : name
      segments.push({ label, year, month, startIndex: i, endIndex: i })
    }
  }
  return segments
}

function buildYearSegments(months: MonthSegment[]): YearSegment[] {
  const segments: YearSegment[] = []
  for (const m of months) {
    const current = segments[segments.length - 1]
    if (current && current.year === m.year) {
      current.endIndex = m.endIndex
    } else {
      segments.push({ year: m.year, startIndex: m.startIndex, endIndex: m.endIndex })
    }
  }
  return segments
}

export const MONTH_SEGMENTS = buildMonthSegments()

export const YEAR_SEGMENTS = buildYearSegments(MONTH_SEGMENTS)

/** Every day in the range, precomputed once at module load. */
export const ALL_DAYS: DayInfo[] = Array.from({ length: TOTAL_DAYS }, (_, i) => dayInfoOf(i))
