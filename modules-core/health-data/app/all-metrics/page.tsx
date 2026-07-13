'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/modules/health-data/components/page-header'
import { HealthGate } from '@/modules/health-data/components/health-gate'
import { LoadingState } from '@/modules/health-data/components/loading-state'
import { useHealthSummary } from '@/modules/health-data/hooks/use-health-data'
import { getMetricMeta, getCategoryLabel } from '@/modules/health-data/lib/metrics'
import { fmtDate, fmtNumber } from '@/modules/health-data/lib/format'
import type { MetricCatalogEntry } from '@/modules/health-data/types'

export default function HealthDataAllMetricsPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader title="All Metrics" />
      <HealthGate>
        <AllMetricsContent />
      </HealthGate>
    </div>
  )
}

function AllMetricsContent() {
  const { data: summary, isLoading, error } = useHealthSummary()

  if (isLoading) {
    return <LoadingState />
  }
  if (error || !summary) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {error instanceof Error ? error.message : 'Failed to load the summary.'}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <MetricCatalogCard catalog={summary.catalog} />
    </div>
  )
}



function MetricCatalogCard({ catalog }: { catalog: MetricCatalogEntry[] }) {
  const sorted = [...catalog].sort((a, b) => {
    const categoryA = getMetricMeta(a.metric_type).category
    const categoryB = getMetricMeta(b.metric_type).category
    if (categoryA !== categoryB) return categoryA.localeCompare(categoryB)
    return b.days - a.days
  })

  return (
    <Card className="rounded-sm">
      <CardHeader>
        <CardTitle className="text-base">All Metrics</CardTitle>
        <CardDescription>
          Every metric found in your export, summarized per day. Explore the other pages for
          charts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Daily Average</TableHead>
              <TableHead>Range</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => {
              const meta = getMetricMeta(entry.metric_type)
              const isSum = meta.mode === 'sum'
              return (
                <TableRow key={entry.metric_type}>
                  <TableCell className="font-medium">{meta.label}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="rounded-sm font-normal">
                      {getCategoryLabel(meta.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNumber(entry.days)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {isSum && entry.total !== null
                      ? `${fmtNumber(entry.total, meta.decimals)}${entry.unit ? ` ${entry.unit}` : ''}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {isSum
                      ? entry.total !== null && entry.days > 0
                        ? `${fmtNumber(entry.total / entry.days, meta.decimals)}${entry.unit ? ` ${entry.unit}` : ''}`
                        : '—'
                      : entry.average !== null
                        ? `${fmtNumber(entry.average, meta.decimals)}${entry.unit ? ` ${entry.unit}` : ''}`
                        : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtDate(entry.first_date)} – {fmtDate(entry.last_date)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}


