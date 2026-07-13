/**
 * Shared transforms from API metric series to chart-ready points,
 * used by the Heart, Mobility, and Vitals pages.
 */

import { filterByRange, type DateRange } from '../components/range-select'
import { getMetricMeta } from './metrics'
import type { MetricSeries } from '../types'
import type { MetricPoint } from '../components/metric-chart'

export function indexSeries(series: MetricSeries[] | undefined): Map<string, MetricSeries> {
  const map = new Map<string, MetricSeries>()
  for (const s of series ?? []) map.set(s.metric_type, s)
  return map
}

export interface SeriesPoints {
  unit: string | null
  data: MetricPoint[]
}

/**
 * Daily points for one metric within a range. Cumulative metrics use the
 * daily sum; sampled metrics the daily average (per METRIC_META).
 */
export function metricPoints(
  map: Map<string, MetricSeries>,
  type: string,
  range: DateRange
): SeriesPoints {
  const series = map.get(type)
  if (!series) return { unit: null, data: [] }
  const cumulative = getMetricMeta(type).mode === 'sum'
  const mapped = series.data.map((d) => ({
    date: d.metric_date,
    value: cumulative ? d.value_sum : d.value_avg,
  }))
  return { unit: series.unit, data: filterByRange(mapped, range) }
}
