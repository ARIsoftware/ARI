import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { calculatePriorityScore } from '../../lib/priority-utils'
import { z } from 'zod'
import { tasks } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'

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
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const validation = updatePrioritiesSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid request data',
        details: validation.error.errors
      }, { status: 400 })
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
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Batch update multiple tasks
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { taskIds } = body

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: 'Invalid task IDs' }, { status: 400 })
    }

    // Recalculate priority scores for all specified tasks
    const updates = []
    for (const taskId of taskIds) {
      // Fetch current task data
      const taskData = await withRLS((db) =>
        db.select({
          impact: tasks.impact,
          severity: tasks.severity,
          timeliness: tasks.timeliness,
          effort: tasks.effort,
          strategicFit: tasks.strategicFit
        })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
        .limit(1)
      )

      if (taskData.length === 0) continue

      const task = taskData[0]
      const axes = {
        impact: task.impact || 3,
        severity: task.severity || 3,
        timeliness: task.timeliness || 3,
        effort: task.effort || 3,
        strategic_fit: task.strategicFit || 3
      }

      const priorityScore = calculatePriorityScore(axes)

      await withRLS((db) =>
        db.update(tasks)
          .set({
            priorityScore: String(priorityScore),
            updatedAt: new Date().toISOString()
          })
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
      )

      updates.push({ taskId, priorityScore })
    }

    return NextResponse.json({ updated: updates.length, tasks: updates })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
