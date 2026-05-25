import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  incrementCompletionSchema,
  IncrementCompletionResponseSchema,
} from '@/modules/tasks/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { tasks } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

registry.registerPath({
  method: 'post',
  path: '/api/modules/tasks/increment-completion',
  operationId: 'incrementTaskCompletion',
  summary: 'Increment a task\'s completion_count by the given amount',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: incrementCompletionSchema } } } },
  responses: {
    200: {
      description: 'Updated completion count',
      content: { 'application/json': { schema: IncrementCompletionResponseSchema } },
    },
    400: { description: 'Validation error or completion count too high', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Task not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, incrementCompletionSchema)
    if (!validation.success) {
      return validation.response
    }

    const { taskId, increment } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Defense-in-depth: explicit user_id filter in addition to RLS.
    const taskData = await withRLS((db) =>
      db.select({ completionCount: tasks.completionCount })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
        .limit(1)
    )

    if (taskData.length === 0) {
      return createErrorResponse('Task not found', 404)
    }

    // Increment the completion count with validation
    const currentCount = taskData[0].completionCount ?? 0
    const newCount = currentCount + (increment ?? 1)

    // Prevent excessive completion counts
    if (newCount > 10000) {
      return createErrorResponse('Completion count too high', 400)
    }

    await withRLS((db) =>
      db.update(tasks)
        .set({
          completionCount: newCount,
          updatedAt: new Date().toISOString()
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
    )

    return NextResponse.json({ success: true, completion_count: newCount })
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}
