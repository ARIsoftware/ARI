'use client'

import { memo, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDate, fmtNumber } from '@/modules/health-data/lib/format'

interface StepHeatmapProps {
  /** Daily step counts (date → value), any order */
  data: Array<{ date: string; value: number | null }>
}

const CELL = 11
const GAP = 2
const ROWS = 7

/**
 * GitHub-style "years at a glance" heatmap of daily steps: one row of
 * 53 week-columns per year, cell intensity scaled by that user's own
 * step distribution (quartiles of non-zero days).
 */
export const StepHeatmap = memo(function StepHeatmap({ data }: StepHeatmapProps) {
  const years = useMemo(() => buildYears(data), [data])

  if (years.length === 0) return null

  return (
    <Card className="rounded-sm">
      <CardHeader>
        <CardTitle className="text-base">{years.length} Years at a Glance</CardTitle>
        <CardDescription>Daily steps — darker means more steps that day</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        {years.map((year) => (
          <div key={year.year} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{year.year}</span>
            <svg
              width={53 * (CELL + GAP)}
              height={ROWS * (CELL + GAP)}
              className="shrink-0"
              role="img"
              aria-label={`Daily steps in ${year.year}`}
            >
              {year.cells.map((cell) => (
                <rect
                  key={cell.date}
                  x={cell.week * (CELL + GAP)}
                  y={cell.weekday * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill={cell.level === 0 ? 'hsl(var(--muted))' : LEVEL_GREENS[cell.level]}
                  fillOpacity={cell.level === 0 ? 0.6 : 1}
                >
                  <title>{`${fmtDate(cell.date)}: ${fmtNumber(cell.value)} steps`}</title>
                </rect>
              ))}
            </svg>
          </div>
        ))}
      </CardContent>
    </Card>
  )
})

/** GitHub-contributions green scale — intentional accent, same in all themes */
const LEVEL_GREENS: Record<number, string> = {
  1: '#9be9a8',
  2: '#40c463',
  3: '#30a14e',
  4: '#216e39',
}

interface YearGrid {
  year: number
  cells: Array<{ date: string; week: number; weekday: number; value: number; level: number }>
}

function buildYears(data: Array<{ date: string; value: number | null }>): YearGrid[] {
  const byDate = new Map<string, number>()
  const nonZero: number[] = []
  for (const point of data) {
    if (point.value !== null && point.value > 0) {
      byDate.set(point.date, point.value)
      nonZero.push(point.value)
    }
  }
  if (byDate.size === 0) return []

  nonZero.sort((a, b) => a - b)
  const quantile = (q: number) => nonZero[Math.min(Math.floor(q * nonZero.length), nonZero.length - 1)]
  const q1 = quantile(0.25)
  const q2 = quantile(0.5)
  const q3 = quantile(0.75)
  const levelFor = (value: number) => {
    if (value <= 0) return 0
    if (value < q1) return 1
    if (value < q2) return 2
    if (value < q3) return 3
    return 4
  }

  const dates = [...byDate.keys()].sort()
  const firstYear = Number(dates[0].slice(0, 4))
  const lastYear = Number(dates[dates.length - 1].slice(0, 4))

  const years: YearGrid[] = []
  for (let year = firstYear; year <= lastYear; year++) {
    const cells: YearGrid['cells'] = []
    const jan1 = new Date(year, 0, 1)
    // Monday-first column alignment
    const jan1Weekday = (jan1.getDay() + 6) % 7
    const date = new Date(year, 0, 1)
    while (date.getFullYear() === year) {
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      const key = `${year}-${mm}-${dd}`
      const value = byDate.get(key) ?? 0
      const dayOfYear = Math.round((date.getTime() - jan1.getTime()) / 86_400_000)
      cells.push({
        date: key,
        week: Math.floor((dayOfYear + jan1Weekday) / 7),
        weekday: (date.getDay() + 6) % 7,
        value,
        level: levelFor(value),
      })
      date.setDate(date.getDate() + 1)
    }
    // Skip years with no recorded steps at all
    if (cells.some((cell) => cell.value > 0)) {
      years.push({ year, cells })
    }
  }
  return years
}
