import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { quotes } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const rows = await withRLS((db) =>
      db.select({ id: quotes.id, quote: quotes.quote, author: quotes.author })
        .from(quotes)
        .orderBy(sql`random()`)
        .limit(1)
    )

    return NextResponse.json(rows[0] ?? null)
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}
