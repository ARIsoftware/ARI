import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { tasks } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select({ title: tasks.title, updatedAt: tasks.updatedAt })
        .from(tasks)
        .where(eq(tasks.completed, true))
        .orderBy(desc(tasks.updatedAt))
        .limit(1)
    )

    if (data.length === 0) {
      return NextResponse.json(null)
    }

    // Map to snake_case for API compatibility
    return NextResponse.json({
      title: data[0].title,
      updated_at: data[0].updatedAt
    })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
