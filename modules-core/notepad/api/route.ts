import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  updateNotepadSchema,
  NotepadStateSchema,
  NotepadRevisionCamelSchema,
} from '@/modules/notepad/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { notepad, notepadRevisions } from '@/lib/db/schema'
import { eq, max, sql, and } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/notepad',
  operationId: 'getNotepad',
  summary: "Fetch the user's notepad content and last-updated timestamp",
  tags: ['notepad'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Notepad content (empty string + null updated_at if not yet saved)', content: { 'application/json': { schema: NotepadStateSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/notepad',
  operationId: 'updateNotepad',
  summary: "Save notepad content (creates a new revision in notepad_revisions)",
  tags: ['notepad'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: updateNotepadSchema } } } },
  responses: {
    200: {
      description: 'The newly inserted revision row (camelCase keys — not snake_cased by this handler)',
      content: { 'application/json': { schema: NotepadRevisionCamelSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
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
