import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, toSnakeCase } from '@/lib/api-helpers'
import { updateContactSchema } from '@/modules/contacts/lib/validation'
import { contacts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// GET /api/contacts/[id] - Get a specific contact
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select()
        .from(contacts)
        .where(eq(contacts.id, id))
        .limit(1)
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/contacts/[id] - Update a contact
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const validation = await validateRequestBody(request, updateContactSchema)
    if (!validation.success) return validation.response
    const { contact: updates } = validation.data

    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // RLS automatically ensures user can only update their own contacts
    const data = await withRLS((db) =>
      db.update(contacts)
        .set({ ...updates, updatedAt: new Date().toISOString() })
        .where(eq(contacts.id, id))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/contacts/[id] - Delete a contact
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // RLS automatically ensures user can only delete their own contacts
    await withRLS((db) =>
      db.delete(contacts).where(eq(contacts.id, id))
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
