'use client'

import { useMemo } from 'react'
import { ComposedChart, CartesianGrid, Scatter, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { fmtDate, fmtDateShort, fmtDistanceKm } from '@/modules/health-data/lib/format'
import { toLocalDateString } from '@/modules/health-data/lib/stats'
import type { HealthWorkout } from '@/modules/health-data/types'

const config: ChartConfig = {
  pace: { label: 'Pace', color: 'hsl(var(--chart-2))' },
}

interface PacePoint {
  x: number
  y: number
  date: string
  paceLabel: string
  distanceKm: number
}

/** Minutes per km → "4:57" */
export function fmtPace(minPerKm: number): string {
  let minutes = Math.floor(minPerKm)
  let seconds = Math.round((minPerKm - minutes) * 60)
  if (seconds === 60) {
    minutes += 1
    seconds = 0
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Per-run pace scatter (min/km). Only running workouts with a meaningful
 * distance are shown; lower is faster.
 */
export function PaceChart({ workouts }: { workouts: HealthWorkout[] }) {
  const points = useMemo(() => {
    const out: PacePoint[] = []
    for (const workout of workouts) {
      if (workout.activity_type !== 'Running') continue
      if (!workout.distance_km || workout.distance_km < 0.3 || !workout.duration_min) continue
      const pace = workout.duration_min / workout.distance_km
      if (pace < 2 || pace > 20) continue
      const date = workout.start_time.slice(0, 10)
      out.push({
        x: Date.parse(`${date}T00:00:00`),
        y: pace,
        date,
        paceLabel: fmtPace(pace),
        distanceKm: workout.distance_km,
      })
    }
    return out.sort((a, b) => a.x - b.x)
  }, [workouts])

  const latest = points[points.length - 1]

  return (
    <Card className="rounded-sm">
      <CardHeader>
        <CardTitle className="text-base">Running Pace</CardTitle>
        <CardDescription>
          Minutes per km, one dot per run — lower is faster
          {latest ? ` · latest ${latest.paceLabel} /km` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No runs with distance in this period</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
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
                domain={['auto', 'auto']}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(pace: number) => fmtPace(pace)}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0].payload as PacePoint
                  return (
                    <div className="rounded-sm border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="font-medium">{fmtDate(point.date)}</p>
                      <p className="text-muted-foreground">
                        {point.paceLabel} /km · {fmtDistanceKm(point.distanceKm)}
                      </p>
                    </div>
                  )
                }}
              />
              <Scatter data={points} fill="hsl(var(--chart-2))" isAnimationActive={false} shape={paceDot} />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function paceDot(props: any) {
  const { cx, cy, fill } = props
  if (typeof cx !== 'number' || typeof cy !== 'number') return <g />
  return <circle cx={cx} cy={cy} r={2.5} fill={fill} />
}
