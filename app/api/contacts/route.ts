import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { createContactSchema } from '@/lib/validation'
import { contacts } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'

// GET /api/contacts - Fetch all contacts
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select().from(contacts).orderBy(asc(contacts.name))
    )

    return NextResponse.json(toSnakeCase(data) || [])
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/contacts - Create a new contact
export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, createContactSchema)
    if (!validation.success) {
      return validation.response
    }

    const { contact } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // INSERT requires explicit user_id - RLS validates it
    const data = await withRLS((db) =>
      db.insert(contacts).values({
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        category: contact.category,
        description: contact.description,
        company: contact.company,
        address: contact.address,
        website: contact.website,
        birthday: contact.birthday,
        nextContactDate: contact.next_contact_date,
        userId: user.id,
      }).returning()
    )

    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
