'use client'

import { useMemo } from 'react'
import { ComposedChart, CartesianGrid, Scatter, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { fmtDate, fmtDateShort } from '@/modules/health-data/lib/format'
import { strideSample, toLocalDateString } from '@/modules/health-data/lib/stats'
import type { HealthSleepNight } from '@/modules/health-data/types'

/** Cap scatter dots per series so multi-year ranges stay smooth */
const MAX_POINTS_PER_SERIES = 600

const config: ChartConfig = {
  bed: { label: 'Bedtime', color: 'hsl(var(--chart-3))' },
  wake: { label: 'Wake time', color: 'hsl(var(--chart-2))' },
}

interface TimePoint {
  x: number
  /** Hours since noon (0–24) so night hours are contiguous on the axis */
  y: number
  date: string
  clock: string
}

/**
 * Nightly bedtime and wake-time scatter. The y axis runs noon→noon so a
 * typical night (23:00 bed, 07:00 wake) plots as two nearby bands.
 */
export function BedtimeChart({ nights }: { nights: HealthSleepNight[] }) {
  const { bed, wake } = useMemo(() => {
    const bedPoints: TimePoint[] = []
    const wakePoints: TimePoint[] = []
    for (const night of nights) {
      const bedPoint = toTimePoint(night.night_date, night.start_time)
      const wakePoint = toTimePoint(night.night_date, night.end_time)
      if (bedPoint) bedPoints.push(bedPoint)
      if (wakePoint) wakePoints.push(wakePoint)
    }
    return {
      bed: strideSample(bedPoints, MAX_POINTS_PER_SERIES),
      wake: strideSample(wakePoints, MAX_POINTS_PER_SERIES),
    }
  }, [nights])

  return (
    <Card className="rounded-sm">
      <CardHeader>
        <CardTitle className="text-base">Bedtime &amp; Wake Time</CardTitle>
        <CardDescription>When each night started and ended</CardDescription>
      </CardHeader>
      <CardContent>
        {bed.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data in this period</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
            <ComposedChart margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={64}
                tickFormatter={(ms: number) => fmtDateShort(toLocalDateString(new Date(ms)))}
              />
              <YAxis
                dataKey="y"
                type="number"
                domain={[4, 24]}
                ticks={[8, 12, 16, 20]}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(hoursFromNoon: number) => `${(hoursFromNoon + 12) % 24}:00`}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0].payload as TimePoint
                  const label = payload[0].name === 'wake' ? 'Wake time' : 'Bedtime'
                  return (
                    <div className="rounded-sm border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="font-medium">{fmtDate(point.date)}</p>
                      <p className="text-muted-foreground">
                        {label}: {point.clock}
                      </p>
                    </div>
                  )
                }}
              />
              <Scatter name="bed" data={bed} fill="hsl(var(--chart-3))" isAnimationActive={false} shape={smallDot} />
              <Scatter name="wake" data={wake} fill="hsl(var(--chart-2))" isAnimationActive={false} shape={smallDot} />
            </ComposedChart>
          </ChartContainer>
        )}
        <div className="mt-3 flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-3))' }} />
            Bedtime
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-2))' }} />
            Wake time
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function smallDot(props: any) {
  const { cx, cy, fill } = props
  if (typeof cx !== 'number' || typeof cy !== 'number') return <g />
  return <circle cx={cx} cy={cy} r={1.8} fill={fill} />
}

function toTimePoint(nightDate: string, iso: string | null): TimePoint | null {
  if (!iso) return null
  const match = /T(\d{2}):(\d{2})/.exec(iso)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return {
    x: Date.parse(`${nightDate}T00:00:00`),
    y: ((hours * 60 + minutes + 720) % 1440) / 60,
    date: nightDate,
    clock: `${match[1]}:${match[2]}`,
  }
}
