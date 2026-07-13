'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { fmtDate, fmtDateShort } from '@/modules/health-data/lib/format'

export interface StackedSeries {
  key: string
  label: string
  colorIndex: 1 | 2 | 3 | 4 | 5
}

interface StackedBarChartProps {
  title: string
  description?: string
  /** Rows keyed by series key; callers pre-bucket (e.g. weekly) as needed */
  data: Array<{ date: string } & Record<string, unknown>>
  series: StackedSeries[]
  valueFormatter: (value: number) => string
  yTickFormatter?: (value: number) => string
}

/** Generic stacked bar chart (training volume, distance by mode, …). */
export function StackedBarChart({
  title,
  description,
  data,
  series,
  valueFormatter,
  yTickFormatter,
}: StackedBarChartProps) {
  const config = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: `hsl(var(--chart-${s.colorIndex}))` }])
  ) as ChartConfig

  return (
    <Card className="rounded-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data in this period</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
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
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={yTickFormatter} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as { date: string } & Record<string, unknown>
                  return (
                    <div className="rounded-sm border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="mb-1 font-medium">Week of {fmtDate(row.date)}</p>
                      {series.map((s) => {
                        const value = row[s.key]
                        if (typeof value !== 'number' || value === 0) return null
                        return (
                          <p key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
                            <span
                              className="inline-block h-2 w-2 rounded-sm"
                              style={{ backgroundColor: `hsl(var(--chart-${s.colorIndex}))` }}
                            />
                            {s.label}: {valueFormatter(value)}
                          </p>
                        )
                      })}
                    </div>
                  )
                }}
              />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="stack"
                  fill={`hsl(var(--chart-${s.colorIndex}))`}
                  maxBarSize={16}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: `hsl(var(--chart-${s.colorIndex}))` }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
