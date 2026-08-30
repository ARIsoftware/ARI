/**
 * Tests for modules-core/timezones/lib/validation.ts and field-schemas.ts —
 * the person/time-zone Zod rules shared by the API and the client forms.
 */
import { describe, it, expect } from 'vitest'
import {
  NAME_MAX,
  personNameSchema,
  timeZoneSchema,
} from '@/modules-core/timezones/lib/field-schemas'
import {
  createPersonSchema,
  updatePersonSchema,
  personIdParamSchema,
  TimezonesSettingsSchema,
  PersonDeleteResponseSchema,
} from '@/modules-core/timezones/lib/validation'

describe('personNameSchema', () => {
  it('accepts a plain name and rejects empty / oversized / markup', () => {
    expect(personNameSchema.safeParse('Ada Lovelace').success).toBe(true)
    expect(personNameSchema.safeParse('').success).toBe(false)
    expect(personNameSchema.safeParse('a'.repeat(NAME_MAX + 1)).success).toBe(false)
    // safeText rejects angle brackets (XSS guard)
    expect(personNameSchema.safeParse('<script>').success).toBe(false)
  })
})

describe('timeZoneSchema', () => {
  it('accepts real IANA identifiers', () => {
    expect(timeZoneSchema.safeParse('Europe/London').success).toBe(true)
    expect(timeZoneSchema.safeParse('America/Argentina/Buenos_Aires').success).toBe(true)
    expect(timeZoneSchema.safeParse('UTC').success).toBe(true)
  })

  it('rejects empty, oversized, bad-charset, and unknown zones', () => {
    expect(timeZoneSchema.safeParse('').success).toBe(false)
    expect(timeZoneSchema.safeParse('x'.repeat(65)).success).toBe(false)
    expect(timeZoneSchema.safeParse('Europe London').success).toBe(false) // space fails regex
    expect(timeZoneSchema.safeParse('Not/A_Zone').success).toBe(false) // passes regex, fails Intl
  })

  it('trims surrounding whitespace before validating', () => {
    const parsed = timeZoneSchema.safeParse('  Asia/Tokyo  ')
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toBe('Asia/Tokyo')
  })
})

describe('createPersonSchema', () => {
  it('requires both name and timezone', () => {
    expect(createPersonSchema.safeParse({ name: 'Ada', timezone: 'Europe/London' }).success).toBe(true)
    expect(createPersonSchema.safeParse({ name: 'Ada' }).success).toBe(false)
    expect(createPersonSchema.safeParse({ timezone: 'Europe/London' }).success).toBe(false)
  })
})

describe('updatePersonSchema', () => {
  it('accepts either field alone but not an empty update', () => {
    expect(updatePersonSchema.safeParse({ name: 'Grace' }).success).toBe(true)
    expect(updatePersonSchema.safeParse({ timezone: 'Asia/Tokyo' }).success).toBe(true)
    expect(updatePersonSchema.safeParse({}).success).toBe(false)
  })
})

describe('personIdParamSchema', () => {
  it('requires a UUID', () => {
    expect(personIdParamSchema.safeParse({ id: 'b6f8f5c2-4b7e-4e4e-9a52-1f2d3c4b5a69' }).success).toBe(true)
    expect(personIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('TimezonesSettingsSchema', () => {
  it('accepts an optional home zone and rejects unknown keys (strict)', () => {
    expect(TimezonesSettingsSchema.safeParse({}).success).toBe(true)
    expect(TimezonesSettingsSchema.safeParse({ homeTimezone: 'Europe/Paris' }).success).toBe(true)
    expect(TimezonesSettingsSchema.safeParse({ homeTimezone: 'Nope/Nope' }).success).toBe(false)
    expect(TimezonesSettingsSchema.safeParse({ extra: true }).success).toBe(false)
  })
})

describe('PersonDeleteResponseSchema', () => {
  it('requires the literal success flag', () => {
    expect(PersonDeleteResponseSchema.safeParse({ success: true, message: 'ok' }).success).toBe(true)
    expect(PersonDeleteResponseSchema.safeParse({ success: false, message: 'ok' }).success).toBe(false)
  })
})
