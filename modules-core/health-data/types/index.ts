/**
 * Health Data module types (API/client shapes, snake_case like the wire format)
 */

export type ImportStatus = 'processing' | 'completed' | 'failed'

export interface HealthProfileInfo {
  dateOfBirth: string | null
  biologicalSex: string | null
  bloodType: string | null
  height: { value: number; unit: string; date: string } | null
  bodyMass: { value: number; unit: string; date: string } | null
}

export interface ClinicalRecordInfo {
  type: string
  name: string
  date: string | null
  status: string | null
  cvx?: string | null
  lot?: string | null
  location?: string | null
}

export interface HealthImportStatus {
  id: string
  status: ImportStatus
  progress: number
  phase: string | null
  records_parsed: number
  error: string | null
  export_date: string | null
  expires_at: string
  created_at: string
}

export interface DailyMetricPoint {
  metric_date: string
  value_sum: number | null
  value_min: number | null
  value_max: number | null
  value_avg: number | null
  sample_count: number
}

export interface MetricSeries {
  metric_type: string
  unit: string | null
  data: DailyMetricPoint[]
}

export interface MetricCatalogEntry {
  metric_type: string
  unit: string | null
  days: number
  total: number | null
  average: number | null
  first_date: string | null
  last_date: string | null
}

export interface HealthSummary {
  import: HealthImportStatus
  profile: HealthProfileInfo | null
  clinical: ClinicalRecordInfo[]
  locale: string | null
  catalog: MetricCatalogEntry[]
  totals: {
    workouts: number
    sleep_nights: number
    activity_days: number
    ecgs: number
    first_date: string | null
    last_date: string | null
  }
}

export interface HealthWorkout {
  id: string
  activity_type: string
  start_time: string
  end_time: string
  duration_min: number | null
  distance_km: number | null
  energy_kcal: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  elevation_gain_m: number | null
  source_name: string | null
}

export interface HealthActivityDay {
  day: string
  active_energy: number | null
  active_energy_goal: number | null
  exercise_minutes: number | null
  exercise_goal: number | null
  stand_hours: number | null
  stand_goal: number | null
}

export interface HealthSleepNight {
  night_date: string
  start_time: string | null
  end_time: string | null
  in_bed_min: number | null
  asleep_min: number | null
  core_min: number | null
  deep_min: number | null
  rem_min: number | null
  awake_min: number | null
}

export interface HealthRoute {
  id: string
  route_date: string
  started_at: string | null
  distance_km: number | null
  duration_min: number | null
  point_count: number
  /** Downsampled [lat, lon] pairs */
  points: Array<[number, number]>
}

export interface HealthEcg {
  id: string
  recorded_at: string | null
  classification: string | null
  symptoms: string | null
  average_heart_rate: number | null
  sampling_frequency_hz: number | null
  sample_count: number | null
  duration_sec: number | null
  device: string | null
  waveform: number[]
}

export interface HealthEcgDetail extends HealthEcg {
  waveform_full: number[] | null
}
