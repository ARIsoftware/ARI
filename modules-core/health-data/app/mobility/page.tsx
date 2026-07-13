'use client'

import { useMemo, useState } from 'react'
import { PersonStanding, Footprints, ShieldCheck, Ruler } from 'lucide-react'
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
  'walking_speed',
  'walking_step_length',
  'walking_double_support_percentage',
  'walking_asymmetry_percentage',
  'apple_walking_steadiness',
  'stair_ascent_speed',
  'stair_descent_speed',
  'six_minute_walk_test_distance',
  'running_speed',
  'running_power',
  'running_stride_length',
  'running_ground_contact_time',
  'running_vertical_oscillation',
]

export default function HealthDataMobilityPage() {
  const [range, setRange] = useState<DateRange>(90)
  const [chartStyle, setChartStyle] = useChartStyle()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Mobility"
        actions={<PageControls range={range} onRangeChange={setRange} chartStyle={chartStyle} onChartStyleChange={setChartStyle} />}
      />
      <HealthGate>
        <MobilityContent range={range} chartStyle={chartStyle} />
      </HealthGate>
    </div>
  )
}

function MobilityContent({ range, chartStyle }: { range: DateRange; chartStyle: ChartStyle }) {
  const { data: series, isLoading } = useHealthMetrics(METRIC_TYPES)
  const bySeries = useMemo(() => indexSeries(series), [series])

  if (isLoading) {
    return <LoadingState />
  }

  const walkingSpeed = metricPoints(bySeries, 'walking_speed', range)
  const stepLength = metricPoints(bySeries, 'walking_step_length', range)
  const doubleSupport = metricPoints(bySeries, 'walking_double_support_percentage', range)
  const asymmetry = metricPoints(bySeries, 'walking_asymmetry_percentage', range)
  const steadiness = metricPoints(bySeries, 'apple_walking_steadiness', range)
  const stairAscent = metricPoints(bySeries, 'stair_ascent_speed', range)
  const stairDescent = metricPoints(bySeries, 'stair_descent_speed', range)
  const sixMinWalk = metricPoints(bySeries, 'six_minute_walk_test_distance', range)
  const runningSpeed = metricPoints(bySeries, 'running_speed', range)
  const runningPower = metricPoints(bySeries, 'running_power', range)
  const strideLength = metricPoints(bySeries, 'running_stride_length', range)
  const groundContact = metricPoints(bySeries, 'running_ground_contact_time', range)
  const verticalOsc = metricPoints(bySeries, 'running_vertical_oscillation', range)

  const avgSpeed = averageOf(walkingSpeed.data)
  const avgStepLength = averageOf(stepLength.data)
  const latestSteadiness = latestOf(steadiness.data)
  const latestSixMin = latestOf(sixMinWalk.data)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={PersonStanding}
            label="Avg walking speed"
            value={avgSpeed !== null ? `${fmtNumber(avgSpeed, 1)} ${walkingSpeed.unit ?? ''}` : '—'}
          />
          <StatCard
            icon={Footprints}
            label="Avg step length"
            value={avgStepLength !== null ? `${fmtNumber(avgStepLength, 0)} ${stepLength.unit ?? ''}` : '—'}
          />
          <StatCard
            icon={ShieldCheck}
            label="Walking steadiness"
            value={latestSteadiness !== null ? `${fmtNumber(latestSteadiness)}%` : '—'}
            sub="Most recent"
          />
          <StatCard
            icon={Ruler}
            label="Six-minute walk"
            value={latestSixMin !== null ? `${fmtNumber(latestSixMin)} ${sixMinWalk.unit ?? ''}` : '—'}
            sub="Most recent estimate"
          />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Walking</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricChart chartStyle={chartStyle} title="Walking Speed" data={walkingSpeed.data} colorIndex={2} unit={walkingSpeed.unit} decimals={2} />
          <MetricChart chartStyle={chartStyle} title="Step Length" data={stepLength.data} colorIndex={3} unit={stepLength.unit} decimals={1} />
          <MetricChart chartStyle={chartStyle}
            title="Double Support"
            description="Time with both feet on the ground — lower is typically better"
            data={doubleSupport.data}
            colorIndex={4}
            unit="%"
            decimals={1}
          />
          <MetricChart chartStyle={chartStyle} title="Walking Asymmetry" data={asymmetry.data} colorIndex={5} unit="%" decimals={1} />
          <MetricChart chartStyle={chartStyle} title="Walking Steadiness" data={steadiness.data} colorIndex={2} unit="%" />
          <MetricChart chartStyle={chartStyle} title="Six-Minute Walk Distance" data={sixMinWalk.data} colorIndex={3} unit={sixMinWalk.unit} />
          <MetricChart chartStyle={chartStyle} title="Stair Ascent Speed" data={stairAscent.data} colorIndex={4} unit={stairAscent.unit} decimals={2} />
          <MetricChart chartStyle={chartStyle} title="Stair Descent Speed" data={stairDescent.data} colorIndex={5} unit={stairDescent.unit} decimals={2} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Running</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricChart chartStyle={chartStyle} title="Running Speed" data={runningSpeed.data} colorIndex={2} unit={runningSpeed.unit} decimals={2} />
          <MetricChart chartStyle={chartStyle} title="Running Power" data={runningPower.data} colorIndex={3} unit={runningPower.unit} />
          <MetricChart chartStyle={chartStyle} title="Stride Length" data={strideLength.data} colorIndex={4} unit={strideLength.unit} decimals={2} />
          <MetricChart chartStyle={chartStyle} title="Ground Contact Time" data={groundContact.data} colorIndex={5} unit={groundContact.unit} />
          <MetricChart chartStyle={chartStyle} title="Vertical Oscillation" data={verticalOsc.data} colorIndex={2} unit={verticalOsc.unit} decimals={1} />
        </div>
      </section>
    </div>
  )
}
