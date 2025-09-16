import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { Task } from '@/lib/supabase'
import { Shipment } from '@/lib/shipments'

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
  allShipments: Shipment[]
  totalShipments: number
  deliveredShipments: number
  inTransitShipments: number
  pendingShipments: number
  delayedShipments: number
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

    // Fetch all shipments for the authenticated user
    const { data: shipments, error: shipmentsError } = await supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (shipmentsError) {
      console.warn('Error fetching shipments for context:', shipmentsError)
      // Continue without shipments if fetch fails
    }

    const allShipments = shipments || []
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

    // Calculate shipment metrics
    const totalShipments = allShipments.length
    const deliveredShipments = allShipments.filter(s => s.status === 'delivered').length
    const inTransitShipments = allShipments.filter(s => s.status === 'in_transit').length
    const pendingShipments = allShipments.filter(s => s.status === 'pending').length
    const delayedShipments = allShipments.filter(s => s.status === 'delayed').length

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
      lastCompletionDate,
      allShipments,
      totalShipments,
      deliveredShipments,
      inTransitShipments,
      pendingShipments,
      delayedShipments
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
    lastCompletionDate: null,
    allShipments: [],
    totalShipments: 0,
    deliveredShipments: 0,
    inTransitShipments: 0,
    pendingShipments: 0,
    delayedShipments: 0
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
    totalShipments,
    deliveredShipments,
    inTransitShipments,
    pendingShipments,
    delayedShipments,
    allShipments
  } = context

  let contextText = `## User's Task & Shipment Summary\n\n`
  
  contextText += `**Task Statistics:**\n`
  contextText += `- Total tasks: ${totalTasks}\n`
  contextText += `- Completed: ${completedTasks}\n`
  contextText += `- Pending: ${pendingTasks}\n`
  contextText += `- In Progress: ${inProgressTasks}\n`
  contextText += `- Completion rate: ${completionRate}%\n`
  contextText += `- High priority tasks: ${highPriorityTasks}\n`
  contextText += `- Overdue tasks: ${overdueTasks}\n\n`

  contextText += `**Shipment Statistics:**\n`
  contextText += `- Total shipments: ${totalShipments}\n`
  contextText += `- Delivered: ${deliveredShipments}\n`
  contextText += `- In Transit: ${inTransitShipments}\n`
  contextText += `- Pending: ${pendingShipments}\n`
  contextText += `- Delayed: ${delayedShipments}\n\n`

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
    const createdDate = new Date(task.created_at).toLocaleDateString()
    
    contextText += `${status} ${priority} ${starred} ${task.title}${dueInfo}\n`
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

  if (allShipments.length > 0) {
    contextText += `\n**All Shipments Details:**\n`
    allShipments.forEach(shipment => {
      const statusIcon = getShipmentStatusIcon(shipment.status)
      const createdDate = new Date(shipment.created_at).toLocaleDateString()
      const updatedDate = new Date(shipment.updated_at).toLocaleDateString()
      const expectedDelivery = shipment.expected_delivery 
        ? new Date(shipment.expected_delivery).toLocaleDateString() 
        : 'Not specified'
      
      contextText += `${statusIcon} ${shipment.name}\n`
      contextText += `  Status: ${shipment.status}\n`
      contextText += `  Tracking: ${shipment.tracking_code || 'Not provided'}\n`
      contextText += `  Carrier: ${shipment.carrier || 'Not specified'}\n`
      contextText += `  Expected Delivery: ${expectedDelivery}\n`
      contextText += `  Created: ${createdDate}, Updated: ${updatedDate}\n`
      
      if (shipment.tracking_link) {
        contextText += `  Tracking Link: ${shipment.tracking_link}\n`
      }
      if (shipment.notes) {
        contextText += `  Notes: ${shipment.notes}\n`
      }
      contextText += `\n`
    })
  }

  contextText += `\n---\n\n`
  contextText += `You can answer questions about tasks (completion rates, priorities, deadlines) and shipments (tracking, delivery status, carriers, etc.).`

  return contextText
}

function getShipmentStatusIcon(status: string): string {
  switch (status) {
    case 'delivered':
      return '✅'
    case 'in_transit':
      return '🚚'
    case 'out_for_delivery':
      return '🚛'
    case 'delayed':
      return '⚠️'
    case 'returned':
      return '↩️'
    case 'pending':
    default:
      return '📦'
  }
}