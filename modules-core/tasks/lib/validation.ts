import { z } from 'zod'

const uuidSchema = z.string().uuid('Invalid UUID format')
const nonEmptyString = z.string().min(1, 'Cannot be empty')
const nonNegativeNumber = z.number().nonnegative('Cannot be negative')

export const TaskStatus = z.enum(['Pending', 'In Progress', 'Completed'], {
  errorMap: () => ({ message: 'Invalid task status' })
})

export const TaskPriority = z.enum(['Low', 'Medium', 'High'], {
  errorMap: () => ({ message: 'Invalid task priority' })
})

export const createTaskSchema = z.object({
  task: z.object({
    title: nonEmptyString.max(255, 'Title too long'),
    description: z.string().max(2000, 'Description too long').optional(),
    status: TaskStatus.default('Pending'),
    priority: TaskPriority.default('Medium'),
    assignees: z.array(z.string().max(100)).max(10, 'Too many assignees').default([]),
    due_date: z.union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      z.null()
    ]).optional(),
    pinned: z.boolean().default(false),
    completed: z.boolean().default(false),
    subtasks_total: nonNegativeNumber.max(100, 'Too many subtasks').default(0),
    subtasks_completed: nonNegativeNumber.default(0),
    impact: z.number().min(1).max(5).default(3).optional(),
    severity: z.number().min(1).max(5).default(3).optional(),
    timeliness: z.number().min(1).max(5).default(3).optional(),
    effort: z.number().min(1).max(5).default(3).optional(),
    strategic_fit: z.number().min(1).max(5).default(3).optional(),
    project_id: z.union([uuidSchema, z.null()]).optional()
  })
}).refine(
  (data) => data.task.subtasks_completed <= data.task.subtasks_total,
  {
    message: 'Completed subtasks cannot exceed total subtasks',
    path: ['task', 'subtasks_completed']
  }
)

export const updateTaskSchema = z.object({
  task: z.object({
    title: nonEmptyString.max(255, 'Title too long').optional(),
    description: z.string().max(2000, 'Description too long').optional(),
    status: TaskStatus.optional(),
    priority: TaskPriority.optional(),
    assignees: z.array(z.string().max(100)).max(10, 'Too many assignees').optional(),
    due_date: z.union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      z.null()
    ]).optional(),
    pinned: z.boolean().optional(),
    completed: z.boolean().optional(),
    subtasks_total: nonNegativeNumber.max(100, 'Too many subtasks').optional(),
    subtasks_completed: nonNegativeNumber.optional(),
    impact: z.number().min(1).max(5).optional(),
    severity: z.number().min(1).max(5).optional(),
    timeliness: z.number().min(1).max(5).optional(),
    effort: z.number().min(1).max(5).optional(),
    strategic_fit: z.number().min(1).max(5).optional(),
    priority_score: z.number().optional(),
    project_id: z.union([uuidSchema, z.null()]).optional()
  }).refine(
    (data) => !data.subtasks_completed || !data.subtasks_total || data.subtasks_completed <= data.subtasks_total,
    {
      message: 'Completed subtasks cannot exceed total subtasks',
      path: ['subtasks_completed']
    }
  )
})

export const uuidParamSchema = z.object({
  id: uuidSchema
})
