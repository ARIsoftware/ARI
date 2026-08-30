/**
 * Timezones module — time zone math.
 *
 * The whole board is driven by a single absolute instant (UTC milliseconds).
 * Every card renders that instant in its own IANA zone, and editing a card
 * converts the typed wall-clock time back into an instant. That round-trip is
 * what makes "edit any clock, every clock follows" correct across DST.
 *
 * No date library — Intl.DateTimeFormat is the source of truth for offsets, so
 * DST transitions and historical rule changes are always handled by the ICU
 * data already shipping with the runtime.
 */

export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number // 0-59
  second: number // 0-59
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

// Intl.DateTimeFormat construction is measurably slow and every card rebuilds
// its clock on each tick, so keep one formatter per zone.
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(zone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(zone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  formatterCache.set(zone, formatter)
  return formatter
}

/** Wall-clock parts of an absolute instant, as seen in `zone`. */
export function getZonedParts(zone: string, instant: number): ZonedParts {
  const parts = getFormatter(zone).formatToParts(new Date(instant))
  const values: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    // h23 still emits "24" for midnight in some ICU versions.
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

/**
 * Offset in milliseconds implied by parts already read from `instant`.
 *
 * Callers that render both the time and the offset should use this rather than
 * getZoneOffsetMs, which would format the same instant a second time —
 * Intl.formatToParts is the most expensive thing on the once-a-second path.
 */
export function zoneOffsetFromParts(parts: ZonedParts, instant: number): number {
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  // Drop sub-second precision from the instant — formatToParts has none.
  return asIfUtc - Math.floor(instant / 1000) * 1000
}

/**
 * Offset of `zone` from UTC at `instant`, in milliseconds.
 * Positive east of Greenwich (Tokyo = +9h), negative west (Toronto = -4h).
 */
export function getZoneOffsetMs(zone: string, instant: number): number {
  return zoneOffsetFromParts(getZonedParts(zone, instant), instant)
}

/**
 * Inverse of getZonedParts: the absolute instant at which `zone` shows this
 * wall-clock time.
 *
 * Two passes, because the offset we need depends on the instant we are trying
 * to find. The first guess uses the offset in effect at the naive UTC reading,
 * the second re-reads the offset at the resulting instant — which lands on the
 * correct side of a DST boundary.
 *
 * Edge cases, matching the Temporal proposal's "compatible" disambiguation:
 *  - Ambiguous (clocks fell back, the time happens twice) — the earlier of the
 *    two instants, which is what the refined pass naturally produces.
 *  - Nonexistent (clocks sprang forward, e.g. 02:30 on a US spring-forward
 *    Sunday) — shift forward past the gap rather than backward into it.
 *    Neither pass round-trips in a gap, and which one landed after the jump
 *    depends on whether the naive UTC reading fell before or after the
 *    transition, so take the later of the two.
 */
export function zonedPartsToInstant(zone: string, parts: Omit<ZonedParts, 'second'>): number {
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0)

  const firstGuess = naiveUtc - getZoneOffsetMs(zone, naiveUtc)
  const refined = naiveUtc - getZoneOffsetMs(zone, firstGuess)

  const roundTrip = getZonedParts(zone, refined)
  const survivesRoundTrip =
    roundTrip.year === parts.year &&
    roundTrip.month === parts.month &&
    roundTrip.day === parts.day &&
    roundTrip.hour === parts.hour &&
    roundTrip.minute === parts.minute

  if (survivesRoundTrip) return refined
  return Math.max(firstGuess, refined)
}

/**
 * Move the board by overriding part of how `instant` reads in `zone`, keeping
 * everything else. Editing a clock overrides hour/minute; picking a date
 * overrides year/month/day. Both go through the same DST-aware round-trip.
 */
export function reanchor(
  zone: string,
  instant: number,
  override: Partial<Omit<ZonedParts, 'second'>>
): number {
  return zonedPartsToInstant(zone, { ...getZonedParts(zone, instant), ...override })
}

/** "GMT-4", "GMT+5:30", "GMT" — matches how the offset reads on the card. */
export function formatOffsetLabel(offsetMs: number): string {
  if (offsetMs === 0) return 'GMT'

  const totalMinutes = Math.round(offsetMs / MINUTE_MS)
  const sign = totalMinutes < 0 ? '-' : '+'
  const hours = Math.floor(Math.abs(totalMinutes) / 60)
  const minutes = Math.abs(totalMinutes) % 60

  if (minutes === 0) return `GMT${sign}${hours}`
  return `GMT${sign}${hours}:${String(minutes).padStart(2, '0')}`
}

/**
 * Offset label for a zone, cached per quarter-hour.
 *
 * Rendering a long list of zones would otherwise construct a formatter for each
 * one on every parent re-render. Offsets only ever change on a quarter-hour
 * boundary, so bucketing the instant keeps the label exact while making the
 * clock tick stop invalidating it. The cache is dropped whole when the bucket
 * rolls over, bounding it to one entry per zone.
 */
const OFFSET_BUCKET_MS = 900_000
const offsetLabelCache = new Map<string, string>()
let offsetLabelBucket = -1

export function zoneOffsetLabel(zone: string, instant: number): string {
  const bucket = Math.floor(instant / OFFSET_BUCKET_MS)
  if (bucket !== offsetLabelBucket) {
    offsetLabelCache.clear()
    offsetLabelBucket = bucket
  }

  const cached = offsetLabelCache.get(zone)
  if (cached !== undefined) return cached

  const label = formatOffsetLabel(getZoneOffsetMs(zone, instant))
  offsetLabelCache.set(zone, label)
  return label
}

/** "1:00 PM" */
export function formatTime12(parts: Pick<ZonedParts, 'hour' | 'minute'>): string {
  const meridiem = parts.hour < 12 ? 'AM' : 'PM'
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12
  return `${hour12}:${String(parts.minute).padStart(2, '0')} ${meridiem}`
}

/** "Wed, Aug 26" */
export function formatDateLabel(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>): string {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return `${WEEKDAYS[utc.getUTCDay()]}, ${MONTHS[parts.month - 1]} ${parts.day}`
}

/**
 * How far `parts` lands from `reference` in whole calendar days: "+1 day",
 * "-2 days", or null when both are on the same date.
 */
export function formatDayDelta(
  parts: Pick<ZonedParts, 'year' | 'month' | 'day'>,
  reference: Pick<ZonedParts, 'year' | 'month' | 'day'>
): string | null {
  const a = Date.UTC(parts.year, parts.month - 1, parts.day)
  const b = Date.UTC(reference.year, reference.month - 1, reference.day)
  const delta = Math.round((a - b) / DAY_MS)

  if (delta === 0) return null

  const sign = delta > 0 ? '+' : '-'
  const magnitude = Math.abs(delta)
  return `${sign}${magnitude} ${magnitude === 1 ? 'day' : 'days'}`
}

const WITH_SEPARATOR = /^(\d{1,2})[:.h](\d{1,2})(am|pm|a|p)?$/
const WITHOUT_SEPARATOR = /^(\d{1,2})(\d{2})?(am|pm|a|p)?$/

/**
 * Parse the free-text clock input. Accepts `3pm`, `3:30 PM`, `15:00`, `1500`,
 * `9:30 am`, `noon`, `midnight`. Returns null when the text isn't a time.
 */
export function parseTimeInput(raw: string): { hour: number; minute: number } | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!normalized) return null
  if (normalized === 'noon' || normalized === 'midday') return { hour: 12, minute: 0 }
  if (normalized === 'midnight') return { hour: 0, minute: 0 }

  const match = WITH_SEPARATOR.exec(normalized) ?? WITHOUT_SEPARATOR.exec(normalized)
  if (!match) return null

  let hour = Number(match[1])
  const minute = match[2] === undefined ? 0 : Number(match[2])
  const meridiem = match[3]

  if (minute > 59) return null

  if (meridiem) {
    // 12-hour input: only 1-12 is meaningful, and 12am/12pm wrap specially.
    if (hour < 1 || hour > 12) return null
    hour = hour % 12
    if (meridiem.startsWith('p')) hour += 12
  } else if (hour > 23) {
    return null
  }

  return { hour, minute }
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires" */
export function zoneCityLabel(zone: string): string {
  const segments = zone.split('/')
  return segments[segments.length - 1].replace(/_/g, ' ')
}

/** "America/Argentina/Buenos_Aires" → "America · Argentina" */
export function zoneRegionLabel(zone: string): string {
  const segments = zone.split('/')
  if (segments.length < 2) return ''
  return segments.slice(0, -1).join(' · ').replace(/_/g, ' ')
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

// Fallback for runtimes without Intl.supportedValuesOf (added in Node 18 /
// Safari 15.4). Rare, but a blank picker would make the module unusable.
const FALLBACK_ZONES = [
  'UTC',
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Bogota',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Zurich', 'Europe/Rome',
  'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Athens', 'Europe/Kyiv', 'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Casablanca', 'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi',
  'Asia/Jerusalem', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu',
  'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Hong_Kong',
  'Asia/Shanghai', 'Asia/Manila', 'Asia/Seoul', 'Asia/Tokyo',
  'Australia/Perth', 'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Sydney',
  'Pacific/Auckland', 'Pacific/Honolulu',
]

/** A zone plus its search keys, precomputed once so filtering never re-derives them. */
export interface TimeZoneEntry {
  zone: string
  /** Lowercased city label, e.g. "buenos aires". */
  city: string
  /** Lowercased full path with separators flattened, e.g. "america argentina buenos aires". */
  haystack: string
}

let cachedZones: TimeZoneEntry[] | null = null

/**
 * Every IANA zone the runtime knows about, sorted by city label.
 *
 * The search keys are built here rather than in the filter because the picker
 * re-filters on every keystroke — deriving them per comparison meant thousands
 * of string splits and collator spin-ups per character typed.
 */
export function listTimeZones(): TimeZoneEntry[] {
  if (cachedZones) return cachedZones

  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  let zones: string[] = []

  if (typeof supportedValuesOf === 'function') {
    try {
      zones = supportedValuesOf('timeZone')
    } catch {
      zones = []
    }
  }

  if (zones.length === 0) zones = FALLBACK_ZONES

  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

  cachedZones = [...new Set([...zones, 'UTC'])]
    .map((zone) => ({
      zone,
      city: zoneCityLabel(zone).toLowerCase(),
      haystack: zone.toLowerCase().replace(/[_/]/g, ' '),
    }))
    .sort((a, b) => collator.compare(a.city, b.city))

  return cachedZones
}

/** The viewer's own zone, used until they pick one explicitly. */
export function detectBrowserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone && isValidTimeZone(zone)) return zone
  } catch {
    // fall through
  }
  return 'UTC'
}
