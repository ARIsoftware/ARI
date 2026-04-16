import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  validateRequestBody,
  validateQueryParams,
  createErrorResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import { z } from 'zod'
import { bibleStudyPersonal } from '@/lib/db/schema'
import { and, eq, desc, ilike } from 'drizzle-orm'

const CreatePersonalStudySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer'),
  book: z.string().min(1, 'Book of the Bible is required').max(50, 'Book name must be 50 characters or fewer'),
  chapter: z.number().int().min(1, 'Chapter must be at least 1').max(150, 'Chapter must be 150 or less'),
  verse_start: z.number().int().min(1, 'Verse must be at least 1').nullable().optional(),
  verse_end: z.number().int().min(1, 'Verse must be at least 1').nullable().optional(),
  notes: z.string().max(10000, 'Notes must be 10000 characters or fewer').nullable().optional(),
  tags: z.array(z.string().max(50, 'Each tag must be 50 characters or fewer')).max(20, 'Maximum 20 tags').optional(),
})

const UpdatePersonalStudySchema = CreatePersonalStudySchema.extend({
  id: z.string().uuid('Invalid study ID'),
})

const ListQuerySchema = z.object({
  book: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const DeleteQuerySchema = z.object({
  id: z.string().uuid('Invalid study ID'),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, ListQuerySchema)
    if (!queryValidation.success) return queryValidation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const limit = queryValidation.data.limit ?? 100
    const offset = queryValidation.data.offset ?? 0
    const bookFilter = queryValidation.data.book

    const conditions = [eq(bibleStudyPersonal.userId, user.id)]
    if (bookFilter) {
      conditions.push(ilike(bibleStudyPersonal.book, `%${bookFilter}%`))
    }

    const entries = await withRLS((db) =>
      db.select().from(bibleStudyPersonal)
        .where(and(...conditions))
        .orderBy(desc(bibleStudyPersonal.createdAt))
        .limit(limit)
        .offset(offset)
    )

    return NextResponse.json({ studies: toSnakeCase(entries), count: entries.length })
  } catch (error) {
    console.error('GET /api/modules/bible-study/personal-studies error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, CreatePersonalStudySchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const data = await withRLS((db) =>
      db.insert(bibleStudyPersonal).values({
        userId: user.id,
        title: validation.data.title,
        book: validation.data.book,
        chapter: validation.data.chapter,
        verseStart: validation.data.verse_start ?? null,
        verseEnd: validation.data.verse_end ?? null,
        notes: validation.data.notes ?? null,
        tags: validation.data.tags ?? [],
      }).returning()
    )

    return NextResponse.json({ study: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/bible-study/personal-studies error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, UpdatePersonalStudySchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const { id, ...updates } = validation.data
    const data = await withRLS((db) =>
      db.update(bibleStudyPersonal).set({
        title: updates.title,
        book: updates.book,
        chapter: updates.chapter,
        verseStart: updates.verse_start ?? null,
        verseEnd: updates.verse_end ?? null,
        notes: updates.notes ?? null,
        tags: updates.tags ?? [],
        updatedAt: new Date().toISOString(),
      }).where(and(eq(bibleStudyPersonal.id, id), eq(bibleStudyPersonal.userId, user.id)))
        .returning()
    )

    if (data.length === 0) return createErrorResponse('Study not found', 404)
    return NextResponse.json({ study: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PUT /api/modules/bible-study/personal-studies error:', error instanceof Error ? error.message : error)
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
      db.delete(bibleStudyPersonal)
        .where(and(eq(bibleStudyPersonal.id, queryValidation.data.id), eq(bibleStudyPersonal.userId, user.id)))
    )

    return NextResponse.json({ success: true, message: 'Study deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/modules/bible-study/personal-studies error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
