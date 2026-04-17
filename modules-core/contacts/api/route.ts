import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { createContactSchema } from '@/modules/contacts/lib/validation'
import { contacts } from '@/lib/db/schema'
import { asc, sql } from 'drizzle-orm'

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

// GET /api/contacts - Fetch contacts with pagination
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT), MAX_LIMIT)
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0)

    // RLS automatically filters by user_id
    const [data, countResult] = await withRLS(async (db) => {
      const rows = await db.select().from(contacts).orderBy(asc(contacts.name)).limit(limit).offset(offset)
      const total = await db.select({ count: sql<number>`count(*)::int` }).from(contacts)
      return [rows, total] as const
    })

    return NextResponse.json({
      data: toSnakeCase(data) || [],
      total: countResult[0].count,
      limit,
      offset,
    })
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

    // INSERT requires explicit user_id
    const data = await withRLS((db) =>
      db.insert(contacts)
        .values({ ...contact, userId: user.id })
        .returning()
    )

    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
