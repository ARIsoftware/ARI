import { NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { fitnessDatabase } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Get fitness task completion data (RLS automatically filters by user_id)
    const completions = await withRLS((db) =>
      db.select().from(fitnessDatabase).where(eq(fitnessDatabase.userId, user.id))
    )

    // Calculate statistics
    const taskCompletions: { [key: string]: number } = {}
    let totalCompletions = 0

    completions?.forEach((completion) => {
      const taskTitle = completion.title
      if (taskTitle) {
        taskCompletions[taskTitle] = (taskCompletions[taskTitle] || 0) + 1
        totalCompletions++
      }
    })

    // Calculate days range
    const dates = completions?.map(c => c.createdAt ? new Date(c.createdAt) : new Date()) || []
    const uniqueDays = new Set(dates.map(d => d.toDateString()))
    const daysWithData = uniqueDays.size || 1

    // Find most and least completed tasks
    const sortedTasks = Object.entries(taskCompletions).sort((a, b) => b[1] - a[1])
    const mostCompletedTask = sortedTasks[0]
      ? { title: sortedTasks[0][0], count: sortedTasks[0][1] }
      : null
    const leastCompletedTask = sortedTasks[sortedTasks.length - 1]
      ? { title: sortedTasks[sortedTasks.length - 1][0], count: sortedTasks[sortedTasks.length - 1][1] }
      : null

    return NextResponse.json({
      averageCompletionsPerDay: totalCompletions / daysWithData,
      mostCompletedTask,
      leastCompletedTask,
      totalCompletions
    })

  } catch (error) {
    console.error("Error in fitness-stats API:", error)
    return NextResponse.json({
      averageCompletionsPerDay: 0,
      mostCompletedTask: null,
      leastCompletedTask: null,
      totalCompletions: 0
    })
  }
}
