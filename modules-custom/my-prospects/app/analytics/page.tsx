'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, BarChart3 } from 'lucide-react'
import { useProspects } from '../../hooks/use-my-prospects'
import { POSITIONS } from '../../types'
import type { Position } from '../../types'

const POSITION_COLORS: Record<Position, string> = {
  PG: 'bg-blue-500',
  SG: 'bg-green-500',
  SF: 'bg-purple-500',
  PF: 'bg-orange-500',
  C: 'bg-red-500',
}

const RATING_COLORS = [
  'bg-red-400',
  'bg-orange-400',
  'bg-yellow-400',
  'bg-lime-400',
  'bg-green-500',
]

function BarChart({ data, colors }: { data: { label: string; value: number }[]; colors: Record<string, string> | string[] }) {
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const color = Array.isArray(colors)
          ? colors[i] || 'bg-primary'
          : colors[d.label] || 'bg-primary'
        const pct = (d.value / max) * 100

        return (
          <div key={d.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{d.label}</span>
              <span className="text-muted-foreground">{d.value}</span>
            </div>
            <div className="h-6 bg-muted rounded overflow-hidden">
              <div
                className={`h-full rounded transition-all ${color}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function MyProspectsAnalyticsPage() {
  const { data: prospects = [], isLoading } = useProspects()

  const positionData = useMemo(() => {
    const counts: Record<string, number> = {}
    POSITIONS.forEach((p) => (counts[p] = 0))
    prospects.forEach((p) => {
      if (counts[p.position] !== undefined) counts[p.position]++
    })
    return POSITIONS.map((p) => ({ label: p, value: counts[p] }))
  }, [prospects])

  const ratingData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]
    prospects.forEach((p) => {
      if (p.rating >= 1 && p.rating <= 5) counts[p.rating - 1]++
    })
    return counts.map((c, i) => ({ label: `${i + 1} Star`, value: c }))
  }, [prospects])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-4xl font-medium">Analytics</h1>
        <p className="text-muted-foreground mt-1">Breakdown of your scouted prospects</p>
      </div>

      {prospects.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No data yet. Add some prospects to see analytics.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Prospects by Position</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart data={positionData} colors={POSITION_COLORS} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rating Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart data={ratingData} colors={RATING_COLORS} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
