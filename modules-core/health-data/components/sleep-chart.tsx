'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { fmtDate, fmtDateShort, fmtDuration } from '@/modules/health-data/lib/format'
import { bucketWeekly, WEEKLY_BUCKET_THRESHOLD } from '@/modules/health-data/lib/stats'

export interface SleepStagePoint {
  date: string
  deep: number | null
  core: number | null
  rem: number | null
  awake: number | null
}

const STAGES = [
  { key: 'deep', label: 'Deep', color: 'hsl(var(--chart-2))' },
  { key: 'core', label: 'Core', color: 'hsl(var(--chart-3))' },
  { key: 'rem', label: 'REM', color: 'hsl(var(--chart-4))' },
  { key: 'awake', label: 'Awake', color: 'hsl(var(--chart-5))' },
] as const

const config: ChartConfig = Object.fromEntries(
  STAGES.map((s) => [s.key, { label: s.label, color: s.color }])
) as ChartConfig

/** Nightly sleep-stage stacked bars (hours per night). */
export function SleepChart({ data: nightlyData }: { data: SleepStagePoint[] }) {
  const bucketed = nightlyData.length > WEEKLY_BUCKET_THRESHOLD
  const data = useMemo(
    () => (bucketed ? bucketWeekly(nightlyData, ['deep', 'core', 'rem', 'awake']) : nightlyData),
    [nightlyData, bucketed]
  )

  return (
    <Card className="rounded-sm">
      <CardHeader>
        <CardTitle className="text-base">Sleep Stages</CardTitle>
        <CardDescription>
          {bucketed ? 'Weekly average time per stage' : 'Time per stage each night'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data in this period</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={48}
                tickFormatter={fmtDateShort}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(min: number) => `${Math.round(min / 60)}h`}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0].payload as SleepStagePoint
                  return (
                    <div className="rounded-sm border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="mb-1 font-medium">{fmtDate(point.date)}</p>
                      {STAGES.map((stage) => {
                        const value = point[stage.key]
                        if (value === null || value === 0) return null
                        return (
                          <p key={stage.key} className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: stage.color }} />
                            {stage.label}: {fmtDuration(value)}
                          </p>
                        )
                      })}
                    </div>
                  )
                }}
              />
              {STAGES.map((stage) => (
                <Bar key={stage.key} dataKey={stage.key} stackId="sleep" fill={stage.color} maxBarSize={20} />
              ))}
            </BarChart>
          </ChartContainer>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {STAGES.map((stage) => (
            <span key={stage.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: stage.color }} />
              {stage.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
