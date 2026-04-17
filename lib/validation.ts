// Shared validation schemas — core app only (welcome, settings, user-preferences).
// Module-specific validation lives inside each module's own lib/validation.ts.
import { z } from 'zod'

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
