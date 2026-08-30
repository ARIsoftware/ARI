import { z } from 'zod'
import '@/lib/openapi/registry'
import { personNameSchema, timeZoneSchema } from './field-schemas'

export { NAME_MAX, personNameSchema, timeZoneSchema } from './field-schemas'

export const createPersonSchema = z
  .object({
    name: personNameSchema,
    timezone: timeZoneSchema,
  })
  .openapi('TimezonesCreatePersonBody')

export const updatePersonSchema = z
  .object({
    name: personNameSchema.optional(),
    timezone: timeZoneSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.timezone !== undefined, {
    message: 'Provide a name or a time zone to update',
  })
  .openapi('TimezonesUpdatePersonBody')

export const personIdParamSchema = z
  .object({
    id: z.string().uuid('Invalid person id format'),
  })
  .openapi('TimezonesPersonIdParam')

export const TimezonePersonSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string(),
    name: z.string(),
    timezone: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('TimezonesPerson')

export const PersonListResponseSchema = z
  .object({
    people: z.array(TimezonePersonSchema),
    count: z.number().int().nonnegative(),
  })
  .openapi('TimezonesPersonListResponse')

export const PersonSingleResponseSchema = z
  .object({
    person: TimezonePersonSchema,
  })
  .openapi('TimezonesPersonSingleResponse')

export const PersonDeleteResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
  })
  .openapi('TimezonesPersonDeleteResponse')

export const TimezonesSettingsSchema = z
  .object({
    homeTimezone: timeZoneSchema.optional(),
  })
  .strict()
  .openapi('TimezonesSettings')

export const SettingsSavedSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi('TimezonesSettingsSaved')
