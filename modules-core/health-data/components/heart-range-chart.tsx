'use client'

import { useMemo } from 'react'
import { Area, Bar, ComposedChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { fmtDate, fmtDateShort, fmtNumber } from '@/modules/health-data/lib/format'
import { bucketWeekly, strideSample, WEEKLY_BUCKET_THRESHOLD } from '@/modules/health-data/lib/stats'
import type { ChartStyle } from '@/modules/health-data/hooks/use-chart-style'

export interface HeartRangePoint {
  date: string
  range: [number, number] | null
  avg: number | null
}

const SPARK_MAX_POINTS = 1500

const config: ChartConfig = {
  range: { label: 'Range', color: 'hsl(var(--chart-2))' },
  avg: { label: 'Average', color: 'hsl(var(--chart-2))' },
}

/**
 * Apple-Health-style daily heart rate chart.
 * Bars: floating min–max bars with an average line (weekly buckets on
 * long ranges). Sparklines: a faint min–max band under a bold daily
 * average line, at full daily resolution.
 */
export function HeartRangeChart({
  data: dailyData,
  chartStyle = 'bars',
}: {
  data: HeartRangePoint[]
  chartStyle?: ChartStyle
}) {
  const spark = chartStyle === 'spark'
  const bucketed = !spark && dailyData.length > WEEKLY_BUCKET_THRESHOLD

  const data = useMemo(() => {
    if (spark) return strideSample(dailyData, SPARK_MAX_POINTS)
    if (!bucketed) return dailyData
    const flat = dailyData.map((point) => ({
      date: point.date,
      min: point.range?.[0] ?? null,
      max: point.range?.[1] ?? null,
      avg: point.avg,
    }))
    return bucketWeekly(flat, ['min', 'max', 'avg'], { min: 'min', max: 'max' }).map((week) => ({
      date: week.date,
      range:
        week.min !== null && week.max !== null
          ? ([week.min, week.max] as [number, number])
          : null,
      avg: week.avg,
    }))
  }, [dailyData, spark, bucketed])

  let description = 'Daily range (min–max) and average, BPM'
  if (spark) description = 'Daily average with min–max band, BPM'
  else if (bucketed) description = 'Weekly range (min–max) and average, BPM'

  return (
    <Card className="rounded-sm">
      <CardHeader>
        <CardTitle className="text-base">Heart Rate</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data in this period</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
            <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={48}
                tickFormatter={fmtDateShort}
              />
              <YAxis tickLine={false} axisLine={false} width={36} domain={['dataMin - 5', 'dataMax + 5']} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0].payload as HeartRangePoint
                  return (
                    <div className="rounded-sm border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="mb-1 font-medium">{fmtDate(point.date)}</p>
                      {point.range && (
                        <p className="text-muted-foreground">
                          Range: {fmtNumber(point.range[0])}–{fmtNumber(point.range[1])} BPM
                        </p>
                      )}
                      {point.avg !== null && (
                        <p className="text-muted-foreground">Average: {fmtNumber(point.avg)} BPM</p>
                      )}
                    </div>
                  )
                }}
              />
              {spark ? (
                <Area
                  dataKey="range"
                  stroke="none"
                  fill="hsl(var(--chart-2))"
                  fillOpacity={0.18}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : (
                <Bar dataKey="range" fill="hsl(var(--chart-2))" opacity={0.35} radius={2} maxBarSize={8} />
              )}
              <Line
                dataKey="avg"
                type="monotone"
                stroke="hsl(var(--chart-2))"
                strokeWidth={spark ? 1.5 : 2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
