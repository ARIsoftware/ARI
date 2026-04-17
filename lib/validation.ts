// Comprehensive API validation schemas using Zod
import { z } from 'zod'

// Common validation patterns
const uuidSchema = z.string().uuid('Invalid UUID format')
const emailSchema = z.string().email('Invalid email format')
const nonEmptyString = z.string().min(1, 'Cannot be empty')
const positiveNumber = z.number().positive('Must be positive')
const nonNegativeNumber = z.number().nonnegative('Cannot be negative')

// Fitness-related schemas
export const createFitnessTaskSchema = z.object({
  task: z.object({
    title: nonEmptyString.max(255, 'Title too long'),
    status: TaskStatus.default('Pending'),
    priority: TaskPriority.default('Medium'),
    assignees: z.array(z.string().max(100)).max(10, 'Too many assignees').default([]),
    due_date: z.union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      z.null()
    ]).optional(),
    pinned: z.boolean().default(false),
    completed: z.boolean().default(false),
    subtasks_total: nonNegativeNumber.max(100, 'Too many subtasks').default(0),
    subtasks_completed: nonNegativeNumber.default(0),
    youtube_url: z.union([z.string().url('Invalid YouTube URL'), z.null()]).optional()
  })
}).refine(
  (data) => data.task.subtasks_completed <= data.task.subtasks_total,
  {
    message: 'Completed subtasks cannot exceed total subtasks',
    path: ['task', 'subtasks_completed']
  }
)

export const updateFitnessTaskSchema = z.object({
  id: uuidSchema,
  updates: z.object({
    title: nonEmptyString.max(255, 'Title too long').optional(),
    status: TaskStatus.optional(),
    priority: TaskPriority.optional(),
    assignees: z.array(z.string().max(100)).max(10, 'Too many assignees').optional(),
    due_date: z.union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      z.null()
    ]).optional(),
    pinned: z.boolean().optional(),
    completed: z.boolean().optional(),
    subtasks_total: nonNegativeNumber.max(100, 'Too many subtasks').optional(),
    subtasks_completed: nonNegativeNumber.optional(),
    youtube_url: z.union([z.string().url('Invalid YouTube URL'), z.null()]).optional(),
    order_index: nonNegativeNumber.optional()
  }).refine(
    (data) => !data.subtasks_completed || !data.subtasks_total || data.subtasks_completed <= data.subtasks_total,
    {
      message: 'Completed subtasks cannot exceed total subtasks',
      path: ['subtasks_completed']
    }
  )
})

// Goal-related schemas
export const createGoalSchema = z.object({
  goal: z.object({
    title: nonEmptyString.max(255, 'Title too long'),
    description: z.string().max(2000, 'Description too long'),
    category: z.string().max(100, 'Category too long'),
    priority: z.enum(['low', 'medium', 'high'], {
      errorMap: () => ({ message: 'Invalid priority level' })
    }),
    deadline: z.union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      z.string().length(0),
      z.null()
    ]).optional()
  })
})

export const updateGoalSchema = z.object({
  goal: z.object({
    title: nonEmptyString.max(255, 'Title too long').optional(),
    description: z.string().max(2000, 'Description too long').optional(),
    completed: z.boolean().optional(),
    target_date: z.union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      z.null()
    ]).optional(),
    progress: z.number().min(0, 'Progress cannot be negative').max(100, 'Progress cannot exceed 100%').optional()
  })
})

// HYROX-related schemas
export const HyroxStationName = z.enum([
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Rowing',
  'Farmers Carry', 'Sandbag Lunges', 'Wall Balls', '1km Run'
], {
  errorMap: () => ({ message: 'Invalid HYROX station name' })
})

export const updateStationRecordSchema = z.object({
  stationName: HyroxStationName,
  newTime: positiveNumber.max(3600000, 'Time cannot exceed 1 hour') // milliseconds
})

export const createHyroxWorkoutSchema = z.object({
  workout: z.object({
    total_time: nonNegativeNumber.max(7200000, 'Total time cannot exceed 2 hours').default(0), // milliseconds
    completed: z.boolean().default(false)
  })
})

export const completeHyroxWorkoutSchema = z.object({
  workoutId: uuidSchema,
  totalTime: positiveNumber.max(7200000, 'Total time cannot exceed 2 hours') // milliseconds
})

export const addWorkoutStationSchema = z.object({
  workoutId: uuidSchema,
  stationName: HyroxStationName,
  stationOrder: z.number().int().min(1, 'Station order must be at least 1').max(20, 'Station order too high'),
  stationTime: positiveNumber.max(3600000, 'Station time cannot exceed 1 hour').optional(), // milliseconds
  completed: z.boolean().default(true)
})

// Backup-related schemas (for completeness, though these are admin-only)
export const backupImportSchema = z.object({
  file: z.string().min(1, 'File content cannot be empty'),
  validateOnly: z.boolean().default(false)
})

// Path parameter schemas
export const uuidParamSchema = z.object({
  id: uuidSchema
})

// Query parameter schemas
export const paginationSchema = z.object({
  limit: z.string().regex(/^\d+$/, 'Limit must be a number').transform(Number).pipe(
    z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100')
  ).default('10'),
  offset: z.string().regex(/^\d+$/, 'Offset must be a number').transform(Number).pipe(
    z.number().int().nonnegative('Offset cannot be negative')
  ).default('0')
})

// Major Projects-related schemas
export const createMajorProjectSchema = z.object({
  project_name: nonEmptyString.max(255, 'Project name too long'),
  project_description: z.string().max(2000, 'Description too long').nullable().optional(),
  project_due_date: z.union([
    z.string().datetime(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    z.null()
  ]).optional()
})

export const updateMajorProjectSchema = z.object({
  project_name: nonEmptyString.max(255, 'Project name too long').optional(),
  project_description: z.string().max(2000, 'Description too long').nullable().optional(),
  project_due_date: z.union([
    z.string().datetime(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    z.null()
  ]).optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: 'At least one field must be provided for update'
  }
)

// Shipment-related schemas
export const ShipmentStatus = z.enum(['pending', 'in_transit', 'out_for_delivery', 'delivered', 'delayed', 'returned'], {
  errorMap: () => ({ message: 'Invalid shipment status' })
})

export const createShipmentSchema = z.object({
  shipment: z.object({
    name: nonEmptyString.max(255, 'Name too long'),
    tracking_code: z.string().max(100, 'Tracking code too long').nullable().optional(),
    tracking_link: z.string().url('Invalid URL format').max(500, 'URL too long').nullable().optional(),
    carrier: z.string().max(100, 'Carrier name too long').nullable().optional(),
    status: ShipmentStatus.default('pending'),
    expected_delivery: z.union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      z.null()
    ]).optional(),
    notes: z.string().max(2000, 'Notes too long').nullable().optional()
  })
})

export const updateShipmentSchema = z.object({
  name: nonEmptyString.max(255, 'Name too long').optional(),
  tracking_code: z.string().max(100, 'Tracking code too long').nullable().optional(),
  tracking_link: z.string().url('Invalid URL format').max(500, 'URL too long').nullable().optional(),
  carrier: z.string().max(100, 'Carrier name too long').nullable().optional(),
  status: ShipmentStatus.optional(),
  expected_delivery: z.union([
    z.string().datetime(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    z.null()
  ]).optional(),
  notes: z.string().max(2000, 'Notes too long').nullable().optional()
})

export class ValidationError extends Error {
  public readonly errors: Array<{ field: string; message: string }>

  constructor(message: string, errors: Array<{ field: string; message: string }>) {
    super(message)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

// ─── Welcome / Profile shared schemas ────────────────────────────────────
// Used by /welcome (account + personal tabs), /settings (workspace identity),
// /api/user-preferences, /api/download-env, /api/onboarding/save-env.

// Forbidden in any .env.local value — a newline here would inject a new env var
// into the file. All other chars (quotes, $, backticks, unicode) survive
// `formatEnvValue`'s quote+escape pass in lib/env-file.ts.
const ENV_SAFE_VALUE_RE = /^[^\x00\r\n]*$/
const envSafeMessage = 'Cannot contain newlines or null bytes'

export const welcomeEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address')
  .max(254, 'Email too long (max 254 characters)')

// 18-char min matches Better Auth's configured minLength; 256-char max
// prevents argon2 DoS. CR/LF/null banned for env-file safety; all other
// printable chars (`<`, `>`, `"`, `$`, emoji, etc.) are accepted.
export const adminPasswordSchema = z
  .string()
  .min(18, 'Password must be at least 18 characters')
  .max(256, 'Password too long (max 256 characters)')
  .regex(ENV_SAFE_VALUE_RE, envSafeMessage)

// Reject `<`, `>`, and control chars so stored names/titles/etc. are always
// safe to render and the DB stays clean.
const SAFE_TEXT_RE = /^[^<>\x00-\x1F\x7F]*$/
export const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Too long (max ${max} characters)`)
    .regex(SAFE_TEXT_RE, 'Contains invalid characters (< > or control chars)')

// Blocks `javascript:` / `data:` so a stored URL can never become an XSS
// vector if it's later rendered as a link.
export const httpUrlSchema = z
  .string()
  .trim()
  .max(500, 'URL too long (max 500 characters)')
  .url('Invalid URL')
  .regex(/^https?:\/\//i, 'URL must start with http:// or https://')

export const envSafeString = (max = 5000) =>
  z
    .string()
    .trim()
    .max(max, `Too long (max ${max} characters)`)
    .regex(ENV_SAFE_VALUE_RE, envSafeMessage)

// Single source of truth for the user-preferences profile fields. Consumed by
// /welcome, /settings, and /api/user-preferences — all three stay in lockstep.
export const profileFieldSchemas = {
  name: safeText(255),
  email: welcomeEmailSchema,
  title: safeText(255),
  company_name: safeText(255),
  country: safeText(100),
  city: safeText(100),
  linkedin_url: httpUrlSchema,
} as const
export type ProfileFieldName = keyof typeof profileFieldSchemas

// Coerce empty/whitespace strings to null so the UI can clear a field and the
// server doesn't have to distinguish "never set" from "set to empty string".
export const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    schema.nullable().optional(),
  )

// Env values the /welcome wizard writes. `localSupabaseDetected` is a UI hint,
// not an env value — it lives on the save-request wrapper, not here.
export const welcomeEnvFieldsSchema = z.object({
  betterAuthSecret: envSafeString(200).optional(),
  databaseUrl: envSafeString(2000).optional(),
  supabaseUrl: envSafeString(500).optional(),
  supabaseAnonKey: envSafeString(5000).optional(),
  supabaseSecretKey: envSafeString(5000).optional(),
  adminEmail: welcomeEmailSchema.optional(),
  adminPassword: adminPasswordSchema.optional(),
  resendApiKey: envSafeString(200).optional(),
  resendWebhookSecret: envSafeString(500).optional(),
})
export type WelcomeEnvFieldsInput = z.infer<typeof welcomeEnvFieldsSchema>

export const welcomeEnvSaveRequestSchema = welcomeEnvFieldsSchema.extend({
  localSupabaseDetected: z.boolean().optional(),
})

// Return the first validation error message from a Zod schema, or null if the
// value is valid. Used by forms that want inline per-field error text.
export function firstZodError(schema: z.ZodTypeAny, value: unknown): string | null {
  const result = schema.safeParse(value)
  if (result.success) return null
  return result.error.errors[0]?.message ?? 'Invalid value'
}

// Flatten a ZodError into the compact shape that clients render
// ({ path: 'field.name', message: '...' }[]). Keeps bytes small and
// decouples callers from the full Zod error schema.
export function flattenZodErrors(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
}
