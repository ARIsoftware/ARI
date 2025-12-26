import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { winterArcGoals } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params

    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { completed } = body

    if (typeof completed !== 'boolean') {
      return NextResponse.json({ error: 'Completed must be a boolean' }, { status: 400 })
    }

    // RLS automatically ensures user can only update their own goals
    const data = await withRLS((db) =>
      db.update(winterArcGoals)
        .set({ completed })
        .where(eq(winterArcGoals.id, id))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (error: any) {
    console.error('Error in PATCH /api/winter-arc-goals/[id]:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params

    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically ensures user can only delete their own goals
    await withRLS((db) =>
      db.delete(winterArcGoals).where(eq(winterArcGoals.id, id))
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/winter-arc-goals/[id]:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
