'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { fmtDate, fmtDateShort, fmtNumber } from '@/modules/health-data/lib/format'
import { bucketWeekly, rollingMean, strideSample, WEEKLY_BUCKET_THRESHOLD } from '@/modules/health-data/lib/stats'
import type { ChartStyle } from '@/modules/health-data/hooks/use-chart-style'

export interface MetricPoint {
  date: string
  value: number | null
}

/** Sparklines draw full daily resolution, thinned to this many points */
const SPARK_MAX_POINTS = 1500
const SPARK_AVG_WINDOW = 7

interface MetricChartProps {
  title: string
  description?: string
  data: MetricPoint[]
  /** Index into the theme chart palette (1–5) */
  colorIndex?: 1 | 2 | 3 | 4 | 5
  unit?: string | null
  decimals?: number
  /** 'bars' (default) renders bar charts with weekly bucketing on long
   * ranges; 'spark' renders a faint daily line + bold 7-day average. */
  chartStyle?: ChartStyle
}

/**
 * Reusable daily-series chart card. Colors come from the theme's
 * --chart-N variables so every ARI theme renders correctly.
 */
export function MetricChart({
  title,
  description,
  data: dailyData,
  colorIndex = 1,
  unit,
  decimals = 0,
  chartStyle = 'bars',
}: MetricChartProps) {
  const color = `hsl(var(--chart-${colorIndex}))`
  const spark = chartStyle === 'spark'

  // Bars: long ranges bucket into weekly averages so recharts isn't asked
  // to draw thousands of bars. Sparklines: keep daily resolution, add a
  // rolling average, and thin the line to a sane point count.
  const bucketed = !spark && dailyData.length > WEEKLY_BUCKET_THRESHOLD
  const data = useMemo(() => {
    if (spark) {
      const avg = rollingMean(dailyData, SPARK_AVG_WINDOW)
      const merged = dailyData.map((point, i) => ({ ...point, avg: avg[i].value }))
      return strideSample(merged, SPARK_MAX_POINTS)
    }
    return bucketed ? bucketWeekly(dailyData, ['value']) : dailyData
  }, [dailyData, spark, bucketed])

  let effectiveDescription = description
  if (spark && dailyData.length > 0) {
    effectiveDescription = `${description ? `${description} · ` : ''}Daily values with 7-day average`
  } else if (bucketed) {
    effectiveDescription = `${description ? `${description} · ` : ''}Weekly averages`
  }

  const formatValue = (value: number) =>
    `${fmtNumber(value, decimals)}${unit ? ` ${unit}` : ''}`

  if (data.length === 0) {
    return (
      <Card className="rounded-sm">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">No data in this period</p>
        </CardContent>
      </Card>
    )
  }

  const config: ChartConfig = { value: { label: title, color } }
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_label, payload) => fmtDate(payload?.[0]?.payload?.date)}
          formatter={(value, name) => (
            <div className="flex w-full items-center justify-between gap-4">
              <span className="text-muted-foreground">{name === 'avg' ? '7-day avg' : title}</span>
              <span className="font-medium tabular-nums">{formatValue(Number(value))}</span>
            </div>
          )}
        />
      }
    />
  )
  const xAxis = (
    <XAxis
      dataKey="date"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={48}
      tickFormatter={fmtDateShort}
    />
  )
  const yAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      width={44}
      domain={spark ? ['auto', 'auto'] : undefined}
      tickFormatter={(value: number) => fmtNumber(value, 0)}
    />
  )

  return (
    <Card className="rounded-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {effectiveDescription && <CardDescription>{effectiveDescription}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
          {spark ? (
            <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              {xAxis}
              {yAxis}
              {tooltip}
              <Line
                dataKey="value"
                type="linear"
                stroke={color}
                strokeOpacity={0.3}
                strokeWidth={1}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                dataKey="avg"
                type="monotone"
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              {xAxis}
              {yAxis}
              {tooltip}
              <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} maxBarSize={24} />
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
