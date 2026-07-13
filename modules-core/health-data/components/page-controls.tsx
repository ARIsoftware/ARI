'use client'

import { useHealthStatus } from '@/modules/health-data/hooks/use-health-data'
import { ChartStyleToggle } from './chart-style-toggle'
import { RangeSelect, type DateRange } from './range-select'
import type { ChartStyle } from '@/modules/health-data/hooks/use-chart-style'

interface PageControlsProps {
  range: DateRange
  onRangeChange: (range: DateRange) => void
  chartStyle?: ChartStyle
  onChartStyleChange?: (style: ChartStyle) => void
}

/**
 * Range picker (+ optional chart-style toggle) rendered in the page
 * header, top-right. Hidden until an import is loaded.
 */
export function PageControls({ range, onRangeChange, chartStyle, onChartStyleChange }: PageControlsProps) {
  const { data: status } = useHealthStatus()
  if (status?.status !== 'completed') return null

  return (
    <div className="flex items-center gap-2">
      {chartStyle !== undefined && onChartStyleChange && (
        <ChartStyleToggle value={chartStyle} onChange={onChartStyleChange} />
      )}
      <RangeSelect value={range} onChange={onRangeChange} />
    </div>
  )
}
