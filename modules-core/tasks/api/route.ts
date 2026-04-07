import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { createTaskSchema, updateTaskSchema, uuidParamSchema } from '@/lib/validation'
import { calculatePriorityScore } from '@/modules/tasks/lib/priority-utils'
import { z } from 'zod'
import { tasks } from '@/lib/db/schema'
import { desc, eq, asc, sql, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const data = await withRLS((db) =>
      db.select().from(tasks).where(eq(tasks.userId, user.id)).orderBy(asc(tasks.orderIndex))
    )

    // Transform camelCase to snake_case for backward compatibility
    return NextResponse.json(toSnakeCase(data))
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, createTaskSchema)
    if (!validation.success) {
      return validation.response
    }

    const { task } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Get the highest order_index for this user
    const maxOrderData = await withRLS((db) =>
      db.select({ orderIndex: tasks.orderIndex })
        .from(tasks)
        .where(eq(tasks.userId, user.id))
        .orderBy(desc(tasks.orderIndex))
        .limit(1)
    )

    const nextOrderIndex = maxOrderData.length > 0 ? (maxOrderData[0].orderIndex || 0) + 1 : 0

    // Calculate priority score if axes are provided
    let priorityScore: string | undefined = undefined
    if (task.impact || task.severity || task.timeliness || task.effort || task.strategic_fit) {
      const axes = {
        impact: task.impact || 3,
        severity: task.severity || 3,
        timeliness: task.timeliness || 3,
        effort: task.effort || 3,
        strategic_fit: task.strategic_fit || 3
      }
      priorityScore = String(calculatePriorityScore(axes))
    }

    // INSERT requires explicit user_id - RLS validates it matches current user
    const data = await withRLS((db) =>
      db.insert(tasks).values({
        title: task.title,
        assignees: task.assignees,
        dueDate: task.due_date,
        subtasksCompleted: task.subtasks_completed,
        subtasksTotal: task.subtasks_total,
        status: task.status,
        priority: task.priority,
        pinned: task.pinned,
        completed: task.completed,
        orderIndex: nextOrderIndex,
        userId: user.id,
        impact: task.impact,
        severity: task.severity,
        timeliness: task.timeliness,
        effort: task.effort,
        strategicFit: task.strategic_fit,
        priorityScore: priorityScore,
        projectId: task.project_id,
        monsterType: task.monster_type,
        monsterColors: task.monster_colors,
      }).returning()
    )

    // Transform camelCase to snake_case for backward compatibility
    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Validate request body
    const updateRequestSchema = z.object({
      id: z.string().uuid('Invalid task ID format'),
      updates: updateTaskSchema.shape.task
    })

    const validation = await validateRequestBody(request, updateRequestSchema)
    if (!validation.success) {
      return validation.response
    }

    const { id, updates } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Calculate priority score if axes are being updated
    let priorityScore: string | undefined = updates.priority_score !== undefined
      ? String(updates.priority_score)
      : undefined

    if (updates.impact !== undefined || updates.severity !== undefined ||
        updates.timeliness !== undefined || updates.effort !== undefined ||
        updates.strategic_fit !== undefined) {

      // Fetch current task to get existing axes values
      const currentTaskData = await withRLS((db) =>
        db.select({
          impact: tasks.impact,
          severity: tasks.severity,
          timeliness: tasks.timeliness,
          effort: tasks.effort,
          strategicFit: tasks.strategicFit
        })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
        .limit(1)
      )

      if (currentTaskData.length > 0) {
        const currentTask = currentTaskData[0]
        const axes = {
          impact: updates.impact ?? currentTask.impact ?? 3,
          severity: updates.severity ?? currentTask.severity ?? 3,
          timeliness: updates.timeliness ?? currentTask.timeliness ?? 3,
          effort: updates.effort ?? currentTask.effort ?? 3,
          strategic_fit: updates.strategic_fit ?? currentTask.strategicFit ?? 3
        }
        priorityScore = String(calculatePriorityScore(axes))
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }

    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.assignees !== undefined) updateData.assignees = updates.assignees
    if (updates.due_date !== undefined) updateData.dueDate = updates.due_date
    if (updates.subtasks_completed !== undefined) updateData.subtasksCompleted = updates.subtasks_completed
    if (updates.subtasks_total !== undefined) updateData.subtasksTotal = updates.subtasks_total
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.priority !== undefined) updateData.priority = updates.priority
    if (updates.pinned !== undefined) updateData.pinned = updates.pinned
    if (updates.completed !== undefined) updateData.completed = updates.completed
    if (updates.order_index !== undefined) updateData.orderIndex = updates.order_index
    if (updates.impact !== undefined) updateData.impact = updates.impact
    if (updates.severity !== undefined) updateData.severity = updates.severity
    if (updates.timeliness !== undefined) updateData.timeliness = updates.timeliness
    if (updates.effort !== undefined) updateData.effort = updates.effort
    if (updates.strategic_fit !== undefined) updateData.strategicFit = updates.strategic_fit
    if (priorityScore !== undefined) updateData.priorityScore = priorityScore
    if (updates.project_id !== undefined) updateData.projectId = updates.project_id
    if (updates.monster_type !== undefined) updateData.monsterType = updates.monster_type
    if (updates.monster_colors !== undefined) updateData.monsterColors = updates.monster_colors

    const data = await withRLS((db) =>
      db.update(tasks)
        .set(updateData)
        .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Task not found', 404)
    }

    // Transform camelCase to snake_case for backward compatibility
    return NextResponse.json(toSnakeCase(data[0]))
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Validate query parameters
    const deleteQuerySchema = z.object({
      id: z.string().uuid('Invalid task ID format')
    })

    const queryValidation = validateQueryParams(searchParams, deleteQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { id } = queryValidation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    await withRLS((db) =>
      db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}
