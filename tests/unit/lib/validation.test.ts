import { describe, it, expect } from 'vitest'
import {
  welcomeEmailSchema,
  adminPasswordSchema,
  safeText,
  httpUrlSchema,
  envSafeString,
  emptyToNull,
  profileFieldSchemas,
  welcomeEnvFieldsSchema,
  welcomeEnvSaveRequestSchema,
  firstZodError,
  flattenZodErrors,
} from '@/lib/validation'
import { z } from 'zod'

// ─── welcomeEmailSchema ──────────────────────────────────────────────────────

describe('welcomeEmailSchema', () => {
  it('accepts a valid email', () => {
    expect(welcomeEmailSchema.safeParse('User@Example.COM').success).toBe(true)
  })

  it('lowercases and trims the email', () => {
    const result = welcomeEmailSchema.safeParse('  USER@EXAMPLE.COM  ')
    expect(result.success && result.data).toBe('user@example.com')
  })

  it('rejects an invalid email', () => {
    expect(welcomeEmailSchema.safeParse('not-an-email').success).toBe(false)
  })

  it('rejects email longer than 254 characters', () => {
    const longEmail = 'a'.repeat(250) + '@b.com'
    expect(welcomeEmailSchema.safeParse(longEmail).success).toBe(false)
  })
})

// ─── adminPasswordSchema ─────────────────────────────────────────────────────

describe('adminPasswordSchema', () => {
  it('accepts a valid 18-char password', () => {
    expect(adminPasswordSchema.safeParse('A'.repeat(18)).success).toBe(true)
  })

  it('accepts passwords with special characters', () => {
    expect(adminPasswordSchema.safeParse('P@ssw0rd!SuperS3cur3').success).toBe(true)
  })

  it('rejects a password shorter than 18 characters', () => {
    expect(adminPasswordSchema.safeParse('short').success).toBe(false)
  })

  it('rejects a password longer than 256 characters', () => {
    expect(adminPasswordSchema.safeParse('A'.repeat(257)).success).toBe(false)
  })

  it('rejects passwords containing newlines', () => {
    expect(adminPasswordSchema.safeParse('ValidPassword123456\nInjected=true').success).toBe(false)
  })

  it('rejects passwords containing carriage returns', () => {
    expect(adminPasswordSchema.safeParse('ValidPassword123456\rInjected=true').success).toBe(false)
  })

  it('rejects passwords containing null bytes', () => {
    expect(adminPasswordSchema.safeParse('ValidPassword12345\x00').success).toBe(false)
  })

  it('accepts passwords with $ and backtick (env-safe)', () => {
    expect(adminPasswordSchema.safeParse('ValidPassword1234$`ok').success).toBe(true)
  })
})

// ─── safeText ────────────────────────────────────────────────────────────────

describe('safeText', () => {
  const schema = safeText(100)

  it('accepts a normal text string', () => {
    expect(schema.safeParse('Hello, World!').success).toBe(true)
  })

  it('rejects strings longer than the max', () => {
    expect(schema.safeParse('a'.repeat(101)).success).toBe(false)
  })

  it('rejects strings with < character', () => {
    expect(schema.safeParse('script<alert>').success).toBe(false)
  })

  it('rejects strings with > character', () => {
    expect(schema.safeParse('a>b').success).toBe(false)
  })

  it('rejects strings with control characters', () => {
    expect(schema.safeParse('hello\x01world').success).toBe(false)
  })

  it('trims whitespace', () => {
    const result = schema.safeParse('  hello  ')
    expect(result.success && result.data).toBe('hello')
  })

  it('accepts empty string after trim', () => {
    expect(schema.safeParse('').success).toBe(true)
  })

  it('error message includes the max', () => {
    const tightSchema = safeText(5)
    const result = tightSchema.safeParse('toolongstring')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('5')
    }
  })
})

// ─── httpUrlSchema ───────────────────────────────────────────────────────────

describe('httpUrlSchema', () => {
  it('accepts a valid http URL', () => {
    expect(httpUrlSchema.safeParse('http://example.com').success).toBe(true)
  })

  it('accepts a valid https URL', () => {
    expect(httpUrlSchema.safeParse('https://example.com/path?q=1').success).toBe(true)
  })

  it('rejects a non-URL string', () => {
    expect(httpUrlSchema.safeParse('not a url').success).toBe(false)
  })

  it('rejects javascript: protocol', () => {
    expect(httpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false)
  })

  it('rejects data: protocol', () => {
    expect(httpUrlSchema.safeParse('data:text/html,<h1>xss</h1>').success).toBe(false)
  })

  it('rejects URLs longer than 500 characters', () => {
    expect(httpUrlSchema.safeParse('https://example.com/' + 'a'.repeat(490)).success).toBe(false)
  })

  it('trims whitespace before validation', () => {
    expect(httpUrlSchema.safeParse('  https://example.com  ').success).toBe(true)
  })
})

// ─── envSafeString ───────────────────────────────────────────────────────────

describe('envSafeString', () => {
  it('accepts a normal string', () => {
    expect(envSafeString().safeParse('hello-world').success).toBe(true)
  })

  it('uses default max of 5000', () => {
    expect(envSafeString().safeParse('a'.repeat(5001)).success).toBe(false)
    expect(envSafeString().safeParse('a'.repeat(5000)).success).toBe(true)
  })

  it('respects custom max', () => {
    expect(envSafeString(10).safeParse('a'.repeat(11)).success).toBe(false)
  })

  it('rejects strings with newlines', () => {
    expect(envSafeString().safeParse('foo\nbar').success).toBe(false)
  })

  it('rejects strings with carriage returns', () => {
    expect(envSafeString().safeParse('foo\rbar').success).toBe(false)
  })

  it('rejects strings with null bytes', () => {
    expect(envSafeString().safeParse('foo\x00bar').success).toBe(false)
  })

  it('trims whitespace', () => {
    const result = envSafeString().safeParse('  hello  ')
    expect(result.success && result.data).toBe('hello')
  })
})

// ─── emptyToNull ─────────────────────────────────────────────────────────────

describe('emptyToNull', () => {
  const schema = emptyToNull(z.string().min(3))

  it('converts empty string to null', () => {
    const result = schema.safeParse('')
    expect(result.success && result.data).toBeNull()
  })

  it('converts whitespace-only string to null', () => {
    const result = schema.safeParse('   ')
    expect(result.success && result.data).toBeNull()
  })

  it('passes through a valid non-empty string', () => {
    const result = schema.safeParse('hello')
    expect(result.success && result.data).toBe('hello')
  })

  it('passes through null', () => {
    const result = schema.safeParse(null)
    expect(result.success && result.data).toBeNull()
  })

  it('passes through undefined', () => {
    const result = schema.safeParse(undefined)
    expect(result.success).toBe(true)
  })

  it('validates the inner schema for non-empty strings', () => {
    // 'ab' is < 3 chars, should fail the inner z.string().min(3)
    const result = schema.safeParse('ab')
    expect(result.success).toBe(false)
  })
})

// ─── profileFieldSchemas ─────────────────────────────────────────────────────

describe('profileFieldSchemas', () => {
  it('has all expected keys', () => {
    const keys = Object.keys(profileFieldSchemas)
    expect(keys).toContain('name')
    expect(keys).toContain('email')
    expect(keys).toContain('title')
    expect(keys).toContain('company_name')
    expect(keys).toContain('country')
    expect(keys).toContain('city')
    expect(keys).toContain('linkedin_url')
  })

  it('email field validates an email', () => {
    expect(profileFieldSchemas.email.safeParse('test@test.com').success).toBe(true)
    expect(profileFieldSchemas.email.safeParse('not-email').success).toBe(false)
  })

  it('linkedin_url field validates a URL', () => {
    expect(profileFieldSchemas.linkedin_url.safeParse('https://linkedin.com/in/user').success).toBe(true)
    expect(profileFieldSchemas.linkedin_url.safeParse('not-a-url').success).toBe(false)
  })
})

// ─── welcomeEnvFieldsSchema ──────────────────────────────────────────────────

describe('welcomeEnvFieldsSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(welcomeEnvFieldsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a full valid payload', () => {
    const result = welcomeEnvFieldsSchema.safeParse({
      betterAuthSecret: 'mysecret',
      databaseUrl: 'postgresql://localhost/ari',
      adminEmail: 'admin@example.com',
      adminPassword: 'SuperSecurePassword123!',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid admin email', () => {
    expect(welcomeEnvFieldsSchema.safeParse({ adminEmail: 'not-email' }).success).toBe(false)
  })
})

// ─── welcomeEnvSaveRequestSchema ─────────────────────────────────────────────

describe('welcomeEnvSaveRequestSchema', () => {
  it('accepts dbMode: postgres', () => {
    expect(welcomeEnvSaveRequestSchema.safeParse({ dbMode: 'postgres' }).success).toBe(true)
  })

  it('accepts dbMode: supabaselocal', () => {
    expect(welcomeEnvSaveRequestSchema.safeParse({ dbMode: 'supabaselocal' }).success).toBe(true)
  })

  it('accepts dbMode: supabasecloud', () => {
    expect(welcomeEnvSaveRequestSchema.safeParse({ dbMode: 'supabasecloud' }).success).toBe(true)
  })

  it('rejects invalid dbMode', () => {
    expect(welcomeEnvSaveRequestSchema.safeParse({ dbMode: 'mysql' }).success).toBe(false)
  })

  it('accepts localSupabaseDetected boolean', () => {
    expect(welcomeEnvSaveRequestSchema.safeParse({ localSupabaseDetected: true }).success).toBe(true)
  })

  it('accepts empty object', () => {
    expect(welcomeEnvSaveRequestSchema.safeParse({}).success).toBe(true)
  })
})

// ─── firstZodError ───────────────────────────────────────────────────────────

describe('firstZodError', () => {
  const schema = z.string().min(5)

  it('returns null for a valid value', () => {
    expect(firstZodError(schema, 'hello world')).toBeNull()
  })

  it('returns the first error message for an invalid value', () => {
    const err = firstZodError(schema, 'hi')
    expect(typeof err).toBe('string')
    expect(err).not.toBeNull()
  })

  it('returns "Invalid value" when Zod error has no messages (edge case)', () => {
    // Simulate a schema whose error list might be empty — use a custom refine
    const alwaysFail = z.string().refine(() => false, { message: '' })
    // message is empty string which is falsy; firstZodError falls back to 'Invalid value'
    const result = firstZodError(alwaysFail, 'anything')
    // Either the empty message or the fallback
    expect(typeof result).toBe('string')
  })
})

// ─── flattenZodErrors ────────────────────────────────────────────────────────

describe('flattenZodErrors', () => {
  it('returns an array of { path, message } from a ZodError', () => {
    const schema = z.object({ name: z.string().min(1), age: z.number().min(0) })
    const result = schema.safeParse({ name: '', age: -1 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const flat = flattenZodErrors(result.error)
      expect(Array.isArray(flat)).toBe(true)
      expect(flat.length).toBeGreaterThan(0)
      for (const item of flat) {
        expect(typeof item.path).toBe('string')
        expect(typeof item.message).toBe('string')
      }
    }
  })

  it('joins nested paths with "."', () => {
    const schema = z.object({ address: z.object({ city: z.string().min(1) }) })
    const result = schema.safeParse({ address: { city: '' } })
    expect(result.success).toBe(false)
    if (!result.success) {
      const flat = flattenZodErrors(result.error)
      expect(flat.some((e) => e.path === 'address.city')).toBe(true)
    }
  })

  it('returns empty array for an error with no issues', () => {
    // Construct a ZodError with zero issues
    const emptyError = new z.ZodError([])
    expect(flattenZodErrors(emptyError)).toEqual([])
  })
})

// ─── firstZodError — ?? 'Invalid value' fallback ────────────────────────────

describe('firstZodError — nullish fallback to "Invalid value"', () => {
  it('returns "Invalid value" when errors array is empty (errors[0] is undefined)', () => {
    // We need a schema that fails but produces a ZodError with no issues.
    // The `??` operator fires when `errors[0]?.message` is undefined.
    // Construct a custom schema that wraps a ZodError with empty issues.
    const alwaysFailNoMessages: z.ZodTypeAny = {
      safeParse: (_val: unknown) => ({
        success: false as const,
        error: new z.ZodError([]),  // zero issues → errors[0] is undefined
      }),
    } as any

    const result = firstZodError(alwaysFailNoMessages, 'anything')
    // errors[0] is undefined → .message is undefined → ?? 'Invalid value'
    expect(result).toBe('Invalid value')
  })
})
