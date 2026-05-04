import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { tasks } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const incrementCompletionSchema = z.object({
  taskId: z.string().uuid('Invalid task ID format'),
  increment: z.number().int().min(1, 'Increment must be at least 1').max(10, 'Increment too large').default(1)
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
