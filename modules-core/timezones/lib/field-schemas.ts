/**
 * Field-level Zod schemas shared between the API and the client forms.
 *
 * Deliberately separate from lib/validation.ts: that file side-effect-imports
 * '@/lib/openapi/registry' to extend Zod with .openapi(), which would drag
 * zod-to-openapi and the registry singleton into the client bundle for any
 * component that just wants to validate a name field. Keeping the raw field
 * rules here lets the add-person form reuse the exact server rule without
 * pulling in the spec machinery.
 */

import { z } from 'zod'
import { safeText } from '@/lib/validation'
import { isValidTimeZone } from './time'

export const NAME_MAX = 100
export const TIMEZONE_MAX = 64

export const personNameSchema = safeText(NAME_MAX).min(1, 'Name is required')

/**
 * An IANA identifier the runtime actually recognises. The length/charset checks
 * run first so a hostile string never reaches Intl, and the Intl check is what
 * guarantees the stored value can be rendered.
 */
export const timeZoneSchema = z
  .string()
  .trim()
  .min(1, 'Time zone is required')
  .max(TIMEZONE_MAX, `Time zone must be ${TIMEZONE_MAX} characters or fewer`)
  .regex(/^[A-Za-z0-9_+\-\/]+$/, 'Time zone must be a valid IANA identifier, e.g. Europe/London')
  .refine(isValidTimeZone, 'Unknown time zone — pick one from the list')
