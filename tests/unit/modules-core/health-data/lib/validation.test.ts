/**
 * validation.ts imports '@/lib/openapi/registry' as a side-effect
 * (extends Zod with openapi()), which is safe in Node.
 */
import { describe, it, expect } from 'vitest'
import {
  uploadQuerySchema,
  metricsQuerySchema,
  ImportStatusSchema,
  MetricSeriesSchema,
  WorkoutSchema,
  ActivityDaySchema,
  SleepNightSchema,
  RouteSchema,
  EcgSchema,
} from '@/modules-core/health-data/lib/validation'

describe('uploadQuerySchema', () => {
  it('accepts valid begin action', () => {
    const result = uploadQuerySchema.safeParse({ action: 'begin' })
    expect(result.success).toBe(true)
  })

  it('accepts valid chunk action with id and index', () => {
    const result = uploadQuerySchema.safeParse({
      action: 'chunk',
      id: '00000000-0000-0000-0000-000000000001',
      index: 0,
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid finish action', () => {
    const result = uploadQuerySchema.safeParse({
      action: 'finish',
      id: '00000000-0000-0000-0000-000000000001',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid action', () => {
    const result = uploadQuerySchema.safeParse({ action: 'invalid' })
    expect(result.success).toBe(false)
    expect(result.error?.errors[0].message).toContain('begin')
  })

  it('rejects non-UUID id', () => {
    const result = uploadQuerySchema.safeParse({ action: 'chunk', id: 'not-a-uuid', index: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects negative index', () => {
    const result = uploadQuerySchema.safeParse({
      action: 'chunk',
      id: '00000000-0000-0000-0000-000000000001',
      index: -1,
    })
    expect(result.success).toBe(false)
  })

  it('coerces string index to number', () => {
    const result = uploadQuerySchema.safeParse({
      action: 'chunk',
      id: '00000000-0000-0000-0000-000000000001',
      index: '3',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.index).toBe(3)
    }
  })
})

describe('metricsQuerySchema', () => {
  it('accepts a single metric type', () => {
    const result = metricsQuerySchema.safeParse({ types: 'step_count' })
    expect(result.success).toBe(true)
  })

  it('accepts multiple comma-separated metric types', () => {
    const result = metricsQuerySchema.safeParse({ types: 'step_count,heart_rate,body_mass' })
    expect(result.success).toBe(true)
  })

  it('accepts with from/to date range', () => {
    const result = metricsQuerySchema.safeParse({
      types: 'step_count',
      from: '2026-01-01',
      to: '2026-12-31',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty types string', () => {
    const result = metricsQuerySchema.safeParse({ types: '' })
    expect(result.success).toBe(false)
  })

  it('rejects types with invalid characters (uppercase)', () => {
    const result = metricsQuerySchema.safeParse({ types: 'StepCount' })
    expect(result.success).toBe(false)
  })

  it('rejects types with spaces', () => {
    const result = metricsQuerySchema.safeParse({ types: 'step count' })
    expect(result.success).toBe(false)
  })

  it('rejects more than 20 metric types', () => {
    const types = Array.from({ length: 21 }, (_, i) => `metric_${i}`).join(',')
    const result = metricsQuerySchema.safeParse({ types })
    expect(result.success).toBe(false)
  })

  it('accepts exactly 20 metric types', () => {
    const types = Array.from({ length: 20 }, (_, i) => `metric_${i}`).join(',')
    const result = metricsQuerySchema.safeParse({ types })
    expect(result.success).toBe(true)
  })

  it('rejects invalid from date format', () => {
    const result = metricsQuerySchema.safeParse({ types: 'step_count', from: '01-01-2026' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid to date format', () => {
    const result = metricsQuerySchema.safeParse({ types: 'step_count', to: '2026/01/01' })
    expect(result.success).toBe(false)
  })

  it('rejects types string exceeding 600 chars', () => {
    const types = 'a_' + 'b'.repeat(600)
    const result = metricsQuerySchema.safeParse({ types })
    expect(result.success).toBe(false)
  })
})

describe('ImportStatusSchema', () => {
  const validStatus = {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'completed',
    progress: 100,
    phase: 'Done',
    records_parsed: 5000,
    error: null,
    export_date: '2024-01-15T20:30:00-05:00',
    expires_at: '2026-07-20T18:00:00.000Z',
    created_at: '2026-07-10T12:00:00.000Z',
  }

  it('accepts a valid import status', () => {
    const result = ImportStatusSchema.safeParse(validStatus)
    expect(result.success).toBe(true)
  })

  it('rejects invalid status values', () => {
    const result = ImportStatusSchema.safeParse({ ...validStatus, status: 'unknown' })
    expect(result.success).toBe(false)
  })

  it('rejects progress out of 0-100 range', () => {
    expect(ImportStatusSchema.safeParse({ ...validStatus, progress: -1 }).success).toBe(false)
    expect(ImportStatusSchema.safeParse({ ...validStatus, progress: 101 }).success).toBe(false)
  })

  it('accepts all valid status enum values', () => {
    for (const s of ['processing', 'completed', 'failed']) {
      expect(ImportStatusSchema.safeParse({ ...validStatus, status: s }).success).toBe(true)
    }
  })

  it('rejects negative records_parsed', () => {
    const result = ImportStatusSchema.safeParse({ ...validStatus, records_parsed: -1 })
    expect(result.success).toBe(false)
  })
})

describe('MetricSeriesSchema', () => {
  it('accepts a valid metric series', () => {
    const result = MetricSeriesSchema.safeParse({
      metric_type: 'step_count',
      unit: 'count',
      data: [
        {
          metric_date: '2026-01-01',
          value_sum: 5000,
          value_min: 0,
          value_max: 10000,
          value_avg: 5000,
          sample_count: 1,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts null unit', () => {
    const result = MetricSeriesSchema.safeParse({
      metric_type: 'heart_rate',
      unit: null,
      data: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative sample_count', () => {
    const result = MetricSeriesSchema.safeParse({
      metric_type: 'step_count',
      unit: null,
      data: [
        {
          metric_date: '2026-01-01',
          value_sum: null,
          value_min: null,
          value_max: null,
          value_avg: null,
          sample_count: -1,
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('WorkoutSchema', () => {
  it('accepts a valid workout', () => {
    const result = WorkoutSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      activity_type: 'Running',
      start_time: '2026-01-01T07:00:00-05:00',
      end_time: '2026-01-01T07:30:00-05:00',
      duration_min: 30,
      distance_km: 5.1,
      energy_kcal: 300,
      avg_heart_rate: 145,
      max_heart_rate: 172,
      elevation_gain_m: 50,
      source_name: 'Apple Watch',
    })
    expect(result.success).toBe(true)
  })

  it('accepts null nullable fields', () => {
    const result = WorkoutSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      activity_type: 'Yoga',
      start_time: '2026-01-01T07:00:00Z',
      end_time: '2026-01-01T08:00:00Z',
      duration_min: null,
      distance_km: null,
      energy_kcal: null,
      avg_heart_rate: null,
      max_heart_rate: null,
      elevation_gain_m: null,
      source_name: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('ActivityDaySchema', () => {
  it('accepts a valid activity day', () => {
    const result = ActivityDaySchema.safeParse({
      day: '2026-01-01',
      active_energy: 400,
      active_energy_goal: 600,
      exercise_minutes: 30,
      exercise_goal: 30,
      stand_hours: 10,
      stand_goal: 12,
    })
    expect(result.success).toBe(true)
  })

  it('accepts null fields', () => {
    const result = ActivityDaySchema.safeParse({
      day: '2026-01-01',
      active_energy: null,
      active_energy_goal: null,
      exercise_minutes: null,
      exercise_goal: null,
      stand_hours: null,
      stand_goal: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('SleepNightSchema', () => {
  it('accepts a valid sleep night', () => {
    const result = SleepNightSchema.safeParse({
      night_date: '2026-01-01',
      start_time: '2026-01-01T23:00:00-05:00',
      end_time: '2026-01-02T07:00:00-05:00',
      in_bed_min: 480,
      asleep_min: 420,
      core_min: 200,
      deep_min: 80,
      rem_min: 140,
      awake_min: 60,
    })
    expect(result.success).toBe(true)
  })

  it('accepts all-null sleep night', () => {
    const result = SleepNightSchema.safeParse({
      night_date: '2026-01-01',
      start_time: null,
      end_time: null,
      in_bed_min: null,
      asleep_min: null,
      core_min: null,
      deep_min: null,
      rem_min: null,
      awake_min: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('RouteSchema', () => {
  it('accepts a valid route', () => {
    const result = RouteSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      route_date: '2026-01-01',
      started_at: '2026-01-01T07:00:00Z',
      distance_km: 5.3,
      duration_min: 30,
      point_count: 250,
      points: [[37.7749, -122.4194], [37.7750, -122.4195]],
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid point tuple (wrong length)', () => {
    const result = RouteSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      route_date: '2026-01-01',
      started_at: null,
      distance_km: null,
      duration_min: null,
      point_count: 0,
      points: [[37.7749]], // only one element, not a tuple of two
    })
    expect(result.success).toBe(false)
  })
})

describe('EcgSchema', () => {
  it('accepts a valid ECG', () => {
    const result = EcgSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      recorded_at: '2026-01-01T09:00:00-05:00',
      classification: 'Sinus Rhythm',
      symptoms: 'None',
      average_heart_rate: 72,
      sampling_frequency_hz: 512,
      sample_count: 15360,
      duration_sec: 30,
      device: 'Apple Watch',
      waveform: [0.1, 0.2, -0.1],
    })
    expect(result.success).toBe(true)
  })

  it('accepts all-null nullable fields', () => {
    const result = EcgSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      recorded_at: null,
      classification: null,
      symptoms: null,
      average_heart_rate: null,
      sampling_frequency_hz: null,
      sample_count: null,
      duration_sec: null,
      device: null,
      waveform: [],
    })
    expect(result.success).toBe(true)
  })
})
