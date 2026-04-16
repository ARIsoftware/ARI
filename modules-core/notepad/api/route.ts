import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { notepad, notepadRevisions } from '@/lib/db/schema'
import { eq, max, sql, and } from 'drizzle-orm'

const MAX_CONTENT_LENGTH = 6000

const updateNotepadSchema = z.object({
  content: z.string().max(MAX_CONTENT_LENGTH, `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const data = await withRLS((db) =>
      db.select({ content: notepad.content, updatedAt: notepad.updatedAt })
        .from(notepad)
        .where(eq(notepad.userId, user.id))
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
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, updateNotepadSchema)
    if (!validation.success) {
      return validation.response
    }
    const { content } = validation.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const [maxRevisionResult, existingNotepad] = await Promise.all([
      withRLS((db) =>
        db.select({ maxRevision: max(notepadRevisions.revisionNumber) })
          .from(notepadRevisions)
          .where(eq(notepadRevisions.userId, user.id))
      ),
      withRLS((db) =>
        db.select({ id: notepad.id })
          .from(notepad)
          .where(eq(notepad.userId, user.id))
          .limit(1)
      )
    ])

    const revisionNumber = (maxRevisionResult[0]?.maxRevision ?? 0) + 1

    const [newRevision] = await Promise.all([
      withRLS((db) =>
        db.insert(notepadRevisions)
          .values({
            content,
            userId: user.id,
            revisionNumber
          })
          .returning()
      ),
      existingNotepad.length > 0
        ? withRLS((db) =>
            db.update(notepad)
              .set({
                content,
                updatedAt: sql`timezone('utc'::text, now())`
              })
              .where(and(eq(notepad.id, existingNotepad[0].id), eq(notepad.userId, user.id)))
          )
        : withRLS((db) =>
            db.insert(notepad)
              .values({
                content,
                userId: user.id
              })
          )
    ])

    return NextResponse.json(newRevision[0])
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}
