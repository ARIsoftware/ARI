'use client'

import { useMemo, useState } from 'react'
import { Dumbbell, Route, Timer, Flame } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { StatCard } from '@/modules/health-data/components/stat-card'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { filterByRange, type DateRange } from '@/modules/health-data/components/range-select'
import { PageControls } from '@/modules/health-data/components/page-controls'
import { useHealthWorkouts, useHealthRoutes } from '@/modules/health-data/hooks/use-health-data'
import { fmtDateTime, fmtDistanceKm, fmtDuration, fmtNumber } from '@/modules/health-data/lib/format'
import { weekStart } from '@/modules/health-data/lib/stats'
import { StackedBarChart, type StackedSeries } from '@/modules/health-data/components/stacked-bar-chart'
import { PaceChart, fmtPace } from '@/modules/health-data/components/pace-chart'
import { Route as RouteIcon } from 'lucide-react'

export default function HealthDataWorkoutsPage() {
  const [range, setRange] = useState<DateRange>('all')

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Workouts" actions={<PageControls range={range} onRangeChange={setRange} />} />
      <HealthGate>
        <WorkoutsContent range={range} />
      </HealthGate>
    </div>
  )
}

function WorkoutsContent({ range }: { range: DateRange }) {
  const { data: workouts, isLoading } = useHealthWorkouts()
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const inRange = useMemo(
    () =>
      filterByRange(
        (workouts ?? []).map((w) => ({ ...w, date: w.start_time.slice(0, 10) })),
        range
      ),
    [workouts, range]
  )

  const types = useMemo(() => {
    const counts = new Map<string, number>()
    for (const workout of inRange) {
      counts.set(workout.activity_type, (counts.get(workout.activity_type) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [inRange])

  // Fall back to All when the selected type has no workouts in this range
  const effectiveFilter = types.some(([type]) => type === typeFilter) ? typeFilter : 'all'

  const filtered = useMemo(
    () => inRange.filter((w) => effectiveFilter === 'all' || w.activity_type === effectiveFilter),
    [inRange, effectiveFilter]
  )

  const totals = useMemo(() => {
    let distance = 0
    let duration = 0
    let energy = 0
    for (const workout of filtered) {
      distance += workout.distance_km ?? 0
      duration += workout.duration_min ?? 0
      energy += workout.energy_kcal ?? 0
    }
    return { distance, duration, energy }
  }, [filtered])

  const volume = useMemo(() => {
    const topTypes = types.slice(0, 3).map(([type]) => type)
    const rows = new Map<string, Record<string, number>>()
    let hasOther = false
    for (const workout of filtered) {
      const week = weekStart(workout.date)
      const key = topTypes.includes(workout.activity_type) ? workout.activity_type : 'other'
      if (key === 'other') hasOther = true
      const row = rows.get(week) ?? {}
      row[key] = (row[key] ?? 0) + (workout.duration_min ?? 0)
      rows.set(week, row)
    }
    const data = [...rows.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, row]) => ({ date: week, ...row }))
    const series: StackedSeries[] = topTypes.map((type, i) => ({
      key: type,
      label: formatActivityType(type),
      colorIndex: ((i % 3) + 2) as StackedSeries['colorIndex'],
    }))
    if (hasOther) series.push({ key: 'other', label: 'Other', colorIndex: 5 })
    return { data, series }
  }, [filtered, types])

  const { data: routes } = useHealthRoutes()
  const workoutsWithRoute = useMemo(() => {
    const routeStarts = (routes ?? [])
      .map((route) => (route.started_at ? Date.parse(route.started_at) : NaN))
      .filter((ms) => Number.isFinite(ms))
    const tolerance = 20 * 60 * 1000
    const ids = new Set<string>()
    for (const workout of filtered) {
      const start = Date.parse(workout.start_time)
      if (routeStarts.some((ms) => Math.abs(ms - start) < tolerance)) ids.add(workout.id)
    }
    return ids
  }, [routes, filtered])

  if (isLoading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Dumbbell} label="Workouts" value={fmtNumber(filtered.length)} />
          <StatCard icon={Route} label="Total distance" value={fmtDistanceKm(totals.distance)} />
          <StatCard icon={Timer} label="Total time" value={fmtDuration(totals.duration)} />
          <StatCard icon={Flame} label="Total energy" value={`${fmtNumber(totals.energy)} kcal`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TypePill
          label={`All · ${inRange.length}`}
          active={effectiveFilter === 'all'}
          onClick={() => setTypeFilter('all')}
        />
        {types.map(([type, typeCount]) => (
          <TypePill
            key={type}
            label={`${formatActivityType(type)} · ${typeCount}`}
            active={effectiveFilter === type}
            onClick={() => setTypeFilter(type)}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StackedBarChart
          title="Training Volume"
          description="Weekly workout minutes by type"
          data={volume.data}
          series={volume.series}
          valueFormatter={(v) => fmtDuration(v)}
          yTickFormatter={(v) => fmtNumber(v)}
        />
        <PaceChart workouts={filtered} />
      </div>

      <Card className="rounded-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Distance</TableHead>
                <TableHead className="text-right">Pace</TableHead>
                <TableHead className="text-right">Energy</TableHead>
                <TableHead className="text-right">Avg HR</TableHead>
                <TableHead className="text-right">Max HR</TableHead>
                <TableHead className="text-right">Elevation</TableHead>
                <TableHead className="text-center">Route</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    No workouts found in this period.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((workout) => (
                <TableRow key={workout.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateTime(workout.start_time)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="rounded-sm font-normal">
                      {formatActivityType(workout.activity_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtDuration(workout.duration_min)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {workout.distance_km !== null ? fmtDistanceKm(workout.distance_km) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{paceFor(workout)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {workout.energy_kcal !== null ? `${fmtNumber(workout.energy_kcal)} kcal` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {workout.avg_heart_rate !== null ? fmtNumber(workout.avg_heart_rate) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {workout.max_heart_rate !== null ? fmtNumber(workout.max_heart_rate) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {workout.elevation_gain_m !== null ? `${fmtNumber(workout.elevation_gain_m)} m` : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {workoutsWithRoute.has(workout.id) ? (
                      <RouteIcon className="mx-auto h-3.5 w-3.5 text-muted-foreground" aria-label="GPS route recorded" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function TypePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      className="h-8 rounded-sm px-4 tabular-nums"
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

const TYPE_ABBREVIATIONS: Record<string, string> = {
  HighIntensityIntervalTraining: 'HIIT',
  TraditionalStrengthTraining: 'Strength',
  FunctionalStrengthTraining: 'Functional Strength',
}

function paceFor(workout: { activity_type: string; distance_km: number | null; duration_min: number | null }): string {
  if (workout.activity_type !== 'Running') return '—'
  if (!workout.distance_km || workout.distance_km < 0.3 || !workout.duration_min) return '—'
  return `${fmtPace(workout.duration_min / workout.distance_km)}/km`
}

/** "HighIntensityIntervalTraining" → "HIIT"; otherwise split camel case */
function formatActivityType(type: string): string {
  return TYPE_ABBREVIATIONS[type] ?? type.replace(/([a-z])([A-Z])/g, '$1 $2')
}
