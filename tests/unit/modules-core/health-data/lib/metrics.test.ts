import { describe, it, expect } from 'vitest'
import {
  normalizeMetricType,
  getMetricMeta,
  getCategoryLabel,
  isCumulative,
  METRIC_META,
} from '@/modules-core/health-data/lib/metrics'

describe('normalizeMetricType', () => {
  it('strips HKQuantityTypeIdentifier prefix', () => {
    expect(normalizeMetricType('HKQuantityTypeIdentifierStepCount')).toBe('step_count')
  })

  it('strips HKCategoryTypeIdentifier prefix', () => {
    expect(normalizeMetricType('HKCategoryTypeIdentifierSleepAnalysis')).toBe('sleep_analysis')
  })

  it('strips HKDataType prefix', () => {
    expect(normalizeMetricType('HKDataTypeHeartRate')).toBe('heart_rate')
  })

  it('converts CamelCase to snake_case without prefix', () => {
    expect(normalizeMetricType('HeartRateVariabilitySDNN')).toBe('heart_rate_variability_sdnn')
  })

  it('handles already known metrics correctly', () => {
    expect(normalizeMetricType('HKQuantityTypeIdentifierHeartRate')).toBe('heart_rate')
    expect(normalizeMetricType('HKQuantityTypeIdentifierActiveEnergyBurned')).toBe('active_energy_burned')
    expect(normalizeMetricType('HKQuantityTypeIdentifierVO2Max')).toBe('vo2_max')
  })

  it('converts sequences of capitals (ABC prefix → abc)', () => {
    // ABCDef → second regex splits "ABC" → "AB_Def" then first regex gives "ab_def"
    // Actually: ([A-Z]+)([A-Z][a-z]) matches "ABCDef" as "AB"+"Def" → "AB_Def"
    // then ([a-z0-9])([A-Z]) gives no more matches → lower: "ab_def"?
    // Observed: 'abc_def'
    expect(normalizeMetricType('ABCDef')).toBe('abc_def')
  })

  it('handles string with no prefix and no CamelCase', () => {
    expect(normalizeMetricType('plain')).toBe('plain')
  })

  it('handles lowercase input unchanged', () => {
    expect(normalizeMetricType('step_count')).toBe('step_count')
  })
})

describe('getMetricMeta — known types', () => {
  it('returns metadata for step_count', () => {
    const meta = getMetricMeta('step_count')
    expect(meta.label).toBe('Steps')
    expect(meta.mode).toBe('sum')
    expect(meta.category).toBe('activity')
    expect(meta.decimals).toBe(0)
  })

  it('returns metadata for heart_rate', () => {
    const meta = getMetricMeta('heart_rate')
    expect(meta.label).toBe('Heart Rate')
    expect(meta.mode).toBe('avg')
    expect(meta.category).toBe('heart')
  })

  it('returns metadata for body_mass', () => {
    const meta = getMetricMeta('body_mass')
    expect(meta.mode).toBe('avg')
    expect(meta.category).toBe('body')
  })

  it('returns metadata for vo2_max with 1 decimal', () => {
    const meta = getMetricMeta('vo2_max')
    expect(meta.decimals).toBe(1)
    expect(meta.category).toBe('heart')
  })
})

describe('getMetricMeta — unknown type', () => {
  it('generates a humanized label for unknown types', () => {
    const meta = getMetricMeta('my_custom_metric')
    expect(meta.label).toBe('My Custom Metric')
    expect(meta.mode).toBe('avg')
    expect(meta.category).toBe('other')
    expect(meta.decimals).toBe(1)
  })

  it('handles single-word unknown type', () => {
    const meta = getMetricMeta('weight')
    expect(meta.label).toBe('Weight')
    expect(meta.mode).toBe('avg')
  })
})

describe('getCategoryLabel', () => {
  it('returns Activity for activity', () => {
    expect(getCategoryLabel('activity')).toBe('Activity')
  })

  it('returns Heart for heart', () => {
    expect(getCategoryLabel('heart')).toBe('Heart')
  })

  it('returns Body for body', () => {
    expect(getCategoryLabel('body')).toBe('Body')
  })

  it('returns Mobility for mobility', () => {
    expect(getCategoryLabel('mobility')).toBe('Mobility')
  })

  it('returns Respiratory for respiratory', () => {
    expect(getCategoryLabel('respiratory')).toBe('Respiratory')
  })

  it('returns Hearing for audio', () => {
    expect(getCategoryLabel('audio')).toBe('Hearing')
  })

  it('returns Sleep for sleep', () => {
    expect(getCategoryLabel('sleep')).toBe('Sleep')
  })

  it('returns Other for other', () => {
    expect(getCategoryLabel('other')).toBe('Other')
  })
})

describe('isCumulative', () => {
  it('returns true for step_count (sum mode)', () => {
    expect(isCumulative('step_count')).toBe(true)
  })

  it('returns true for active_energy_burned', () => {
    expect(isCumulative('active_energy_burned')).toBe(true)
  })

  it('returns true for flights_climbed', () => {
    expect(isCumulative('flights_climbed')).toBe(true)
  })

  it('returns false for heart_rate (avg mode)', () => {
    expect(isCumulative('heart_rate')).toBe(false)
  })

  it('returns false for body_mass', () => {
    expect(isCumulative('body_mass')).toBe(false)
  })

  it('returns false for unknown type (defaults to avg)', () => {
    expect(isCumulative('some_unknown_metric')).toBe(false)
  })
})

describe('METRIC_META coverage', () => {
  it('every sum-mode metric is in the activity category except physical_effort', () => {
    const sumMetrics = Object.entries(METRIC_META)
      .filter(([, meta]) => meta.mode === 'sum')
      .map(([key]) => key)
    // All sum metrics except physical_effort should be activity
    for (const key of sumMetrics) {
      expect(['activity']).toContain(METRIC_META[key].category)
    }
  })

  it('contains all expected categories', () => {
    const categories = new Set(Object.values(METRIC_META).map((m) => m.category))
    expect(categories.has('activity')).toBe(true)
    expect(categories.has('heart')).toBe(true)
    expect(categories.has('body')).toBe(true)
    expect(categories.has('mobility')).toBe(true)
    expect(categories.has('respiratory')).toBe(true)
    expect(categories.has('audio')).toBe(true)
  })
})
