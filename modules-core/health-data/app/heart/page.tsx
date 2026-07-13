'use client'

import { useMemo, useState } from 'react'
import { HeartPulse, Activity, Gauge, Footprints } from 'lucide-react'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { StatCard } from '@/modules/health-data/components/stat-card'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { MetricChart } from '@/modules/health-data/components/metric-chart'
import { HeartRangeChart, type HeartRangePoint } from '@/modules/health-data/components/heart-range-chart'
import { PageControls } from '@/modules/health-data/components/page-controls'
import { useChartStyle, type ChartStyle } from '@/modules/health-data/hooks/use-chart-style'
import { filterByRange, type DateRange } from '@/modules/health-data/components/range-select'
import { useHealthMetrics } from '@/modules/health-data/hooks/use-health-data'
import { fmtNumber } from '@/modules/health-data/lib/format'
import { averageOf, latestOf } from '@/modules/health-data/lib/stats'
import { indexSeries, metricPoints } from '@/modules/health-data/lib/series'

const METRIC_TYPES = [
  'heart_rate',
  'resting_heart_rate',
  'walking_heart_rate_average',
  'heart_rate_variability_sdnn',
  'heart_rate_recovery_one_minute',
  'vo2_max',
]

export default function HealthDataHeartPage() {
  const [range, setRange] = useState<DateRange>(90)
  const [chartStyle, setChartStyle] = useChartStyle()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Heart"
        actions={<PageControls range={range} onRangeChange={setRange} chartStyle={chartStyle} onChartStyleChange={setChartStyle} />}
      />
      <HealthGate>
        <HeartContent range={range} chartStyle={chartStyle} />
      </HealthGate>
    </div>
  )
}

function HeartContent({ range, chartStyle }: { range: DateRange; chartStyle: ChartStyle }) {
  const { data: series, isLoading } = useHealthMetrics(METRIC_TYPES)

  const bySeries = useMemo(() => indexSeries(series), [series])

  const heartRange: HeartRangePoint[] = useMemo(() => {
    const hr = bySeries.get('heart_rate')
    if (!hr) return []
    const mapped = hr.data.map((d) => ({
      date: d.metric_date,
      range:
        d.value_min !== null && d.value_max !== null
          ? ([d.value_min, d.value_max] as [number, number])
          : null,
      avg: d.value_avg,
    }))
    return filterByRange(mapped, range)
  }, [bySeries, range])

  if (isLoading) {
    return <LoadingState />
  }

  const resting = metricPoints(bySeries, 'resting_heart_rate', range)
  const walking = metricPoints(bySeries, 'walking_heart_rate_average', range)
  const hrv = metricPoints(bySeries, 'heart_rate_variability_sdnn', range)
  const recovery = metricPoints(bySeries, 'heart_rate_recovery_one_minute', range)
  const vo2 = metricPoints(bySeries, 'vo2_max', range)

  const latestResting = latestOf(resting.data)
  const latestVo2 = latestOf(vo2.data)
  const avgHrv = averageOf(hrv.data)
  const avgWalking = averageOf(walking.data)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={HeartPulse}
            label="Resting heart rate"
            value={latestResting !== null ? `${fmtNumber(latestResting)} BPM` : '—'}
            sub="Most recent day"
          />
          <StatCard
            icon={Activity}
            label="Avg HRV (SDNN)"
            value={avgHrv !== null ? `${fmtNumber(avgHrv)} ms` : '—'}
          />
          <StatCard
            icon={Gauge}
            label="VO2 Max"
            value={latestVo2 !== null ? fmtNumber(latestVo2, 1) : '—'}
            sub={vo2.unit ?? undefined}
          />
          <StatCard
            icon={Footprints}
            label="Avg walking HR"
            value={avgWalking !== null ? `${fmtNumber(avgWalking)} BPM` : '—'}
          />
      </div>

      <HeartRangeChart data={heartRange} chartStyle={chartStyle} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricChart chartStyle={chartStyle} title="Resting Heart Rate" data={resting.data} colorIndex={2} unit="BPM" />
        <MetricChart chartStyle={chartStyle} title="Heart Rate Variability (SDNN)" data={hrv.data} colorIndex={3} unit="ms" />
        <MetricChart chartStyle={chartStyle} title="VO2 Max" data={vo2.data} colorIndex={4} unit={vo2.unit} decimals={1} />
        <MetricChart chartStyle={chartStyle}
          title="Cardio Recovery"
          description="Heart rate drop one minute after a workout"
          data={recovery.data}
          colorIndex={5}
          unit="BPM"
        />
        <MetricChart chartStyle={chartStyle} title="Walking Heart Rate" data={walking.data} colorIndex={2} unit="BPM" />
      </div>
    </div>
  )
}
