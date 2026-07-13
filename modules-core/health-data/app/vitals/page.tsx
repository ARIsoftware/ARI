'use client'

import { useMemo, useState } from 'react'
import { Wind, Percent, Thermometer, Weight } from 'lucide-react'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { StatCard } from '@/modules/health-data/components/stat-card'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { MetricChart } from '@/modules/health-data/components/metric-chart'
import { PageControls } from '@/modules/health-data/components/page-controls'
import { useChartStyle, type ChartStyle } from '@/modules/health-data/hooks/use-chart-style'
import { type DateRange } from '@/modules/health-data/components/range-select'
import { useHealthMetrics } from '@/modules/health-data/hooks/use-health-data'
import { fmtNumber } from '@/modules/health-data/lib/format'
import { averageOf, latestOf } from '@/modules/health-data/lib/stats'
import { indexSeries, metricPoints } from '@/modules/health-data/lib/series'

const METRIC_TYPES = [
  'respiratory_rate',
  'oxygen_saturation',
  'apple_sleeping_wrist_temperature',
  'apple_sleeping_breathing_disturbances',
  'body_mass',
  'environmental_audio_exposure',
  'headphone_audio_exposure',
]

export default function HealthDataVitalsPage() {
  const [range, setRange] = useState<DateRange>(90)
  const [chartStyle, setChartStyle] = useChartStyle()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Vitals"
        actions={<PageControls range={range} onRangeChange={setRange} chartStyle={chartStyle} onChartStyleChange={setChartStyle} />}
      />
      <HealthGate>
        <VitalsContent range={range} chartStyle={chartStyle} />
      </HealthGate>
    </div>
  )
}

function VitalsContent({ range, chartStyle }: { range: DateRange; chartStyle: ChartStyle }) {
  const { data: series, isLoading } = useHealthMetrics(METRIC_TYPES)
  const bySeries = useMemo(() => indexSeries(series), [series])

  if (isLoading) {
    return <LoadingState />
  }

  const respiratory = metricPoints(bySeries, 'respiratory_rate', range)
  const spo2 = metricPoints(bySeries, 'oxygen_saturation', range)
  const wristTemp = metricPoints(bySeries, 'apple_sleeping_wrist_temperature', range)
  const breathing = metricPoints(bySeries, 'apple_sleeping_breathing_disturbances', range)
  const weight = metricPoints(bySeries, 'body_mass', range)
  const envAudio = metricPoints(bySeries, 'environmental_audio_exposure', range)
  const headphoneAudio = metricPoints(bySeries, 'headphone_audio_exposure', range)

  const avgRespiratory = averageOf(respiratory.data)
  const avgSpo2 = averageOf(spo2.data)
  const latestTemp = latestOf(wristTemp.data)
  const latestWeight = latestOf(weight.data)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Wind}
            label="Avg respiratory rate"
            value={avgRespiratory !== null ? `${fmtNumber(avgRespiratory, 1)} /min` : '—'}
            sub="Measured during sleep"
          />
          <StatCard
            icon={Percent}
            label="Avg blood oxygen"
            value={avgSpo2 !== null ? `${fmtNumber(avgSpo2, 1)}%` : '—'}
          />
          <StatCard
            icon={Thermometer}
            label="Wrist temperature"
            value={latestTemp !== null ? `${fmtNumber(latestTemp, 2)} ${wristTemp.unit ?? ''}` : '—'}
            sub="Most recent night"
          />
          <StatCard
            icon={Weight}
            label="Weight"
            value={latestWeight !== null ? `${fmtNumber(latestWeight, 1)} ${weight.unit ?? ''}` : '—'}
            sub="Most recent entry"
          />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricChart chartStyle={chartStyle}
          title="Respiratory Rate"
          description="Breaths per minute during sleep"
          data={respiratory.data}
          colorIndex={2}
          unit="/min"
          decimals={1}
        />
        <MetricChart chartStyle={chartStyle} title="Blood Oxygen" data={spo2.data} colorIndex={3} unit="%" decimals={1} />
        <MetricChart chartStyle={chartStyle}
          title="Sleeping Wrist Temperature"
          data={wristTemp.data}
          colorIndex={4}
          unit={wristTemp.unit}
          decimals={2}
        />
        <MetricChart chartStyle={chartStyle}
          title="Breathing Disturbances"
          data={breathing.data}
          colorIndex={5}
          unit={breathing.unit}
          decimals={1}
        />
        <MetricChart chartStyle={chartStyle} title="Body Weight" data={weight.data} colorIndex={2} unit={weight.unit} decimals={1} />
        <MetricChart chartStyle={chartStyle}
          title="Environmental Sound Levels"
          data={envAudio.data}
          colorIndex={3}
          unit={envAudio.unit}
        />
        <MetricChart chartStyle={chartStyle}
          title="Headphone Audio Levels"
          data={headphoneAudio.data}
          colorIndex={4}
          unit={headphoneAudio.unit}
        />
      </div>
    </div>
  )
}
