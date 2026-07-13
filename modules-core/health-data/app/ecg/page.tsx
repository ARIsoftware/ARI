'use client'

import { useMemo } from 'react'
import { Activity, CalendarClock, Tags } from 'lucide-react'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { StatCard } from '@/modules/health-data/components/stat-card'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { EcgCard } from '@/modules/health-data/components/ecg-card'
import { useHealthEcgs } from '@/modules/health-data/hooks/use-health-data'
import { fmtDate, fmtNumber } from '@/modules/health-data/lib/format'

export default function HealthDataEcgPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader title="ECG" />
      <HealthGate>
        <EcgContent />
      </HealthGate>
    </div>
  )
}

function EcgContent() {
  const { data: ecgs, isLoading } = useHealthEcgs()

  const topClassification = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ecg of ecgs ?? []) {
      if (ecg.classification) {
        counts.set(ecg.classification, (counts.get(ecg.classification) ?? 0) + 1)
      }
    }
    let best: { name: string; count: number } | null = null
    for (const [name, classificationCount] of counts) {
      if (!best || classificationCount > best.count) best = { name, count: classificationCount }
    }
    return best
  }, [ecgs])

  if (isLoading) {
    return <LoadingState />
  }

  if (!ecgs || ecgs.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No ECG recordings in this export. ECGs are recorded with the ECG app on Apple Watch.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Activity} label="Recordings" value={fmtNumber(ecgs.length)} />
        <StatCard
          icon={CalendarClock}
          label="Most recent"
          value={fmtDate(ecgs[0]?.recorded_at?.slice(0, 10) ?? null)}
        />
        <StatCard
          icon={Tags}
          label="Most common result"
          value={topClassification?.name ?? '—'}
          sub={topClassification ? `${topClassification.count} recordings` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ecgs.map((ecg) => (
          <EcgCard key={ecg.id} ecg={ecg} />
        ))}
      </div>
    </div>
  )
}
