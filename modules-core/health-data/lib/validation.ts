import { z } from 'zod'
import '@/lib/openapi/registry'

// ── Query schemas ──

export const uploadQuerySchema = z.object({
  action: z.enum(['begin', 'chunk', 'finish'], {
    errorMap: () => ({ message: 'action must be one of: begin, chunk, finish' }),
  }),
  id: z.string().uuid('id must be a valid upload session id').optional(),
  index: z.coerce.number().int('index must be an integer').min(0, 'index must be 0 or greater').optional(),
})

export const metricsQuerySchema = z.object({
  types: z
    .string()
    .min(1, 'At least one metric type is required')
    .max(600, 'Too many metric types requested')
    .regex(/^[a-z0-9_]+(,[a-z0-9_]+)*$/, 'Metric types must be a comma-separated list of snake_case identifiers')
    .refine((value) => value.split(',').length <= 20, 'At most 20 metric types can be requested at once'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be a date in YYYY-MM-DD format').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be a date in YYYY-MM-DD format').optional(),
})

// ── Response schemas (OpenAPI) ──

export const ImportStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['processing', 'completed', 'failed']),
  progress: z.number().int().min(0).max(100),
  phase: z.string().nullable(),
  records_parsed: z.number().int().nonnegative(),
  error: z.string().nullable(),
  export_date: z.string().nullable(),
  expires_at: z.string(),
  created_at: z.string(),
}).openapi('HealthDataImportStatus')

export const StatusResponseSchema = z.object({
  import: ImportStatusSchema.nullable(),
}).openapi('HealthDataStatusResponse')

export const UploadResponseSchema = z.object({
  import: ImportStatusSchema,
}).openapi('HealthDataUploadResponse')

export const UploadBeginResponseSchema = z.object({
  upload_id: z.string().uuid(),
}).openapi('HealthDataUploadBeginResponse')

export const UploadChunkResponseSchema = z.object({
  received: z.number().int().nonnegative(),
}).openapi('HealthDataUploadChunkResponse')

// Chunk bodies are raw binary — represented per OpenAPI conventions.
export const UploadBodySchema = z.any().openapi({ type: 'string', format: 'binary' })

const ProfileSchema = z.object({
  dateOfBirth: z.string().nullable(),
  biologicalSex: z.string().nullable(),
  bloodType: z.string().nullable(),
  height: z.object({ value: z.number(), unit: z.string(), date: z.string() }).nullable(),
  bodyMass: z.object({ value: z.number(), unit: z.string(), date: z.string() }).nullable(),
}).openapi('HealthDataProfile')

const ClinicalRecordSchema = z.object({
  type: z.string(),
  name: z.string(),
  date: z.string().nullable(),
  status: z.string().nullable(),
  cvx: z.string().nullable().optional(),
  lot: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
}).openapi('HealthDataClinicalRecord')

export const MetricCatalogEntrySchema = z.object({
  metric_type: z.string(),
  unit: z.string().nullable(),
  days: z.number().int().nonnegative(),
  total: z.number().nullable(),
  average: z.number().nullable(),
  first_date: z.string().nullable(),
  last_date: z.string().nullable(),
}).openapi('HealthDataMetricCatalogEntry')

export const SummaryResponseSchema = z.object({
  import: ImportStatusSchema,
  profile: ProfileSchema.nullable(),
  clinical: z.array(ClinicalRecordSchema),
  locale: z.string().nullable(),
  catalog: z.array(MetricCatalogEntrySchema),
  totals: z.object({
    workouts: z.number().int().nonnegative(),
    sleep_nights: z.number().int().nonnegative(),
    activity_days: z.number().int().nonnegative(),
    ecgs: z.number().int().nonnegative(),
    first_date: z.string().nullable(),
    last_date: z.string().nullable(),
  }),
}).openapi('HealthDataSummaryResponse')

export const MetricSeriesSchema = z.object({
  metric_type: z.string(),
  unit: z.string().nullable(),
  data: z.array(z.object({
    metric_date: z.string(),
    value_sum: z.number().nullable(),
    value_min: z.number().nullable(),
    value_max: z.number().nullable(),
    value_avg: z.number().nullable(),
    sample_count: z.number().int().nonnegative(),
  })),
}).openapi('HealthDataMetricSeries')

export const MetricsResponseSchema = z.object({
  series: z.array(MetricSeriesSchema),
}).openapi('HealthDataMetricsResponse')

export const WorkoutSchema = z.object({
  id: z.string().uuid(),
  activity_type: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  duration_min: z.number().nullable(),
  distance_km: z.number().nullable(),
  energy_kcal: z.number().nullable(),
  avg_heart_rate: z.number().nullable(),
  max_heart_rate: z.number().nullable(),
  elevation_gain_m: z.number().nullable(),
  source_name: z.string().nullable(),
}).openapi('HealthDataWorkout')

export const WorkoutsResponseSchema = z.object({
  workouts: z.array(WorkoutSchema),
}).openapi('HealthDataWorkoutsResponse')

export const ActivityDaySchema = z.object({
  day: z.string(),
  active_energy: z.number().nullable(),
  active_energy_goal: z.number().nullable(),
  exercise_minutes: z.number().nullable(),
  exercise_goal: z.number().nullable(),
  stand_hours: z.number().nullable(),
  stand_goal: z.number().nullable(),
}).openapi('HealthDataActivityDay')

export const ActivityResponseSchema = z.object({
  days: z.array(ActivityDaySchema),
}).openapi('HealthDataActivityResponse')

export const SleepNightSchema = z.object({
  night_date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  in_bed_min: z.number().nullable(),
  asleep_min: z.number().nullable(),
  core_min: z.number().nullable(),
  deep_min: z.number().nullable(),
  rem_min: z.number().nullable(),
  awake_min: z.number().nullable(),
}).openapi('HealthDataSleepNight')

export const SleepResponseSchema = z.object({
  nights: z.array(SleepNightSchema),
}).openapi('HealthDataSleepResponse')

export const RouteSchema = z.object({
  id: z.string().uuid(),
  route_date: z.string(),
  started_at: z.string().nullable(),
  distance_km: z.number().nullable(),
  duration_min: z.number().nullable(),
  point_count: z.number().int().nonnegative(),
  points: z.array(z.tuple([z.number(), z.number()])),
}).openapi('HealthDataRoute')

export const RoutesResponseSchema = z.object({
  routes: z.array(RouteSchema),
}).openapi('HealthDataRoutesResponse')

export const EcgSchema = z.object({
  id: z.string().uuid(),
  recorded_at: z.string().nullable(),
  classification: z.string().nullable(),
  symptoms: z.string().nullable(),
  average_heart_rate: z.number().nullable(),
  sampling_frequency_hz: z.number().nullable(),
  sample_count: z.number().int().nullable(),
  duration_sec: z.number().nullable(),
  device: z.string().nullable(),
  waveform: z.array(z.number()),
}).openapi('HealthDataEcg')

export const EcgsResponseSchema = z.object({
  ecgs: z.array(EcgSchema),
}).openapi('HealthDataEcgsResponse')

export const EcgDetailResponseSchema = z.object({
  ecg: EcgSchema.extend({
    waveform_full: z.array(z.number()).nullable(),
  }).openapi('HealthDataEcgDetail'),
}).openapi('HealthDataEcgDetailResponse')

export const DeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('HealthDataDeleteResponse')
