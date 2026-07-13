'use client'

import { useMemo } from 'react'
import { Syringe, CalendarClock, ClipboardList } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { StatCard } from '@/modules/health-data/components/stat-card'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { useHealthSummary } from '@/modules/health-data/hooks/use-health-data'
import { fmtDate, fmtNumber } from '@/modules/health-data/lib/format'

export default function HealthDataClinicalPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Clinical" />
      <HealthGate>
        <ClinicalContent />
      </HealthGate>
    </div>
  )
}

function ClinicalContent() {
  const { data: summary, isLoading } = useHealthSummary()
  const records = useMemo(() => summary?.clinical ?? [], [summary])

  const typeCount = useMemo(() => new Set(records.map((r) => r.type)).size, [records])
  const latestDate = useMemo(() => {
    let latest: string | null = null
    for (const record of records) {
      if (record.date && (!latest || record.date > latest)) latest = record.date
    }
    return latest
  }, [records])

  if (isLoading) {
    return <LoadingState />
  }

  if (records.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No clinical records in this export. Clinical records appear when you connect a health
        provider or add records (like immunizations) to the Health app.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Syringe} label="Records" value={fmtNumber(records.length)} />
        <StatCard icon={ClipboardList} label="Record types" value={fmtNumber(typeCount)} />
        <StatCard icon={CalendarClock} label="Most recent" value={fmtDate(latestDate)} />
      </div>

      <Card className="rounded-sm">
        <CardHeader>
          <CardTitle className="text-base">Clinical Records</CardTitle>
          <CardDescription>From connected health providers and imported records</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Record</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>CVX</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{record.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="rounded-sm font-normal">
                      {record.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{record.cvx ?? '—'}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{record.lot ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{record.location ?? '—'}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{record.status ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtDate(record.date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
