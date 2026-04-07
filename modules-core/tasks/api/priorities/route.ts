import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { calculatePriorityScore } from '@/modules/tasks/lib/priority-utils'
import { z } from 'zod'
import { tasks } from '@/lib/db/schema'
import { eq, desc, and, inArray } from 'drizzle-orm'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'

const updatePrioritiesSchema = z.object({
  taskId: z.string().uuid(),
  axes: z.object({
    impact: z.number().min(1).max(5),
    severity: z.number().min(1).max(5),
    timeliness: z.number().min(1).max(5),
    effort: z.number().min(1).max(5),
    strategic_fit: z.number().min(1).max(5)
  })
})

const batchPrioritiesSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(500),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const data = await withRLS((db) =>
      db.select().from(tasks).where(eq(tasks.userId, user.id)).orderBy(desc(tasks.priorityScore))
    )

    return NextResponse.json(toSnakeCase(data))
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const validation = await validateRequestBody(request, updatePrioritiesSchema)
    if (!validation.success) {
      return validation.response
    }
    const { taskId, axes } = validation.data

    // Calculate priority score
    const priorityScore = calculatePriorityScore(axes)

    // Update task with new axes and calculated score
    const data = await withRLS((db) =>
      db.update(tasks)
        .set({
          impact: axes.impact,
          severity: axes.severity,
          timeliness: axes.timeliness,
          effort: axes.effort,
          strategicFit: axes.strategic_fit,
          priorityScore: String(priorityScore),
          updatedAt: new Date().toISOString()
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Task not found or update failed' }, { status: 404 })
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Batch update multiple tasks
export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, batchPrioritiesSchema)
    if (!validation.success) {
      return validation.response
    }
    const { taskIds } = validation.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Fetch all tasks in one query, then recompute scores in memory.
    const updatedAt = new Date().toISOString()
    const updates = await withRLS(async (db) => {
      const rows = await db
        .select({
          id: tasks.id,
          impact: tasks.impact,
          severity: tasks.severity,
          timeliness: tasks.timeliness,
          effort: tasks.effort,
          strategicFit: tasks.strategicFit,
        })
        .from(tasks)
        .where(and(inArray(tasks.id, taskIds), eq(tasks.userId, user.id)))

      return Promise.all(
        rows.map(async (row) => {
          const priorityScore = calculatePriorityScore({
            impact: row.impact ?? 3,
            severity: row.severity ?? 3,
            timeliness: row.timeliness ?? 3,
            effort: row.effort ?? 3,
            strategic_fit: row.strategicFit ?? 3,
          })
          await db
            .update(tasks)
            .set({ priorityScore: String(priorityScore), updatedAt })
            .where(and(eq(tasks.id, row.id), eq(tasks.userId, user.id)))
          return { taskId: row.id, priorityScore }
        })
      )
    })

    return NextResponse.json({ updated: updates.length, tasks: updates })
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}
