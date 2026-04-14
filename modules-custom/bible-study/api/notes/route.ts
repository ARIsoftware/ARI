import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  validateRequestBody,
  validateQueryParams,
  createErrorResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import { z } from 'zod'
import { bibleStudyNotes } from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'

const CreateNoteSchema = z.object({
  bible_version: z.string().min(1).max(20).optional(),
  book: z.string().min(1).max(50),
  chapter: z.number().int().min(1).max(150),
  verse_start: z.number().int().min(1).nullable().optional(),
  verse_end: z.number().int().min(1).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  content: z.string().max(20000),
})

const UpdateNoteSchema = CreateNoteSchema.extend({
  id: z.string().uuid('Invalid note ID'),
})

const ListQuerySchema = z.object({
  book: z.string().optional(),
  chapter: z.coerce.number().int().min(1).optional(),
  verse_start: z.coerce.number().int().min(1).optional(),
  verse_end: z.coerce.number().int().min(1).optional(),
  bible_version: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const DeleteQuerySchema = z.object({
  id: z.string().uuid('Invalid note ID'),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, ListQuerySchema)
    if (!queryValidation.success) return queryValidation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const { book, chapter, bible_version, limit = 200, offset = 0 } = queryValidation.data

    const conditions = [eq(bibleStudyNotes.userId, user.id)]
    if (book) conditions.push(eq(bibleStudyNotes.book, book))
    if (chapter) conditions.push(eq(bibleStudyNotes.chapter, chapter))
    if (bible_version) conditions.push(eq(bibleStudyNotes.bibleVersion, bible_version))

    const entries = await withRLS((db) =>
      db.select().from(bibleStudyNotes)
        .where(and(...conditions))
        .orderBy(desc(bibleStudyNotes.createdAt))
        .limit(limit)
        .offset(offset)
    )

    return NextResponse.json({ notes: toSnakeCase(entries) || [], count: entries?.length || 0 })
  } catch (error) {
    console.error('GET /api/modules/bible-study/notes error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, CreateNoteSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const data = await withRLS((db) =>
      db.insert(bibleStudyNotes).values({
        userId: user.id,
        bibleVersion: validation.data.bible_version ?? 'ESV',
        book: validation.data.book,
        chapter: validation.data.chapter,
        verseStart: validation.data.verse_start ?? null,
        verseEnd: validation.data.verse_end ?? null,
        title: validation.data.title ?? null,
        content: validation.data.content,
      }).returning()
    )

    return NextResponse.json({ note: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/bible-study/notes error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, UpdateNoteSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const { id, ...updates } = validation.data
    const data = await withRLS((db) =>
      db.update(bibleStudyNotes).set({
        bibleVersion: updates.bible_version ?? 'ESV',
        book: updates.book,
        chapter: updates.chapter,
        verseStart: updates.verse_start ?? null,
        verseEnd: updates.verse_end ?? null,
        title: updates.title ?? null,
        content: updates.content,
        updatedAt: new Date().toISOString(),
      }).where(and(eq(bibleStudyNotes.id, id), eq(bibleStudyNotes.userId, user.id)))
        .returning()
    )

    if (data.length === 0) return createErrorResponse('Note not found', 404)
    return NextResponse.json({ note: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PUT /api/modules/bible-study/notes error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, DeleteQuerySchema)
    if (!queryValidation.success) return queryValidation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    await withRLS((db) =>
      db.delete(bibleStudyNotes)
        .where(and(eq(bibleStudyNotes.id, queryValidation.data.id), eq(bibleStudyNotes.userId, user.id)))
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/bible-study/notes error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
