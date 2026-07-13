/**
 * Client-safe formatting helpers for the Health Data module.
 */

export function fmtNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Minutes → "7h 32m" */
export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—'
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours === 0) return `${mins}m`
  return `${hours}h ${mins}m`
}

/** "2026-07-08" → "Jul 8, 2026" (parsed as a plain date, no TZ shifting) */
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return dateStr
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "2026-07-08" → "Jul 8" for chart axis ticks */
export function fmtDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return dateStr
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** ISO timestamp (with offset) → "Jul 8, 2026, 9:41 PM" in the recorded local time */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  // Display the wall-clock time as recorded on the device, not shifted
  // into the viewer's timezone
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!match) return iso
  const [, year, month, day, hour, minute] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Milliseconds → "42m" countdown text (rounded up so it never shows 0m while active) */
export function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0m'
  return `${Math.ceil(ms / 60000)}m`
}

export function fmtDistanceKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—'
  return `${fmtNumber(km, km >= 100 ? 0 : 1)} km`
}
