'use client'

import { ChartColumn, ChartSpline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChartStyle } from '@/modules/health-data/hooks/use-chart-style'

export function ChartStyleToggle({
  value,
  onChange,
}: {
  value: ChartStyle
  onChange: (style: ChartStyle) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-sm border border-border bg-muted/40 p-1">
      <Button
        variant={value === 'bars' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 px-2.5"
        aria-label="Bar charts"
        title="Bar charts"
        onClick={() => onChange('bars')}
      >
        <ChartColumn className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={value === 'spark' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 px-2.5"
        aria-label="Sparklines"
        title="Sparklines"
        onClick={() => onChange('spark')}
      >
        <ChartSpline className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
