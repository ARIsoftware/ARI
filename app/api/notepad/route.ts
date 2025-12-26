import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { notepad, notepadRevisions } from '@/lib/db/schema'
import { eq, desc, max, sql } from 'drizzle-orm'

const MAX_CONTENT_LENGTH = 2250

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select({ content: notepad.content, updatedAt: notepad.updatedAt })
        .from(notepad)
        .limit(1)
    )

    if (data.length === 0) {
      return NextResponse.json({ content: "", updated_at: null })
    }

    // Map to snake_case for API compatibility
    return NextResponse.json({
      content: data[0].content,
      updated_at: data[0].updatedAt
    })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { content } = body

    // Validate content length
    if (!content || typeof content !== 'string') {
      return createErrorResponse('Content is required', 400)
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return createErrorResponse(`Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`, 400)
    }

    // Get the max revision number for this user (RLS filters automatically)
    const maxRevisionResult = await withRLS((db) =>
      db.select({ maxRevision: max(notepadRevisions.revisionNumber) })
        .from(notepadRevisions)
    )

    const revisionNumber = (maxRevisionResult[0]?.maxRevision || 0) + 1

    // Insert new revision
    const newRevision = await withRLS((db) =>
      db.insert(notepadRevisions)
        .values({
          content,
          userId: user.id,
          revisionNumber
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
      // Update existing notepad (RLS ensures user can only update their own)
      await withRLS((db) =>
        db.update(notepad)
          .set({
            content,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(notepad.id, existingNotepad[0].id))
      )
    } else {
      // Create new notepad
      await withRLS((db) =>
        db.insert(notepad)
          .values({
            content,
            userId: user.id
          })
      )
    }

    return NextResponse.json(newRevision[0])
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
