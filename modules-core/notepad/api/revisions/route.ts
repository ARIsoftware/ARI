import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { notepadRevisions, notepad } from '@/lib/db/schema'
import { eq, desc, max, sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select({
        id: notepadRevisions.id,
        content: notepadRevisions.content,
        created_at: notepadRevisions.createdAt,
        revision_number: notepadRevisions.revisionNumber
      })
      .from(notepadRevisions)
      .orderBy(desc(notepadRevisions.revisionNumber))
    )

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

// POST endpoint to restore a specific revision
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { revision_id } = body

    if (!revision_id) {
      return createErrorResponse('revision_id is required', 400)
    }

    // Fetch the specific revision (RLS filters automatically)
    const revision = await withRLS((db) =>
      db.select({
        content: notepadRevisions.content,
        revisionNumber: notepadRevisions.revisionNumber
      })
      .from(notepadRevisions)
      .where(eq(notepadRevisions.id, revision_id))
      .limit(1)
    )

    if (revision.length === 0) {
      return createErrorResponse('Revision not found', 404)
    }

    // Get the max revision number (replaces RPC call)
    const maxRevisionResult = await withRLS((db) =>
      db.select({ maxRevision: max(notepadRevisions.revisionNumber) })
        .from(notepadRevisions)
    )

    const newRevisionNumber = (maxRevisionResult[0]?.maxRevision || 0) + 1

    // Create a new revision with the restored content
    const newRevision = await withRLS((db) =>
      db.insert(notepadRevisions)
        .values({
          content: revision[0].content,
          userId: user.id,
          revisionNumber: newRevisionNumber
        })
        .returning()
    )

    // Check if notepad exists for this user
    const existingNotepad = await withRLS((db) =>
      db.select({ id: notepad.id })
        .from(notepad)
        .limit(1)
    )

    if (existingNotepad.length > 0) {
      // Update existing notepad
      await withRLS((db) =>
        db.update(notepad)
          .set({
            content: revision[0].content,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(notepad.id, existingNotepad[0].id))
      )
    } else {
      // Create new notepad
      await withRLS((db) =>
        db.insert(notepad)
          .values({
            content: revision[0].content,
            userId: user.id
          })
      )
    }

    return NextResponse.json(toSnakeCase(newRevision[0]))
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
