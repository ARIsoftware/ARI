'use client'

import { useMemo, useState } from 'react'
import { Footprints, Flame, Timer, Target, CalendarRange, Dumbbell, Moon, HeartPulse, Gauge } from 'lucide-react'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { StatCard } from '@/modules/health-data/components/stat-card'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { MetricChart, type MetricPoint } from '@/modules/health-data/components/metric-chart'
import { PageControls } from '@/modules/health-data/components/page-controls'
import { useChartStyle, type ChartStyle } from '@/modules/health-data/hooks/use-chart-style'
import { filterByRange, type DateRange } from '@/modules/health-data/components/range-select'
import { useHealthMetrics, useHealthActivity, useHealthSummary, useHealthSleep } from '@/modules/health-data/hooks/use-health-data'
import { fmtNumber, fmtDuration, fmtDate } from '@/modules/health-data/lib/format'
import { averageOf, totalOf, bucketWeekly, latestOf, avgNumbers } from '@/modules/health-data/lib/stats'
import { indexSeries, metricPoints } from '@/modules/health-data/lib/series'
import { StackedBarChart } from '@/modules/health-data/components/stacked-bar-chart'

const METRIC_TYPES = [
  'step_count',
  'distance_walking_running',
  'distance_cycling',
  'active_energy_burned',
  'apple_exercise_time',
  'flights_climbed',
  'time_in_daylight',
  'resting_heart_rate',
  'vo2_max',
]

export default function HealthDataOverviewPage() {
  const [range, setRange] = useState<DateRange>(90)
  const [chartStyle, setChartStyle] = useChartStyle()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Overview"
        actions={<PageControls range={range} onRangeChange={setRange} chartStyle={chartStyle} onChartStyleChange={setChartStyle} />}
      />
      <HealthGate>
        <ActivityContent range={range} chartStyle={chartStyle} />
      </HealthGate>
    </div>
  )
}

function ActivityContent({ range, chartStyle }: { range: DateRange; chartStyle: ChartStyle }) {
  const { data: series, isLoading: metricsLoading } = useHealthMetrics(METRIC_TYPES)
  const { data: activityDays, isLoading: activityLoading } = useHealthActivity()
  const { data: summary, isLoading: summaryLoading } = useHealthSummary()
  const { data: nights } = useHealthSleep()

  const bySeries = useMemo(() => indexSeries(series), [series])
  const points = useMemo(() => {
    const byType = new Map<string, { unit: string | null; data: MetricPoint[] }>()
    for (const type of METRIC_TYPES) {
      byType.set(type, metricPoints(bySeries, type, range))
    }
    return byType
  }, [bySeries, range])

  const ringStats = useMemo(() => {
    const days = filterByRange(
      (activityDays ?? []).map((d) => ({ ...d, date: d.day })),
      range
    ).filter((d) => (d.active_energy_goal ?? 0) > 0)
    if (days.length === 0) return null
    const moveHit = days.filter((d) => (d.active_energy ?? 0) >= (d.active_energy_goal ?? Infinity)).length
    const exerciseHit = days.filter((d) => (d.exercise_minutes ?? 0) >= (d.exercise_goal ?? Infinity)).length
    const standHit = days.filter((d) => (d.stand_hours ?? 0) >= (d.stand_goal ?? Infinity)).length
    return { days: days.length, moveHit, exerciseHit, standHit }
  }, [activityDays, range])

  const distanceWeekly = useMemo(() => {
    const foot = points.get('distance_walking_running')?.data ?? []
    const cycling = points.get('distance_cycling')?.data ?? []
    const byDate = new Map<string, { date: string; foot: number | null; cycling: number | null }>()
    for (const point of foot) byDate.set(point.date, { date: point.date, foot: point.value, cycling: null })
    for (const point of cycling) {
      const row = byDate.get(point.date)
      if (row) row.cycling = point.value
      else byDate.set(point.date, { date: point.date, foot: null, cycling: point.value })
    }
    const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    return bucketWeekly(rows, ['foot', 'cycling'], { foot: 'sum', cycling: 'sum' })
  }, [points])

  const monthlyGoal = useMemo(() => {
    const days = filterByRange(
      (activityDays ?? []).map((d) => ({ ...d, date: d.day })),
      range
    ).filter((d) => (d.active_energy_goal ?? 0) > 0)
    const byMonth = new Map<string, { met: number; total: number }>()
    for (const d of days) {
      const month = `${d.day.slice(0, 7)}-01`
      const bucket = byMonth.get(month) ?? { met: 0, total: 0 }
      bucket.total++
      if ((d.active_energy ?? 0) >= (d.active_energy_goal ?? Infinity)) bucket.met++
      byMonth.set(month, bucket)
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, bucket]) => ({ date: month, value: (bucket.met / bucket.total) * 100 }))
  }, [activityDays, range])

  if (metricsLoading || activityLoading || summaryLoading) {
    return <LoadingState />
  }

  const catalogSteps = summary?.catalog.find((entry) => entry.metric_type === 'step_count')
  const stepsPerDay =
    catalogSteps && catalogSteps.total !== null && catalogSteps.days > 0
      ? catalogSteps.total / catalogSteps.days
      : null
  const daysCovered = daysBetween(summary?.totals.first_date ?? null, summary?.totals.last_date ?? null)
  const resting90 = averageOf(filterByRange(metricPoints(bySeries, 'resting_heart_rate', 'all').data, 90))
  const latestVo2 = latestOf(metricPoints(bySeries, 'vo2_max', 'all').data)
  const sleep90 = avgNumbers(
    (nights ?? [])
      .slice(-90)
      .map((n) => n.asleep_min)
      .filter((v): v is number => v !== null)
  )

  const steps = points.get('step_count')
  const distance = points.get('distance_walking_running')
  const energy = points.get('active_energy_burned')
  const exercise = points.get('apple_exercise_time')
  const flights = points.get('flights_climbed')
  const daylight = points.get('time_in_daylight')

  const avgSteps = averageOf(steps?.data)
  const totalDistance = totalOf(distance?.data)
  const avgEnergy = averageOf(energy?.data)
  const avgExercise = averageOf(exercise?.data)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={CalendarRange}
          label="Data span"
          value={daysCovered !== null ? `${(daysCovered / 365.25).toFixed(1)} yr` : '—'}
          sub={`${fmtDate(summary?.totals.first_date ?? null)} – ${fmtDate(summary?.totals.last_date ?? null)}`}
        />
        <StatCard icon={Dumbbell} label="Workouts" value={fmtNumber(summary?.totals.workouts ?? null)} />
        <StatCard icon={Footprints} label="Steps / day" value={fmtNumber(stepsPerDay)} sub="Average, all time" />
        <StatCard
          icon={HeartPulse}
          label="Resting HR"
          value={resting90 !== null ? `${fmtNumber(resting90)} bpm` : '—'}
          sub="Average, last 90 days"
        />
        <StatCard
          icon={Gauge}
          label="VO2 Max"
          value={latestVo2 !== null ? fmtNumber(latestVo2, 1) : '—'}
          sub="Latest estimate"
        />
        <StatCard
          icon={Moon}
          label="Sleep"
          value={sleep90 !== null ? fmtDuration(sleep90) : '—'}
          sub="Avg asleep, last 90 nights"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Footprints} label="Avg steps / day" value={fmtNumber(avgSteps)} />
          <StatCard
            icon={Footprints}
            label="Total distance"
            value={totalDistance !== null ? `${fmtNumber(totalDistance, 0)} ${distance?.unit ?? ''}` : '—'}
          />
          <StatCard
            icon={Flame}
            label="Avg active energy"
            value={avgEnergy !== null ? `${fmtNumber(avgEnergy)} ${energy?.unit ?? ''}` : '—'}
          />
          <StatCard icon={Timer} label="Avg exercise" value={avgExercise !== null ? fmtDuration(avgExercise) : '—'} />
      </div>

      {ringStats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={Target}
            label="Move goal hit"
            value={`${Math.round((ringStats.moveHit / ringStats.days) * 100)}%`}
            sub={`${ringStats.moveHit} of ${ringStats.days} days`}
          />
          <StatCard
            icon={Target}
            label="Exercise goal hit"
            value={`${Math.round((ringStats.exerciseHit / ringStats.days) * 100)}%`}
            sub={`${ringStats.exerciseHit} of ${ringStats.days} days`}
          />
          <StatCard
            icon={Target}
            label="Stand goal hit"
            value={`${Math.round((ringStats.standHit / ringStats.days) * 100)}%`}
            sub={`${ringStats.standHit} of ${ringStats.days} days`}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricChart chartStyle={chartStyle} title="Steps" data={steps?.data ?? []} colorIndex={2} unit={null} />
        <MetricChart chartStyle={chartStyle}
          title="Walking + Running Distance"
          data={distance?.data ?? []}
          colorIndex={3}
          unit={distance?.unit}
          decimals={1}
        />
        <MetricChart chartStyle={chartStyle} title="Active Energy" data={energy?.data ?? []} colorIndex={4} unit={energy?.unit} />
        <MetricChart chartStyle={chartStyle} title="Exercise Minutes" data={exercise?.data ?? []} colorIndex={5} unit="min" />
        <MetricChart chartStyle={chartStyle} title="Flights Climbed" data={flights?.data ?? []} colorIndex={2} unit={null} />
        <MetricChart chartStyle={chartStyle} title="Time in Daylight" data={daylight?.data ?? []} colorIndex={3} unit="min" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StackedBarChart
          title="Distance"
          description="Weekly totals — on foot vs. cycling"
          data={distanceWeekly}
          series={[
            { key: 'foot', label: 'Walking + Running', colorIndex: 2 },
            { key: 'cycling', label: 'Cycling', colorIndex: 4 },
          ]}
          valueFormatter={(v) => `${fmtNumber(v, 1)} ${distance?.unit ?? ''}`}
        />
        <MetricChart
          chartStyle="bars"
          title="Move Goal Hit Rate"
          description="Share of days each month hitting the move goal"
          data={monthlyGoal}
          colorIndex={3}
          unit="%"
        />
      </div>
    </div>
  )
}

function daysBetween(first: string | null, last: string | null): number | null {
  if (!first || !last) return null
  const ms = new Date(`${last}T00:00:00`).getTime() - new Date(`${first}T00:00:00`).getTime()
  return Math.round(ms / 86_400_000) + 1
}
