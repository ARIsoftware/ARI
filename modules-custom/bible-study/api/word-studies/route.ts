import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  validateRequestBody,
  validateQueryParams,
  createErrorResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import { z } from 'zod'
import { bibleStudyWordStudies } from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'

const CreateWordStudySchema = z.object({
  study_id: z.string().uuid('Invalid study ID'),
  original_word: z.string().min(1, 'Original word is required').max(200, 'Word must be 200 characters or fewer'),
  transliteration: z.string().max(200, 'Transliteration must be 200 characters or fewer').nullable().optional(),
  language: z.enum(['hebrew', 'greek'], { errorMap: () => ({ message: 'Language must be hebrew or greek' }) }),
  meaning: z.string().min(1, 'Meaning is required').max(2000, 'Meaning must be 2000 characters or fewer'),
  context_notes: z.string().max(2000, 'Context notes must be 2000 characters or fewer').nullable().optional(),
})

const ListQuerySchema = z.object({
  study_id: z.string().uuid('Invalid study ID'),
})

const DeleteQuerySchema = z.object({
  id: z.string().uuid('Invalid word study ID'),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, ListQuerySchema)
    if (!queryValidation.success) return queryValidation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const entries = await withRLS((db) =>
      db.select().from(bibleStudyWordStudies)
        .where(and(
          eq(bibleStudyWordStudies.userId, user.id),
          eq(bibleStudyWordStudies.studyId, queryValidation.data.study_id)
        ))
        .orderBy(desc(bibleStudyWordStudies.createdAt))
    )

    return NextResponse.json({ word_studies: toSnakeCase(entries) || [] })
  } catch (error) {
    console.error('GET /api/modules/bible-study/word-studies error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, CreateWordStudySchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const data = await withRLS((db) =>
      db.insert(bibleStudyWordStudies).values({
        userId: user.id,
        studyId: validation.data.study_id,
        originalWord: validation.data.original_word,
        transliteration: validation.data.transliteration ?? null,
        language: validation.data.language,
        meaning: validation.data.meaning,
        contextNotes: validation.data.context_notes ?? null,
      }).returning()
    )

    return NextResponse.json({ word_study: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/bible-study/word-studies error:', error instanceof Error ? error.message : error)
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
      db.delete(bibleStudyWordStudies)
        .where(and(eq(bibleStudyWordStudies.id, queryValidation.data.id), eq(bibleStudyWordStudies.userId, user.id)))
    )

    return NextResponse.json({ success: true, message: 'Word study deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/modules/bible-study/word-studies error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
