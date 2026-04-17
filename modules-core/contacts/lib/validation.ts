import { z } from 'zod'

const nonEmptyString = z.string().min(1, 'Cannot be empty')

export const createContactSchema = z.object({
  contact: z.object({
    name: nonEmptyString.max(255, 'Name too long'),
    email: z.string().email('Invalid email address').max(255, 'Email too long'),
    phone: z.string().max(50, 'Phone too long').nullable().optional(),
    category: z.string().max(50, 'Category too long'),
    description: z.string().max(2000, 'Description too long').nullable().optional(),
    company: z.string().max(255, 'Company name too long').nullable().optional(),
    address: z.string().max(500, 'Address too long').nullable().optional(),
    website: z.string().max(255, 'Website too long').nullable().optional(),
    birthday: z.string().nullable().optional(),
    next_contact_date: z.string().nullable().optional(),
  })
})

export const updateContactSchema = z.object({
  contact: z.object({
    name: nonEmptyString.max(255, 'Name too long').optional(),
    email: z.string().email('Invalid email address').max(255, 'Email too long').optional(),
    phone: z.string().max(50, 'Phone too long').optional(),
    category: z.string().max(50, 'Category too long').optional(),
    description: z.string().max(2000, 'Description too long').nullable().optional(),
    company: z.string().max(255, 'Company name too long').nullable().optional(),
    address: z.string().max(500, 'Address too long').nullable().optional(),
    website: z.string().max(255, 'Website too long').nullable().optional(),
    birthday: z.string().nullable().optional(),
    next_contact_date: z.string().nullable().optional(),
  })
})
