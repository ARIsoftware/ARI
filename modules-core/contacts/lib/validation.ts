import { z } from 'zod'
import '@/lib/openapi/registry'

const SAFE_TEXT_RE = /^[^<>\x00-\x1F\x7F]*$/
const safeText = (max: number) =>
  z.string().trim().max(max, `Too long (max ${max} characters)`)
    .regex(SAFE_TEXT_RE, 'Contains invalid characters')

const safeTextOptional = (max: number) =>
  safeText(max).nullable().optional()

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
}).openapi('CreateContactBody')

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
}).openapi('UpdateContactBody')

export const ContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  category: z.string(),
  description: z.string().nullable(),
  company: z.string().nullable(),
  address: z.string().nullable(),
  website: z.string().nullable(),
  birthday: z.string().nullable(),
  next_contact_date: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  user_id: z.string(),
}).openapi('Contact')

export const ContactListResponseSchema = z.object({
  data: z.array(ContactSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().min(1),
  offset: z.number().int().nonnegative(),
}).openapi('ContactListResponse')

export const ContactQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const ContactIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const DeleteSuccessSchema = z.object({
  success: z.literal(true),
}).openapi('DeleteSuccess')
