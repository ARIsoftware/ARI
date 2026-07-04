import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  createSubtaskSchema,
  SubtaskSchema,
  SubtaskListSchema,
  UpdateSubtaskRequestSchema,
  ListSubtasksQuerySchema,
  DeleteSubtaskQuerySchema,
  DeleteSuccessSchema,
} from '@/modules/tasks/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import type { DrizzleDb } from '@/lib/db'
import { tasks, taskSubtasks } from '@/lib/db/schema'
import { eq, asc, and, sql } from 'drizzle-orm'

const MAX_SUBTASKS_PER_TASK = 100

registry.registerPath({
  method: 'get',
  path: '/api/modules/tasks/subtasks',
  operationId: 'listSubtasks',
  summary: 'List subtasks (optionally filtered by task_id)',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  request: { query: ListSubtasksQuerySchema },
  responses: {
    200: {
      description: "The authenticated user's subtasks, ordered by order_index",
      content: { 'application/json': { schema: SubtaskListSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/tasks/subtasks',
  operationId: 'createSubtask',
  summary: 'Create a subtask for a task',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  request: {
    body: { content: { 'application/json': { schema: createSubtaskSchema } } },
  },
  responses: {
    201: { description: 'Created subtask', content: { 'application/json': { schema: SubtaskSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Parent task not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/tasks/subtasks',
  operationId: 'updateSubtask',
  summary: 'Update a subtask by id',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  request: {
    body: { content: { 'application/json': { schema: UpdateSubtaskRequestSchema } } },
  },
  responses: {
    200: { description: 'Updated subtask', content: { 'application/json': { schema: SubtaskSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Subtask not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/tasks/subtasks',
  operationId: 'deleteSubtask',
  summary: 'Delete a subtask by id (passed as query parameter)',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  request: { query: DeleteSubtaskQuerySchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: DeleteSuccessSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Subtask not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * Lock the parent task row (FOR UPDATE) inside the current transaction.
 * Serializes every counter recount and the POST cap/order computation:
 * a competing transaction blocks here until the holder commits, and the
 * statements that follow then read a snapshot that includes its changes.
 * Returns false when the task doesn't exist or belongs to another user.
 */
async function lockParentTask(db: DrizzleDb, userId: string, taskId: string): Promise<boolean> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .for('update')
  return rows.length > 0
}

/**
 * Recompute subtasks_completed/subtasks_total on the parent task from the
 * actual subtask rows, inside the same transaction as the mutation, so the
 * counters (used by the task list progress UI and dashboard widgets) never
 * drift. Takes the parent row lock itself — re-locking a row this
 * transaction already holds (the POST path) is a no-op.
 */
async function recountParent(db: DrizzleDb, userId: string, taskId: string) {
  await lockParentTask(db, userId, taskId)
  await db
    .update(tasks)
    .set({
      subtasksTotal: sql<number>`(select count(*)::int from task_subtasks where task_id = ${taskId} and user_id = ${userId})`,
      subtasksCompleted: sql<number>`(select (count(*) filter (where completed))::int from task_subtasks where task_id = ${taskId} and user_id = ${userId})`,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const queryValidation = validateQueryParams(searchParams, ListSubtasksQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { task_id } = queryValidation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const data = await withRLS((db) =>
      db.select()
        .from(taskSubtasks)
        .where(
          task_id
            ? and(eq(taskSubtasks.userId, user.id), eq(taskSubtasks.taskId, task_id))
            : eq(taskSubtasks.userId, user.id)
        )
        .orderBy(asc(taskSubtasks.orderIndex), asc(taskSubtasks.createdAt))
    )

    return NextResponse.json(toSnakeCase(data))
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, createSubtaskSchema)
    if (!validation.success) {
      return validation.response
    }

    const { subtask } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // One transaction: lock parent → cap/order check → insert → recount.
    // The parent lock makes concurrent POSTs serialize, so the cap can't be
    // overshot and order_index values can't collide.
    const result = await withRLS(async (db) => {
      const parentLocked = await lockParentTask(db, user.id, subtask.task_id)
      if (!parentLocked) return { ok: false as const, reason: 'task_not_found' as const }

      const existing = await db
        .select({
          count: sql<number>`count(*)::int`,
          maxOrder: sql<number>`coalesce(max(order_index), -1)::int`,
        })
        .from(taskSubtasks)
        .where(and(eq(taskSubtasks.taskId, subtask.task_id), eq(taskSubtasks.userId, user.id)))

      if ((existing[0]?.count ?? 0) >= MAX_SUBTASKS_PER_TASK) {
        return { ok: false as const, reason: 'limit_reached' as const }
      }

      const rows = await db.insert(taskSubtasks).values({
        taskId: subtask.task_id,
        userId: user.id,
        title: subtask.title,
        orderIndex: (existing[0]?.maxOrder ?? -1) + 1,
      }).returning()

      await recountParent(db, user.id, subtask.task_id)
      return { ok: true as const, row: rows[0] }
    })

    if (!result.ok) {
      return result.reason === 'task_not_found'
        ? createErrorResponse('Parent task not found', 404)
        : createErrorResponse('Too many subtasks', 400)
    }

    return NextResponse.json(toSnakeCase(result.row), { status: 201 })
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, UpdateSubtaskRequestSchema)
    if (!validation.success) {
      return validation.response
    }

    const { id, updates } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }

    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.completed !== undefined) updateData.completed = updates.completed
    if (updates.order_index !== undefined) updateData.orderIndex = updates.order_index

    // Update and recount in one transaction so the stored counters always
    // reflect a committed state of the rows.
    const result = await withRLS(async (db) => {
      const rows = await db
        .update(taskSubtasks)
        .set(updateData)
        .where(and(eq(taskSubtasks.id, id), eq(taskSubtasks.userId, user.id)))
        .returning()

      if (rows.length === 0) return { ok: false as const }

      if (updates.completed !== undefined) {
        await recountParent(db, user.id, rows[0].taskId)
      }
      return { ok: true as const, row: rows[0] }
    })

    if (!result.ok) return createErrorResponse('Subtask not found', 404)

    return NextResponse.json(toSnakeCase(result.row))
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const queryValidation = validateQueryParams(searchParams, DeleteSubtaskQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { id } = queryValidation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const result = await withRLS(async (db) => {
      const rows = await db
        .delete(taskSubtasks)
        .where(and(eq(taskSubtasks.id, id), eq(taskSubtasks.userId, user.id)))
        .returning()

      if (rows.length === 0) return { ok: false as const }

      await recountParent(db, user.id, rows[0].taskId)
      return { ok: true as const }
    })

    if (!result.ok) return createErrorResponse('Subtask not found', 404)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}
