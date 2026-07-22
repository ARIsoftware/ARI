import { describe, it, expect } from 'vitest'
import {
  createContactSchema,
  updateContactSchema,
  ContactSchema,
  ContactListResponseSchema,
  ContactQuerySchema,
  ContactIdParamSchema,
  DeleteSuccessSchema,
} from '@/modules-core/contacts/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

// ─── createContactSchema ──────────────────────────────────────────────────────

describe('createContactSchema', () => {
  const validContact = {
    name: 'Alice Smith',
    email: 'alice@example.com',
    category: 'Friend',
  }

  it('accepts minimal valid contact', () => {
    expect(createContactSchema.safeParse({ contact: validContact }).success).toBe(true)
  })

  it('accepts fully populated contact', () => {
    const full = {
      name: 'Bob',
      email: 'bob@example.com',
      phone: '+1 (555) 123-4567',
      category: 'Work',
      description: 'A colleague',
      company: 'Acme Corp',
      address: '123 Main St',
      website: 'https://example.com',
      birthday: '1990-01-01',
      next_contact_date: '2025-06-01',
    }
    expect(createContactSchema.safeParse({ contact: full }).success).toBe(true)
  })

  // name
  it('rejects empty name', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, name: '' } }).success).toBe(false)
  })

  it('rejects name exceeding 255 chars', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, name: 'a'.repeat(256) } }).success).toBe(false)
  })

  it('rejects name with < character (safe text)', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, name: 'Alice<script>' } }).success).toBe(false)
  })

  it('rejects name with > character (safe text)', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, name: 'A>B' } }).success).toBe(false)
  })

  // email
  it('rejects invalid email', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, email: 'not-an-email' } }).success).toBe(false)
  })

  it('rejects email exceeding 255 chars', () => {
    const longEmail = 'a'.repeat(251) + '@x.co'
    expect(createContactSchema.safeParse({ contact: { ...validContact, email: longEmail } }).success).toBe(false)
  })

  it('rejects missing email', () => {
    const { email: _, ...noEmail } = validContact
    expect(createContactSchema.safeParse({ contact: noEmail }).success).toBe(false)
  })

  // phone
  it('accepts null phone', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, phone: null } }).success).toBe(true)
  })

  it('accepts valid phone', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, phone: '+1-800-555-0100' } }).success).toBe(true)
  })

  it('rejects phone with letters', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, phone: 'callme' } }).success).toBe(false)
  })

  it('rejects phone exceeding 50 chars', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, phone: '+1'.repeat(30) } }).success).toBe(false)
  })

  // category
  it('rejects empty category', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, category: '' } }).success).toBe(false)
  })

  it('rejects category exceeding 50 chars', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, category: 'a'.repeat(51) } }).success).toBe(false)
  })

  // description
  it('accepts null description', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, description: null } }).success).toBe(true)
  })

  it('rejects description exceeding 2000 chars', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, description: 'x'.repeat(2001) } }).success).toBe(false)
  })

  // company
  it('accepts null company', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, company: null } }).success).toBe(true)
  })

  it('rejects company exceeding 255 chars', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, company: 'a'.repeat(256) } }).success).toBe(false)
  })

  // address
  it('accepts null address', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, address: null } }).success).toBe(true)
  })

  it('rejects address exceeding 500 chars', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, address: 'a'.repeat(501) } }).success).toBe(false)
  })

  // website
  it('accepts null website', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, website: null } }).success).toBe(true)
  })

  it('accepts valid https website', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, website: 'https://example.com' } }).success).toBe(true)
  })

  it('accepts valid http website', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, website: 'http://example.com' } }).success).toBe(true)
  })

  it('rejects website without http/https prefix', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, website: 'ftp://example.com' } }).success).toBe(false)
  })

  it('rejects website exceeding 255 chars', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, website: 'https://' + 'a'.repeat(250) + '.com' } }).success).toBe(false)
  })

  // birthday / next_contact_date
  it('accepts string birthday', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, birthday: '1990-05-15' } }).success).toBe(true)
  })

  it('accepts null birthday', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, birthday: null } }).success).toBe(true)
  })

  it('accepts null next_contact_date', () => {
    expect(createContactSchema.safeParse({ contact: { ...validContact, next_contact_date: null } }).success).toBe(true)
  })
})

// ─── updateContactSchema ──────────────────────────────────────────────────────

describe('updateContactSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(updateContactSchema.safeParse({ contact: {} }).success).toBe(true)
  })

  it('accepts partial update with just name', () => {
    expect(updateContactSchema.safeParse({ contact: { name: 'Bob' } }).success).toBe(true)
  })

  it('accepts partial update with just email', () => {
    expect(updateContactSchema.safeParse({ contact: { email: 'bob@example.com' } }).success).toBe(true)
  })

  it('rejects name with control characters', () => {
    expect(updateContactSchema.safeParse({ contact: { name: 'bad\x01name' } }).success).toBe(false)
  })

  it('rejects invalid email when provided', () => {
    expect(updateContactSchema.safeParse({ contact: { email: 'bad-email' } }).success).toBe(false)
  })

  it('rejects phone with letters when provided', () => {
    expect(updateContactSchema.safeParse({ contact: { phone: 'abc' } }).success).toBe(false)
  })

  it('rejects invalid website when provided', () => {
    expect(updateContactSchema.safeParse({ contact: { website: 'not-a-url' } }).success).toBe(false)
  })
})

// ─── ContactSchema ────────────────────────────────────────────────────────────

describe('ContactSchema', () => {
  const valid = {
    id: VALID_UUID,
    name: 'Alice',
    email: 'alice@example.com',
    phone: null,
    category: 'Friend',
    description: null,
    company: null,
    address: null,
    website: null,
    birthday: null,
    next_contact_date: null,
    created_at: null,
    updated_at: null,
    user_id: 'user1',
  }

  it('accepts valid contact', () => {
    expect(ContactSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(ContactSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })

  it('rejects invalid email', () => {
    expect(ContactSchema.safeParse({ ...valid, email: 'bad' }).success).toBe(false)
  })
})

// ─── ContactListResponseSchema ────────────────────────────────────────────────

describe('ContactListResponseSchema', () => {
  it('accepts valid list response', () => {
    expect(ContactListResponseSchema.safeParse({ data: [], total: 0, limit: 1, offset: 0 }).success).toBe(true)
  })

  it('rejects negative total', () => {
    expect(ContactListResponseSchema.safeParse({ data: [], total: -1, limit: 1, offset: 0 }).success).toBe(false)
  })

  it('rejects limit less than 1', () => {
    expect(ContactListResponseSchema.safeParse({ data: [], total: 0, limit: 0, offset: 0 }).success).toBe(false)
  })

  it('rejects negative offset', () => {
    expect(ContactListResponseSchema.safeParse({ data: [], total: 0, limit: 1, offset: -1 }).success).toBe(false)
  })
})

// ─── ContactQuerySchema ───────────────────────────────────────────────────────

describe('ContactQuerySchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(ContactQuerySchema.safeParse({}).success).toBe(true)
  })

  it('coerces string limit to number', () => {
    const result = ContactQuerySchema.parse({ limit: '20' })
    expect(result.limit).toBe(20)
  })

  it('coerces string offset to number', () => {
    const result = ContactQuerySchema.parse({ offset: '5' })
    expect(result.offset).toBe(5)
  })

  it('rejects limit less than 1', () => {
    expect(ContactQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('rejects limit greater than 200', () => {
    expect(ContactQuerySchema.safeParse({ limit: 201 }).success).toBe(false)
  })

  it('rejects negative offset', () => {
    expect(ContactQuerySchema.safeParse({ offset: -1 }).success).toBe(false)
  })
})

// ─── ContactIdParamSchema ─────────────────────────────────────────────────────

describe('ContactIdParamSchema', () => {
  it('accepts valid UUID', () => {
    expect(ContactIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(ContactIdParamSchema.safeParse({ id: 'not-uuid' }).success).toBe(false)
  })
})

// ─── DeleteSuccessSchema ──────────────────────────────────────────────────────

describe('DeleteSuccessSchema', () => {
  it('accepts { success: true }', () => {
    expect(DeleteSuccessSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(DeleteSuccessSchema.safeParse({ success: false }).success).toBe(false)
  })
})
