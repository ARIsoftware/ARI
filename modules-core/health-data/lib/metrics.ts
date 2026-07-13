/**
 * Metric type normalization and display metadata for Apple Health data.
 *
 * HealthKit identifiers like `HKQuantityTypeIdentifierStepCount` are
 * normalized to snake_case keys (`step_count`) at parse time. This map
 * drives how each metric is aggregated (cumulative types sum per day,
 * sampled types average) and how the UI labels and formats it. Unknown
 * types still flow through with generic formatting.
 */

export type MetricMode = 'sum' | 'avg'

export type MetricCategory =
  | 'activity'
  | 'heart'
  | 'body'
  | 'mobility'
  | 'respiratory'
  | 'audio'
  | 'sleep'
  | 'other'

export interface MetricMeta {
  label: string
  mode: MetricMode
  category: MetricCategory
  decimals: number
}

const HK_PREFIXES = [
  'HKQuantityTypeIdentifier',
  'HKCategoryTypeIdentifier',
  'HKDataType',
]

export function normalizeMetricType(hkType: string): string {
  let name = hkType
  for (const prefix of HK_PREFIXES) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length)
      break
    }
  }
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

export const METRIC_META: Record<string, MetricMeta> = {
  step_count: { label: 'Steps', mode: 'sum', category: 'activity', decimals: 0 },
  distance_walking_running: { label: 'Walking + Running Distance', mode: 'sum', category: 'activity', decimals: 1 },
  distance_cycling: { label: 'Cycling Distance', mode: 'sum', category: 'activity', decimals: 1 },
  distance_swimming: { label: 'Swimming Distance', mode: 'sum', category: 'activity', decimals: 1 },
  active_energy_burned: { label: 'Active Energy', mode: 'sum', category: 'activity', decimals: 0 },
  basal_energy_burned: { label: 'Resting Energy', mode: 'sum', category: 'activity', decimals: 0 },
  flights_climbed: { label: 'Flights Climbed', mode: 'sum', category: 'activity', decimals: 0 },
  apple_exercise_time: { label: 'Exercise Minutes', mode: 'sum', category: 'activity', decimals: 0 },
  apple_stand_time: { label: 'Stand Minutes', mode: 'sum', category: 'activity', decimals: 0 },
  time_in_daylight: { label: 'Time in Daylight', mode: 'sum', category: 'activity', decimals: 0 },
  physical_effort: { label: 'Physical Effort', mode: 'avg', category: 'activity', decimals: 1 },

  heart_rate: { label: 'Heart Rate', mode: 'avg', category: 'heart', decimals: 0 },
  resting_heart_rate: { label: 'Resting Heart Rate', mode: 'avg', category: 'heart', decimals: 0 },
  walking_heart_rate_average: { label: 'Walking Heart Rate Avg', mode: 'avg', category: 'heart', decimals: 0 },
  heart_rate_variability_sdnn: { label: 'Heart Rate Variability (SDNN)', mode: 'avg', category: 'heart', decimals: 0 },
  heart_rate_recovery_one_minute: { label: 'Cardio Recovery', mode: 'avg', category: 'heart', decimals: 0 },
  vo2_max: { label: 'VO2 Max', mode: 'avg', category: 'heart', decimals: 1 },
  oxygen_saturation: { label: 'Blood Oxygen', mode: 'avg', category: 'heart', decimals: 1 },

  respiratory_rate: { label: 'Respiratory Rate', mode: 'avg', category: 'respiratory', decimals: 1 },

  body_mass: { label: 'Body Weight', mode: 'avg', category: 'body', decimals: 1 },
  height: { label: 'Height', mode: 'avg', category: 'body', decimals: 1 },
  apple_sleeping_wrist_temperature: { label: 'Sleeping Wrist Temperature', mode: 'avg', category: 'body', decimals: 2 },
  apple_sleeping_breathing_disturbances: { label: 'Breathing Disturbances', mode: 'avg', category: 'body', decimals: 1 },

  walking_speed: { label: 'Walking Speed', mode: 'avg', category: 'mobility', decimals: 2 },
  walking_step_length: { label: 'Walking Step Length', mode: 'avg', category: 'mobility', decimals: 1 },
  walking_double_support_percentage: { label: 'Double Support', mode: 'avg', category: 'mobility', decimals: 1 },
  walking_asymmetry_percentage: { label: 'Walking Asymmetry', mode: 'avg', category: 'mobility', decimals: 1 },
  apple_walking_steadiness: { label: 'Walking Steadiness', mode: 'avg', category: 'mobility', decimals: 0 },
  six_minute_walk_test_distance: { label: 'Six-Minute Walk Distance', mode: 'avg', category: 'mobility', decimals: 0 },
  stair_ascent_speed: { label: 'Stair Ascent Speed', mode: 'avg', category: 'mobility', decimals: 2 },
  stair_descent_speed: { label: 'Stair Descent Speed', mode: 'avg', category: 'mobility', decimals: 2 },
  running_speed: { label: 'Running Speed', mode: 'avg', category: 'mobility', decimals: 2 },
  running_power: { label: 'Running Power', mode: 'avg', category: 'mobility', decimals: 0 },
  running_stride_length: { label: 'Running Stride Length', mode: 'avg', category: 'mobility', decimals: 2 },
  running_vertical_oscillation: { label: 'Vertical Oscillation', mode: 'avg', category: 'mobility', decimals: 1 },
  running_ground_contact_time: { label: 'Ground Contact Time', mode: 'avg', category: 'mobility', decimals: 0 },

  environmental_audio_exposure: { label: 'Environmental Sound Levels', mode: 'avg', category: 'audio', decimals: 0 },
  headphone_audio_exposure: { label: 'Headphone Audio Levels', mode: 'avg', category: 'audio', decimals: 0 },
  environmental_sound_reduction: { label: 'Environmental Sound Reduction', mode: 'avg', category: 'audio', decimals: 0 },
}

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  activity: 'Activity',
  heart: 'Heart',
  body: 'Body',
  mobility: 'Mobility',
  respiratory: 'Respiratory',
  audio: 'Hearing',
  sleep: 'Sleep',
  other: 'Other',
}

export function getMetricMeta(metricType: string): MetricMeta {
  const known = METRIC_META[metricType]
  if (known) return known
  const label = metricType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return { label, mode: 'avg', category: 'other', decimals: 1 }
}

export function getCategoryLabel(category: MetricCategory): string {
  return CATEGORY_LABELS[category]
}

export function isCumulative(metricType: string): boolean {
  return getMetricMeta(metricType).mode === 'sum'
}
