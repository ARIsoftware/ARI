import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { tasks, contacts } from '@/lib/db/schema'
import { sql, desc } from 'drizzle-orm'
import type { ActivityItem } from '@/modules/dashboard/types'

export async function GET(_request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()
  if (!user || !withRLS) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const TASK_LIMIT = 15
  const CONTACT_LIMIT = 5
  const FINAL_LIMIT = 15

  // One transaction → both queries share the same RLS user_id setting.
  const [recentTasks, recentContacts] = await withRLS(async (db) => {
    const t = await db.select({
      id: tasks.id,
      title: tasks.title,
      completed: tasks.completed,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
      .from(tasks)
      .orderBy(desc(sql`COALESCE(${tasks.updatedAt}, ${tasks.createdAt})`))
      .limit(TASK_LIMIT)

    const c = await db.select({
      id: contacts.id,
      name: contacts.name,
      createdAt: contacts.createdAt,
    })
      .from(contacts)
      .orderBy(desc(contacts.createdAt))
      .limit(CONTACT_LIMIT)

    return [t, c] as const
  })

  const activities: ActivityItem[] = []

  for (const task of recentTasks) {
    if (task.completed && task.updatedAt && task.updatedAt !== task.createdAt) {
      activities.push({
        id: `task_completed_${task.id}`,
        type: 'task_completed',
        title: 'Task Completed',
        description: task.title,
        timestamp: task.updatedAt,
      })
    }
    if (task.createdAt) {
      activities.push({
        id: `task_created_${task.id}`,
        type: 'task_created',
        title: 'Task Created',
        description: task.title,
        timestamp: task.createdAt,
      })
    }
  }

  for (const contact of recentContacts) {
    if (contact.createdAt) {
      activities.push({
        id: `contact_added_${contact.id}`,
        type: 'contact_added',
        title: 'Contact Added',
        description: contact.name,
        timestamp: contact.createdAt,
      })
    }
  }

  activities.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return NextResponse.json(activities.slice(0, FINAL_LIMIT))
}
