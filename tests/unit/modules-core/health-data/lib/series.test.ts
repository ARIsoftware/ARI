/**
 * series.ts imports filterByRange from '../components/range-select' (a
 * 'use client' component) and MetricPoint type from '../components/metric-chart'.
 * We mock the component module so it works in Node without a DOM.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock the range-select component before importing series
vi.mock('@/modules-core/health-data/components/range-select', () => ({
  filterByRange: <T extends { date: string }>(rows: T[], range: number | 'all') => {
    if (range === 'all' || rows.length === 0) return rows
    // Simple cut-off: keep rows within the last `range` days of the last date
    const lastDate = rows.reduce(
      (max, row) => (row.date > max ? row.date : max),
      rows[0].date
    )
    const cutoff = new Date(`${lastDate}T00:00:00`)
    cutoff.setDate(cutoff.getDate() - (range as number))
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
    return rows.filter((row) => row.date >= cutoffStr)
  },
}))

import { indexSeries, metricPoints } from '@/modules-core/health-data/lib/series'

function makeSeries(
  metric_type: string,
  unit: string | null,
  data: Array<{ date: string; sum: number | null; avg: number | null }>
) {
  return {
    metric_type,
    unit,
    data: data.map((d) => ({
      metric_date: d.date,
      value_sum: d.sum,
      value_min: null,
      value_max: null,
      value_avg: d.avg,
      sample_count: 1,
    })),
  }
}

describe('indexSeries', () => {
  it('returns empty map for undefined', () => {
    expect(indexSeries(undefined).size).toBe(0)
  })

  it('returns empty map for empty array', () => {
    expect(indexSeries([]).size).toBe(0)
  })

  it('indexes by metric_type', () => {
    const series = [
      makeSeries('step_count', 'count', []),
      makeSeries('heart_rate', 'bpm', []),
    ]
    const map = indexSeries(series)
    expect(map.size).toBe(2)
    expect(map.has('step_count')).toBe(true)
    expect(map.has('heart_rate')).toBe(true)
  })

  it('later entry overwrites earlier for the same metric_type', () => {
    const s1 = makeSeries('step_count', 'count', [])
    const s2 = makeSeries('step_count', 'steps', [])
    const map = indexSeries([s1, s2])
    expect(map.get('step_count')?.unit).toBe('steps')
  })
})

describe('metricPoints', () => {
  it('returns empty data for unknown metric', () => {
    const map = new Map()
    const result = metricPoints(map, 'nonexistent', 'all')
    expect(result.unit).toBeNull()
    expect(result.data).toEqual([])
  })

  it('uses value_sum for cumulative (sum-mode) metrics', () => {
    // step_count is a sum metric
    const series = makeSeries('step_count', 'count', [
      { date: '2026-01-01', sum: 5000, avg: 2500 },
      { date: '2026-01-02', sum: 8000, avg: 4000 },
    ])
    const map = indexSeries([series])
    const result = metricPoints(map, 'step_count', 'all')
    expect(result.unit).toBe('count')
    expect(result.data).toHaveLength(2)
    expect(result.data[0].value).toBe(5000)
    expect(result.data[1].value).toBe(8000)
  })

  it('uses value_avg for sampled (avg-mode) metrics', () => {
    // heart_rate is an avg metric
    const series = makeSeries('heart_rate', 'bpm', [
      { date: '2026-01-01', sum: 7200, avg: 72 },
      { date: '2026-01-02', sum: 7500, avg: 75 },
    ])
    const map = indexSeries([series])
    const result = metricPoints(map, 'heart_rate', 'all')
    expect(result.data[0].value).toBe(72)
    expect(result.data[1].value).toBe(75)
  })

  it('maps metric_date to date in output', () => {
    const series = makeSeries('step_count', 'count', [
      { date: '2026-07-01', sum: 1000, avg: 500 },
    ])
    const map = indexSeries([series])
    const result = metricPoints(map, 'step_count', 'all')
    expect(result.data[0].date).toBe('2026-07-01')
  })

  it('filters by numeric date range', () => {
    const dates: Array<{ date: string; sum: number | null; avg: number | null }> = []
    // Create 60 days of data
    for (let i = 59; i >= 0; i--) {
      const d = new Date(2026, 5, 1) // June 1
      d.setDate(d.getDate() - i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dates.push({ date: dateStr, sum: 1000, avg: 100 })
    }
    const series = makeSeries('step_count', 'count', dates)
    const map = indexSeries([series])
    // 30-day filter should return only ~30 points
    const result = metricPoints(map, 'step_count', 30)
    expect(result.data.length).toBeGreaterThan(0)
    expect(result.data.length).toBeLessThanOrEqual(31)
  })

  it('passes through the unit from the series', () => {
    const series = makeSeries('body_mass', 'kg', [
      { date: '2026-01-01', sum: null, avg: 80 },
    ])
    const map = indexSeries([series])
    const result = metricPoints(map, 'body_mass', 'all')
    expect(result.unit).toBe('kg')
  })
})
