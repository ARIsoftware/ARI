import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { tasks } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import type { Task } from '@/modules/tasks/types'

export interface TaskContext {
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  inProgressTasks: number
  highPriorityTasks: number
  mediumPriorityTasks: number
  lowPriorityTasks: number
  pinnedTasks: number
  tasksWithDueDates: number
  overdueTasks: number
  recentCompletions: Task[]
  highPriorityPendingTasks: Task[]
  allTasks: Task[]
  completionRate: number
  lastCompletionDate: string | null
}

export async function getTaskContext(): Promise<TaskContext> {
  const { user, withRLS } = await getAuthenticatedUser()

  if (!user || !withRLS) {
    throw new Error('Authentication required')
  }

  // Fetch all tasks for the authenticated user (RLS filters automatically)
  const tasksData = await withRLS((db) =>
    db.select()
      .from(tasks)
      .orderBy(desc(tasks.updatedAt))
  )

  // Map Drizzle results to Task type (snake_case to camelCase mapping)
  const mappedTasks: Task[] = tasksData.map(t => ({
    id: t.id,
    title: t.title,
    assignees: t.assignees,
    due_date: t.dueDate,
    subtasks_completed: t.subtasksCompleted,
    subtasks_total: t.subtasksTotal,
    status: t.status,
    priority: t.priority,
    pinned: t.pinned,
    completed: t.completed,
    created_at: t.createdAt || '',
    updated_at: t.updatedAt || '',
    order_index: t.orderIndex,
    completion_count: t.completionCount,
    user_email: t.userEmail,
    user_id: t.userId,
    impact: t.impact,
    severity: t.severity,
    timeliness: t.timeliness,
    effort: t.effort,
    strategic_fit: t.strategicFit,
    priority_score: t.priorityScore,
    project_id: t.projectId,
    monster_type: t.monsterType,
    monster_colors: t.monsterColors,
  }))

  const now = new Date()

  // Calculate metrics
  const totalTasks = mappedTasks.length
  const completedTasks = mappedTasks.filter(t => t.completed).length
  const pendingTasks = mappedTasks.filter(t => t.status === 'Pending').length
  const inProgressTasks = mappedTasks.filter(t => t.status === 'In Progress').length

  const highPriorityTasks = mappedTasks.filter(t => t.priority === 'High').length
  const mediumPriorityTasks = mappedTasks.filter(t => t.priority === 'Medium').length
  const lowPriorityTasks = mappedTasks.filter(t => t.priority === 'Low').length

  const pinnedTasks = mappedTasks.filter(t => t.pinned).length
  const tasksWithDueDates = mappedTasks.filter(t => t.due_date).length

  // Calculate overdue tasks
  const overdueTasks = mappedTasks.filter(t => {
    if (!t.due_date || t.completed) return false
    return new Date(t.due_date) < now
  }).length

  // Get recent completions (last 10)
  const recentCompletions = mappedTasks
    .filter(t => t.completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10)

  // Get high priority pending tasks
  const highPriorityPendingTasks = mappedTasks
    .filter(t => t.priority === 'High' && !t.completed)
    .slice(0, 5)

  // Calculate completion rate
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  // Find last completion date
  const lastCompletionDate = recentCompletions.length > 0
    ? recentCompletions[0].updated_at
    : null

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    highPriorityTasks,
    mediumPriorityTasks,
    lowPriorityTasks,
    pinnedTasks,
    tasksWithDueDates,
    overdueTasks,
    recentCompletions,
    highPriorityPendingTasks,
    allTasks: mappedTasks,
    completionRate: Math.round(completionRate * 100) / 100,
    lastCompletionDate,
  }
}

export function formatTaskContextForAI(context: TaskContext): string {
  const {
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    highPriorityTasks,
    overdueTasks,
    recentCompletions,
    highPriorityPendingTasks,
    completionRate,
    lastCompletionDate,
  } = context

  let contextText = `## User's Task Summary\n\n`

  contextText += `**Task Statistics:**\n`
  contextText += `- Total tasks: ${totalTasks}\n`
  contextText += `- Completed: ${completedTasks}\n`
  contextText += `- Pending: ${pendingTasks}\n`
  contextText += `- In Progress: ${inProgressTasks}\n`
  contextText += `- Completion rate: ${completionRate}%\n`
  contextText += `- High priority tasks: ${highPriorityTasks}\n`
  contextText += `- Overdue tasks: ${overdueTasks}\n\n`

  if (lastCompletionDate) {
    const lastCompletion = new Date(lastCompletionDate)
    contextText += `**Last completion:** ${lastCompletion.toLocaleDateString()} at ${lastCompletion.toLocaleTimeString()}\n\n`
  }

  if (highPriorityPendingTasks.length > 0) {
    contextText += `**High Priority Pending Tasks:**\n`
    highPriorityPendingTasks.forEach(task => {
      const dueInfo = task.due_date ? ` (due: ${new Date(task.due_date).toLocaleDateString()})` : ''
      contextText += `- ${task.title}${dueInfo}\n`
    })
    contextText += `\n`
  }

  if (recentCompletions.length > 0) {
    contextText += `**Recent Completions:**\n`
    recentCompletions.slice(0, 5).forEach(task => {
      const completedDate = new Date(task.updated_at).toLocaleDateString()
      contextText += `- ${task.title} (completed: ${completedDate})\n`
    })
    contextText += `\n`
  }

  contextText += `**All Tasks Details:**\n`
  context.allTasks.forEach(task => {
    const status = task.completed ? '✅' : (task.status === 'In Progress' ? '🔄' : '⏳')
    const priority = task.priority === 'High' ? '🔴' : (task.priority === 'Medium' ? '🟡' : '🟢')
    const pinned = task.pinned ? '📌' : ''
    const dueInfo = task.due_date ? ` (due: ${new Date(task.due_date).toLocaleDateString()})` : ''
    const createdDate = new Date(task.created_at).toLocaleDateString()

    contextText += `${status} ${priority} ${pinned} ${task.title}${dueInfo}\n`
    contextText += `  Created: ${createdDate}, Order: ${task.order_index}, Completed: ${task.completion_count || 0} times\n`

    if (task.assignees && task.assignees.length > 0) {
      contextText += `  Assignees: ${task.assignees.join(', ')}\n`
    }
    if (task.subtasks_total > 0) {
      contextText += `  Subtasks: ${task.subtasks_completed}/${task.subtasks_total}\n`
    }

    // Add priority scoring details if available
    if (task.impact || task.severity || task.timeliness || task.effort || task.strategic_fit) {
      contextText += `  Priority Analysis: Impact=${task.impact || 3}, Severity=${task.severity || 3}, Timeliness=${task.timeliness || 3}, Effort=${task.effort || 3}, Strategic Fit=${task.strategic_fit || 3}`
      if (task.priority_score) {
        contextText += `, Score=${task.priority_score}`
      }
      contextText += `\n`
    }
  })

  contextText += `\n---\n\n`
  contextText += `You can answer questions about tasks (completion rates, priorities, deadlines).`

  return contextText
}
