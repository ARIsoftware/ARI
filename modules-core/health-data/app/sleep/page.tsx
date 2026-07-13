'use client'

import { useMemo, useState } from 'react'
import { Moon, BedDouble, Waves, Percent } from 'lucide-react'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { StatCard } from '@/modules/health-data/components/stat-card'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { SleepChart, type SleepStagePoint } from '@/modules/health-data/components/sleep-chart'
import { BedtimeChart } from '@/modules/health-data/components/bedtime-chart'
import { MetricChart } from '@/modules/health-data/components/metric-chart'
import { PageControls } from '@/modules/health-data/components/page-controls'
import { useChartStyle, type ChartStyle } from '@/modules/health-data/hooks/use-chart-style'
import { filterByRange, type DateRange } from '@/modules/health-data/components/range-select'
import { useHealthSleep } from '@/modules/health-data/hooks/use-health-data'
import { fmtDuration, fmtNumber } from '@/modules/health-data/lib/format'
import { avgNumbers } from '@/modules/health-data/lib/stats'

export default function HealthDataSleepPage() {
  const [range, setRange] = useState<DateRange>(90)
  const [chartStyle, setChartStyle] = useChartStyle()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Sleep"
        actions={<PageControls range={range} onRangeChange={setRange} chartStyle={chartStyle} onChartStyleChange={setChartStyle} />}
      />
      <HealthGate>
        <SleepContent range={range} chartStyle={chartStyle} />
      </HealthGate>
    </div>
  )
}

function SleepContent({ range, chartStyle }: { range: DateRange; chartStyle: ChartStyle }) {
  const { data: nights, isLoading } = useHealthSleep()

  const inRange = useMemo(
    () =>
      filterByRange(
        (nights ?? []).map((n) => ({ ...n, date: n.night_date })),
        range
      ),
    [nights, range]
  )

  const stagePoints: SleepStagePoint[] = useMemo(
    () =>
      inRange.map((n) => ({
        date: n.night_date,
        deep: n.deep_min,
        core: n.core_min,
        rem: n.rem_min,
        awake: n.awake_min,
      })),
    [inRange]
  )

  const durationPoints = useMemo(
    () => inRange.map((n) => ({ date: n.night_date, value: n.asleep_min ?? n.in_bed_min })),
    [inRange]
  )

  const stats = useMemo(() => {
    const withSleep = inRange.filter((n) => n.asleep_min !== null)
    const avgAsleep = avgNumbers(withSleep.map((n) => n.asleep_min as number))
    const avgDeep = avgNumbers(inRange.filter((n) => n.deep_min !== null).map((n) => n.deep_min as number))
    const avgRem = avgNumbers(inRange.filter((n) => n.rem_min !== null).map((n) => n.rem_min as number))
    const efficiencies = inRange
      .filter((n) => n.asleep_min !== null && n.in_bed_min !== null && n.in_bed_min > 0)
      .map((n) => Math.min((n.asleep_min as number) / (n.in_bed_min as number), 1))
    return {
      avgAsleep,
      avgDeep,
      avgRem,
      avgEfficiency: avgNumbers(efficiencies),
      nights: inRange.length,
    }
  }, [inRange])

  if (isLoading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Moon}
            label="Avg time asleep"
            value={stats.avgAsleep !== null ? fmtDuration(stats.avgAsleep) : '—'}
            sub={`${fmtNumber(stats.nights)} nights`}
          />
          <StatCard icon={BedDouble} label="Avg deep sleep" value={stats.avgDeep !== null ? fmtDuration(stats.avgDeep) : '—'} />
          <StatCard icon={Waves} label="Avg REM sleep" value={stats.avgRem !== null ? fmtDuration(stats.avgRem) : '—'} />
          <StatCard
            icon={Percent}
            label="Sleep efficiency"
            value={stats.avgEfficiency !== null ? `${Math.round(stats.avgEfficiency * 100)}%` : '—'}
            sub="Asleep vs. in bed"
          />
      </div>

      <SleepChart data={stagePoints} />

      <BedtimeChart nights={inRange} />

      <MetricChart chartStyle={chartStyle}
        title="Time Asleep"
        description="Total sleep per night"
        data={durationPoints}
        colorIndex={3}
        unit="min"
      />
    </div>
  )
}
