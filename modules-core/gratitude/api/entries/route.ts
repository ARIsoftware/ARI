/**
 * Gratitude Module - Entries API Routes
 *
 * Endpoints:
 * - GET    /api/modules/gratitude/entries?date=YYYY-MM-DD  - Get entry for a date
 * - POST   /api/modules/gratitude/entries                   - Create or update entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { gratitudeEntries } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

/**
 * Validation Schema for POST requests
 */
const SaveEntrySchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  question1: z.string().nullable().optional(),
  question2: z.string().nullable().optional(),
  question3: z.string().nullable().optional(),
  question4: z.string().nullable().optional(),
  question5: z.string().nullable().optional(),
})

/**
 * GET Handler - Fetch entry for a specific date
 *
 * Authentication: Required (Bearer token)
 * Query Params: date (YYYY-MM-DD)
 * Returns: { entry: GratitudeEntry | null }
 */
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Get date from query params
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      )
    }

    // Query database for entry on this date (RLS filters automatically)
    const data = await withRLS((db) =>
      db.select()
        .from(gratitudeEntries)
        .where(eq(gratitudeEntries.entryDate, date))
        .limit(1)
    )

    return NextResponse.json({
      entry: data.length > 0 ? toSnakeCase(data[0]) : null
    })

  } catch (error) {
    console.error('GET /api/modules/gratitude/entries error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Create or update entry for a date (upsert)
 *
 * Authentication: Required (Bearer token)
 * Body: { entry_date: string, question1?: string, ... }
 * Returns: { entry: GratitudeEntry }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = SaveEntrySchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { entry_date, question1, question2, question3, question4, question5 } = parseResult.data

    // Check if entry exists for this date (RLS filters automatically)
    const existing = await withRLS((db) =>
      db.select({ id: gratitudeEntries.id })
        .from(gratitudeEntries)
        .where(eq(gratitudeEntries.entryDate, entry_date))
        .limit(1)
    )

    let entry
    if (existing.length > 0) {
      // Update existing entry
      const updated = await withRLS((db) =>
        db.update(gratitudeEntries)
          .set({
            question1: question1 || null,
            question2: question2 || null,
            question3: question3 || null,
            question4: question4 || null,
            question5: question5 || null,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(gratitudeEntries.id, existing[0].id))
          .returning()
      )
      entry = updated[0]
    } else {
      // Insert new entry
      const inserted = await withRLS((db) =>
        db.insert(gratitudeEntries)
          .values({
            userId: user.id,
            entryDate: entry_date,
            question1: question1 || null,
            question2: question2 || null,
            question3: question3 || null,
            question4: question4 || null,
            question5: question5 || null,
          })
          .returning()
      )
      entry = inserted[0]
    }

    return NextResponse.json(
      { entry: toSnakeCase(entry) },
      { status: 200 }
    )

  } catch (error) {
    console.error('POST /api/modules/gratitude/entries error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
