import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { tasks } from '@/lib/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'
import { z } from 'zod'

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const validation = validateQueryParams(searchParams, analyticsQuerySchema)
    if (!validation.success) {
      return validation.response
    }
    const days = validation.data.days ?? 30

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get both creation and completion data in a single connection
    const { taskCreationData, taskCompletionData } = await withRLS(async (db) => {
      const creation = await db.select({ createdAt: tasks.createdAt })
        .from(tasks)
        .where(
          and(
            gte(tasks.createdAt, startDate.toISOString()),
            lte(tasks.createdAt, endDate.toISOString())
          )
        )

      const completion = await db.select({ updatedAt: tasks.updatedAt, completed: tasks.completed })
        .from(tasks)
        .where(
          and(
            eq(tasks.completed, true),
            gte(tasks.updatedAt, startDate.toISOString()),
            lte(tasks.updatedAt, endDate.toISOString())
          )
        )

      return { taskCreationData: creation, taskCompletionData: completion }
    })

    // Process data into daily counts
    const dailyData: Record<string, { date: string; tasksCreated: number; tasksCompleted: number }> = {}

    // Initialize all days in range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      dailyData[dateStr] = {
        date: dateStr,
        tasksCreated: 0,
        tasksCompleted: 0
      }
    }

    // Count task creations
    taskCreationData?.forEach(task => {
      if (task.createdAt) {
        const dateStr = new Date(task.createdAt).toISOString().split('T')[0]
        if (dailyData[dateStr]) {
          dailyData[dateStr].tasksCreated++
        }
      }
    })

    // Count task completions
    taskCompletionData?.forEach(task => {
      if (task.updatedAt) {
        const dateStr = new Date(task.updatedAt).toISOString().split('T')[0]
        if (dailyData[dateStr]) {
          dailyData[dateStr].tasksCompleted++
        }
      }
    })

    // Convert to array and sort by date
    const analyticsData = Object.values(dailyData).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Calculate summary statistics
    const totalTasksCreated = analyticsData.reduce((sum, day) => sum + day.tasksCreated, 0)
    const totalTasksCompleted = analyticsData.reduce((sum, day) => sum + day.tasksCompleted, 0)
    const avgTasksCreatedPerDay = totalTasksCreated / days
    const avgTasksCompletedPerDay = totalTasksCompleted / days

    return NextResponse.json({
      success: true,
      data: analyticsData,
      summary: {
        totalTasksCreated,
        totalTasksCompleted,
        avgTasksCreatedPerDay: Math.round(avgTasksCreatedPerDay * 10) / 10,
        avgTasksCompletedPerDay: Math.round(avgTasksCompletedPerDay * 10) / 10,
        days
      }
    })

  } catch (error) {
    console.error('Error in task analytics API:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
