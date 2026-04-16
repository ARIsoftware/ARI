import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { notepadRevisions, notepad } from '@/lib/db/schema'
import { and, eq, desc, max, sql } from 'drizzle-orm'

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const restoreSchema = z.object({
  revision_id: z.string().uuid('Invalid revision id format'),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, listQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }
    const limit = queryValidation.data.limit ?? 50
    const offset = queryValidation.data.offset ?? 0

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const data = await withRLS((db) =>
      db.select({
        id: notepadRevisions.id,
        content: notepadRevisions.content,
        created_at: notepadRevisions.createdAt,
        revision_number: notepadRevisions.revisionNumber
      })
      .from(notepadRevisions)
      .where(eq(notepadRevisions.userId, user.id))
      .orderBy(desc(notepadRevisions.revisionNumber))
      .limit(limit)
      .offset(offset)
    )

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}

// POST endpoint to restore a specific revision
export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, restoreSchema)
    if (!validation.success) {
      return validation.response
    }
    const { revision_id } = validation.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const revision = await withRLS((db) =>
      db.select({
        content: notepadRevisions.content,
        revisionNumber: notepadRevisions.revisionNumber
      })
      .from(notepadRevisions)
      .where(and(eq(notepadRevisions.id, revision_id), eq(notepadRevisions.userId, user.id)))
      .limit(1)
    )

    if (revision.length === 0) {
      return createErrorResponse('Revision not found', 404)
    }

    const maxRevisionResult = await withRLS((db) =>
      db.select({ maxRevision: max(notepadRevisions.revisionNumber) })
        .from(notepadRevisions)
        .where(eq(notepadRevisions.userId, user.id))
    )

    const newRevisionNumber = (maxRevisionResult[0]?.maxRevision ?? 0) + 1

    const newRevision = await withRLS((db) =>
      db.insert(notepadRevisions)
        .values({
          content: revision[0].content,
          userId: user.id,
          revisionNumber: newRevisionNumber
        })
        .returning()
    )

    const existingNotepad = await withRLS((db) =>
      db.select({ id: notepad.id })
        .from(notepad)
        .where(eq(notepad.userId, user.id))
        .limit(1)
    )

    if (existingNotepad.length > 0) {
      await withRLS((db) =>
        db.update(notepad)
          .set({
            content: revision[0].content,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(and(eq(notepad.id, existingNotepad[0].id), eq(notepad.userId, user.id)))
      )
    } else {
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
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}
