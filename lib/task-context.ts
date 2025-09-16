import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { Task } from '@/lib/supabase'

export interface TaskContext {
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  inProgressTasks: number
  highPriorityTasks: number
  mediumPriorityTasks: number
  lowPriorityTasks: number
  starredTasks: number
  tasksWithDueDates: number
  overdueTasks: number
  recentCompletions: Task[]
  highPriorityPendingTasks: Task[]
  allTasks: Task[]
  completionRate: number
  lastCompletionDate: string | null
}

export async function getTaskContext(): Promise<TaskContext> {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      throw new Error('Authentication required')
    }

    // Fetch all tasks for the authenticated user
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .order('updated_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching tasks for context:', error)
      throw new Error('Failed to fetch tasks')
    }

    if (!tasks) {
      return createEmptyContext()
    }

    const now = new Date()
    
    // Calculate metrics
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.completed).length
    const pendingTasks = tasks.filter(t => t.status === 'Pending').length
    const inProgressTasks = tasks.filter(t => t.status === 'In Progress').length
    
    const highPriorityTasks = tasks.filter(t => t.priority === 'High').length
    const mediumPriorityTasks = tasks.filter(t => t.priority === 'Medium').length
    const lowPriorityTasks = tasks.filter(t => t.priority === 'Low').length
    
    const starredTasks = tasks.filter(t => t.starred).length
    const tasksWithDueDates = tasks.filter(t => t.due_date).length
    
    // Calculate overdue tasks
    const overdueTasks = tasks.filter(t => {
      if (!t.due_date || t.completed) return false
      return new Date(t.due_date) < now
    }).length
    
    // Get recent completions (last 10)
    const recentCompletions = tasks
      .filter(t => t.completed)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10)
    
    // Get high priority pending tasks
    const highPriorityPendingTasks = tasks
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
      starredTasks,
      tasksWithDueDates,
      overdueTasks,
      recentCompletions,
      highPriorityPendingTasks,
      allTasks: tasks,
      completionRate: Math.round(completionRate * 100) / 100,
      lastCompletionDate
    }
  } catch (error) {
    console.error('Error getting task context:', error)
    throw error
  }
}

function createEmptyContext(): TaskContext {
  return {
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    highPriorityTasks: 0,
    mediumPriorityTasks: 0,
    lowPriorityTasks: 0,
    starredTasks: 0,
    tasksWithDueDates: 0,
    overdueTasks: 0,
    recentCompletions: [],
    highPriorityPendingTasks: [],
    allTasks: [],
    completionRate: 0,
    lastCompletionDate: null
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
    lastCompletionDate
  } = context

  let contextText = `## User's Task Summary\n\n`
  
  contextText += `**Overall Statistics:**\n`
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
    const starred = task.starred ? '⭐' : ''
    const dueInfo = task.due_date ? ` (due: ${new Date(task.due_date).toLocaleDateString()})` : ''
    
    contextText += `${status} ${priority} ${starred} ${task.title}${dueInfo}\n`
    if (task.assignees && task.assignees.length > 0) {
      contextText += `  Assignees: ${task.assignees.join(', ')}\n`
    }
    if (task.subtasks_total > 0) {
      contextText += `  Subtasks: ${task.subtasks_completed}/${task.subtasks_total}\n`
    }
  })

  contextText += `\n---\n\n`
  contextText += `You can answer questions about these tasks, such as completion rates, priorities, deadlines, etc.`

  return contextText
}