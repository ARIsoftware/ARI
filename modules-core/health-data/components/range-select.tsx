'use client'

import { Button } from '@/components/ui/button'
import { toLocalDateString } from '@/modules/health-data/lib/stats'

export type DateRange = 30 | 90 | 365 | 'all'

const OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
  { value: 365, label: '1Y' },
  { value: 'all', label: 'All' },
]

export function RangeSelect({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-sm border border-border bg-muted/40 p-1">
      {OPTIONS.map((option) => (
        <Button
          key={option.label}
          variant={value === option.value ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

/**
 * Keep only rows within the last `range` days of the dataset itself
 * (relative to the newest date present, not today — the export may be old).
 */
export function filterByRange<T extends { date: string }>(rows: T[], range: DateRange): T[] {
  if (range === 'all' || rows.length === 0) return rows
  const lastDate = rows.reduce((max, row) => (row.date > max ? row.date : max), rows[0].date)
  const cutoff = new Date(`${lastDate}T00:00:00`)
  cutoff.setDate(cutoff.getDate() - range)
  // Format in local time — toISOString() would shift the boundary a day
  // for browsers in UTC-positive timezones
  const cutoffStr = toLocalDateString(cutoff)
  return rows.filter((row) => row.date >= cutoffStr)
}
