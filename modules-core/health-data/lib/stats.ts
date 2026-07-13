/**
 * Small client-side aggregation helpers shared by the Health Data pages.
 */

export interface ValuePoint {
  date: string
  value: number | null
}

export function averageOf(data: ValuePoint[] | undefined): number | null {
  if (!data) return null
  let sum = 0
  let count = 0
  for (const point of data) {
    if (point.value !== null) {
      sum += point.value
      count++
    }
  }
  return count > 0 ? sum / count : null
}

export function totalOf(data: ValuePoint[] | undefined): number | null {
  if (!data || data.length === 0) return null
  return data.reduce((sum, point) => sum + (point.value ?? 0), 0)
}

export function latestOf(data: ValuePoint[] | undefined): number | null {
  if (!data) return null
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].value !== null) return data[i].value
  }
  return null
}

export function avgNumbers(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * YYYY-MM-DD of a Date in LOCAL time. Never use toISOString() for date
 * bucketing — it converts to UTC and shifts the calendar day for users in
 * UTC-positive timezones.
 */
export function toLocalDateString(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

/** Monday of the ISO week containing the given YYYY-MM-DD date */
export function weekStart(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = (date.getDay() + 6) % 7 // Monday = 0
  date.setDate(date.getDate() - weekday)
  return toLocalDateString(date)
}

/** Charts with more daily points than this get bucketed into weekly averages */
export const WEEKLY_BUCKET_THRESHOLD = 200

/**
 * Trailing rolling mean over the non-null values of the last `window`
 * points, aligned with the input (same dates, same length).
 */
export function rollingMean(data: ValuePoint[], window: number): ValuePoint[] {
  const out: ValuePoint[] = new Array(data.length)
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i++) {
    const incoming = data[i].value
    if (incoming !== null) {
      sum += incoming
      count++
    }
    const dropIdx = i - window
    if (dropIdx >= 0) {
      const outgoing = data[dropIdx].value
      if (outgoing !== null) {
        sum -= outgoing
        count--
      }
    }
    out[i] = { date: data[i].date, value: count > 0 ? sum / count : null }
  }
  return out
}

/** Uniformly sample rows down to at most maxPoints, keeping first and last */
export function strideSample<T>(rows: T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) return rows
  const stride = Math.ceil(rows.length / maxPoints)
  const out: T[] = []
  for (let i = 0; i < rows.length; i += stride) out.push(rows[i])
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1])
  return out
}

/**
 * Bucket daily rows into weekly rows, aggregating every numeric field.
 * `modes` chooses avg/min/max/sum per field; unlisted fields use avg.
 */
export function bucketWeekly<T extends { date: string }>(
  rows: T[],
  fields: Array<Exclude<keyof T, 'date'>>,
  modes: Partial<Record<keyof T, 'avg' | 'min' | 'max' | 'sum'>> = {}
): T[] {
  const weeks = new Map<string, { counts: Map<keyof T, number>; acc: Map<keyof T, number> }>()

  for (const row of rows) {
    const week = weekStart(row.date)
    let bucket = weeks.get(week)
    if (!bucket) {
      bucket = { counts: new Map(), acc: new Map() }
      weeks.set(week, bucket)
    }
    for (const field of fields) {
      const value = row[field] as unknown
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const mode = modes[field] ?? 'avg'
      const prev = bucket.acc.get(field)
      if (prev === undefined) {
        bucket.acc.set(field, value)
      } else if (mode === 'min') {
        bucket.acc.set(field, Math.min(prev, value))
      } else if (mode === 'max') {
        bucket.acc.set(field, Math.max(prev, value))
      } else {
        bucket.acc.set(field, prev + value)
      }
      bucket.counts.set(field, (bucket.counts.get(field) ?? 0) + 1)
    }
  }

  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, bucket]) => {
      const out = { date: week } as T
      for (const field of fields) {
        const acc = bucket.acc.get(field)
        const fieldCount = bucket.counts.get(field) ?? 0
        if (acc === undefined || fieldCount === 0) {
          ;(out as Record<string, unknown>)[field as string] = null
          continue
        }
        const mode = modes[field] ?? 'avg'
        ;(out as Record<string, unknown>)[field as string] = mode === 'avg' ? acc / fieldCount : acc
      }
      return out
    })
}
