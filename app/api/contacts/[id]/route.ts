import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { contacts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'

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
      db.select().from(contacts).where(eq(contacts.id, id)).limit(1)
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
    const updates = await request.json()
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Map snake_case from request to camelCase for Drizzle
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.email !== undefined) updateData.email = updates.email
    if (updates.phone !== undefined) updateData.phone = updates.phone
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.company !== undefined) updateData.company = updates.company
    if (updates.address !== undefined) updateData.address = updates.address
    if (updates.website !== undefined) updateData.website = updates.website
    if (updates.birthday !== undefined) updateData.birthday = updates.birthday
    if (updates.next_contact_date !== undefined) updateData.nextContactDate = updates.next_contact_date

    // RLS automatically ensures user can only update their own contacts
    const data = await withRLS((db) =>
      db.update(contacts).set(updateData).where(eq(contacts.id, id)).returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Contact not found or update failed' }, { status: 404 })
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
