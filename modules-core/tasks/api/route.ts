import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  createTaskSchema,
  TaskSchema,
  TaskListSchema,
  UpdateTaskRequestSchema,
  DeleteTaskQuerySchema,
  DeleteSuccessSchema,
} from '@/modules/tasks/lib/validation'
import { calculatePriorityScore } from '@/modules/tasks/lib/priority-utils'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { tasks } from '@/lib/db/schema'
import { desc, eq, asc, sql, and } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/tasks',
  operationId: 'listTasks',
  summary: 'List tasks',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  responses: {
    200: {
      description: "All of the authenticated user's tasks, ordered by order_index",
      content: { 'application/json': { schema: TaskListSchema } },
    },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/tasks',
  operationId: 'createTask',
  summary: 'Create a task',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  request: {
    body: { content: { 'application/json': { schema: createTaskSchema } } },
  },
  responses: {
    201: { description: 'Created task', content: { 'application/json': { schema: TaskSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/tasks',
  operationId: 'updateTask',
  summary: 'Update a task by id',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  request: {
    body: { content: { 'application/json': { schema: UpdateTaskRequestSchema } } },
  },
  responses: {
    200: { description: 'Updated task', content: { 'application/json': { schema: TaskSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Task not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/tasks',
  operationId: 'deleteTask',
  summary: 'Delete a task by id (passed as query parameter)',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  request: { query: DeleteTaskQuerySchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: DeleteSuccessSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

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

    const nextOrderIndex = maxOrderData.length > 0 ? (maxOrderData[0].orderIndex ?? 0) + 1 : 0

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
        assignedAgentId: task.assigned_agent_id ?? null,
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
    const validation = await validateRequestBody(request, UpdateTaskRequestSchema)
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
    if (updates.assigned_agent_id !== undefined) updateData.assignedAgentId = updates.assigned_agent_id

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

    const queryValidation = validateQueryParams(searchParams, DeleteTaskQuerySchema)
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
