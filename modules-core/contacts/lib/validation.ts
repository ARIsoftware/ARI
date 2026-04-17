import { z } from 'zod'

// Reject <, >, and control chars to prevent XSS and keep the DB clean
const SAFE_TEXT_RE = /^[^<>\x00-\x1F\x7F]*$/
const safeText = (max: number) =>
  z.string().trim().max(max, `Too long (max ${max} characters)`)
    .regex(SAFE_TEXT_RE, 'Contains invalid characters')

const safeTextOptional = (max: number) =>
  safeText(max).nullable().optional()

// Block javascript: and data: URLs
const safeUrl = z.string().trim().max(255, 'URL too long')
  .regex(/^https?:\/\//i, 'URL must start with http:// or https://')
  .nullable().optional()

export const createContactSchema = z.object({
  contact: z.object({
    name: safeText(255).min(1, 'Name is required'),
    email: z.string().trim().email('Invalid email address').max(255, 'Email too long'),
    phone: z.string().max(50, 'Phone too long').regex(/^[+\d\s\-().]*$/, 'Invalid phone number').nullable().optional(),
    category: safeText(50).min(1, 'Category is required'),
    description: safeTextOptional(2000),
    company: safeTextOptional(255),
    address: safeTextOptional(500),
    website: safeUrl,
    birthday: z.string().nullable().optional(),
    next_contact_date: z.string().nullable().optional(),
  })
})

export const updateContactSchema = z.object({
  contact: z.object({
    name: safeText(255).min(1, 'Name is required').optional(),
    email: z.string().trim().email('Invalid email address').max(255, 'Email too long').optional(),
    phone: z.string().max(50, 'Phone too long').regex(/^[+\d\s\-().]*$/, 'Invalid phone number').nullable().optional(),
    category: safeText(50).optional(),
    description: safeTextOptional(2000),
    company: safeTextOptional(255),
    address: safeTextOptional(500),
    website: safeUrl,
    birthday: z.string().nullable().optional(),
    next_contact_date: z.string().nullable().optional(),
  })
})
