'use client'

import { useMemo, useState } from 'react'
import { Map, Route, Ruler, Timer } from 'lucide-react'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { StatCard } from '@/modules/health-data/components/stat-card'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { RouteCard } from '@/modules/health-data/components/route-card'
import { filterByRange, type DateRange } from '@/modules/health-data/components/range-select'
import { PageControls } from '@/modules/health-data/components/page-controls'
import { useHealthRoutes } from '@/modules/health-data/hooks/use-health-data'
import { fmtDistanceKm, fmtDuration, fmtNumber } from '@/modules/health-data/lib/format'

export default function HealthDataRoutesPage() {
  const [range, setRange] = useState<DateRange>('all')

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Routes" actions={<PageControls range={range} onRangeChange={setRange} />} />
      <HealthGate>
        <RoutesContent range={range} />
      </HealthGate>
    </div>
  )
}

function RoutesContent({ range }: { range: DateRange }) {
  const { data: routes, isLoading } = useHealthRoutes()

  const inRange = useMemo(
    () =>
      filterByRange(
        (routes ?? []).map((r) => ({ ...r, date: r.route_date })),
        range
      ),
    [routes, range]
  )

  const totals = useMemo(() => {
    let distance = 0
    let duration = 0
    for (const route of inRange) {
      distance += route.distance_km ?? 0
      duration += route.duration_min ?? 0
    }
    return { distance, duration }
  }, [inRange])

  if (isLoading) {
    return <LoadingState />
  }

  if (!routes || routes.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No GPS routes in this export. Routes are recorded when you track an outdoor workout with
        your Apple Watch.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
          <StatCard icon={Route} label="Routes" value={fmtNumber(inRange.length)} />
          <StatCard icon={Ruler} label="Total distance" value={fmtDistanceKm(totals.distance)} />
          <StatCard icon={Timer} label="Total time" value={fmtDuration(totals.duration)} />
      </div>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Map className="h-4 w-4" />
        GPS traces drawn to shape, not to a map — each cell is one workout&apos;s path.{' '}
        <span className="text-emerald-500">●</span> marks the start,{' '}
        <span className="text-sky-500">●</span> the finish. Click any route to enlarge.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {inRange.map((route) => (
          <RouteCard key={route.id} route={route} />
        ))}
      </div>
    </div>
  )
}
