import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { fitnessDatabase } from '@/lib/db/schema'

const sampleFitnessTasks = [
  {
    title: "Morning Run - 5K",
    assignees: ["You"],
    dueDate: new Date().toISOString().split('T')[0],
    subtasksCompleted: 0,
    subtasksTotal: 1,
    status: "Pending" as const,
    priority: "High" as const,
    pinned: false,
    completed: false,
    youtubeUrl: "https://www.youtube.com/watch?v=9FGilxCbdz8",
  },
  {
    title: "Push-ups - 3 sets of 20",
    assignees: ["You"],
    dueDate: new Date().toISOString().split('T')[0],
    subtasksCompleted: 0,
    subtasksTotal: 3,
    status: "Pending" as const,
    priority: "Medium" as const,
    pinned: true,
    completed: false,
    youtubeUrl: "https://www.youtube.com/watch?v=IODxDxX7oi4",
  },
  {
    title: "Plank Hold - 60 seconds",
    assignees: ["You"],
    dueDate: new Date().toISOString().split('T')[0],
    subtasksCompleted: 0,
    subtasksTotal: 1,
    status: "Pending" as const,
    priority: "Medium" as const,
    pinned: false,
    completed: false,
  },
  {
    title: "Stretch Session - 15 minutes",
    assignees: ["You"],
    dueDate: new Date().toISOString().split('T')[0],
    subtasksCompleted: 0,
    subtasksTotal: 1,
    status: "Pending" as const,
    priority: "Low" as const,
    pinned: false,
    completed: false,
    youtubeUrl: "https://www.youtube.com/watch?v=g_tea8ZNk5A",
  }
]

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Add sample tasks with proper order_index and user_id
    const tasksToInsert = sampleFitnessTasks.map((task, index) => ({
      ...task,
      userId: user.id,
      orderIndex: index,
    }))

    const data = await withRLS((db) =>
      db.insert(fitnessDatabase).values(tasksToInsert).returning()
    )

    return NextResponse.json(toSnakeCase(data))
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
