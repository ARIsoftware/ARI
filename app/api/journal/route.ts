import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { journal } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entryType = searchParams.get('entry_type') || 'winter_arc'

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select()
        .from(journal)
        .where(eq(journal.entryType, entryType))
        .orderBy(desc(journal.createdAt))
        .limit(1)
    )

    return NextResponse.json(data.length > 0 ? toSnakeCase(data[0]) : null)
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { entry } = await request.json()
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const entryType = entry.entry_type || 'winter_arc'

    // Check if entry already exists for this user (RLS filters automatically)
    const existingEntry = await withRLS((db) =>
      db.select({ id: journal.id })
        .from(journal)
        .where(eq(journal.entryType, entryType))
        .limit(1)
    )

    if (existingEntry.length > 0) {
      // Update existing entry
      const data = await withRLS((db) =>
        db.update(journal)
          .set({
            limitingThoughts: entry.limiting_thoughts,
            barrierBehaviors: entry.barrier_behaviors,
            stuckEmotions: entry.stuck_emotions,
            empoweringThoughts: entry.empowering_thoughts,
            dailyBehaviors: entry.daily_behaviors,
            reinforcementPractices: entry.reinforcement_practices,
            futureFeelings: entry.future_feelings,
            embodyNow: entry.embody_now,
            dailyActions: entry.daily_actions,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(journal.id, existingEntry[0].id))
          .returning()
      )

      return NextResponse.json(toSnakeCase(data[0]))
    } else {
      // Create new entry
      const data = await withRLS((db) =>
        db.insert(journal)
          .values({
            userId: user.id,
            entryType: entryType,
            limitingThoughts: entry.limiting_thoughts,
            barrierBehaviors: entry.barrier_behaviors,
            stuckEmotions: entry.stuck_emotions,
            empoweringThoughts: entry.empowering_thoughts,
            dailyBehaviors: entry.daily_behaviors,
            reinforcementPractices: entry.reinforcement_practices,
            futureFeelings: entry.future_feelings,
            embodyNow: entry.embody_now,
            dailyActions: entry.daily_actions,
          })
          .returning()
      )

      return NextResponse.json(toSnakeCase(data[0]))
    }
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
