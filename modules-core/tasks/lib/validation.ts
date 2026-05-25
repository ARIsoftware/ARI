import { z } from 'zod'
import '@/lib/openapi/registry'

const uuidSchema = z.string().uuid('Invalid UUID format')
const nonEmptyString = z.string().min(1, 'Cannot be empty')
const nonNegativeNumber = z.number().nonnegative('Cannot be negative')

export const TaskStatus = z.enum(['Pending', 'In Progress', 'Completed'], {
  errorMap: () => ({ message: 'Invalid task status' })
})

export const TaskPriority = z.enum(['Low', 'Medium', 'High'], {
  errorMap: () => ({ message: 'Invalid task priority' })
})

const MonsterColorsSchema = z.object({
  primary: z.string().max(32),
  secondary: z.string().max(32),
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
    project_id: z.union([uuidSchema, z.null()]).optional(),
    assigned_agent_id: z.union([z.string().max(120, 'Invalid agent id'), z.null()]).optional(),
    monster_type: z.union([z.string().max(50, 'Monster type too long'), z.null()]).optional(),
    monster_colors: z.union([MonsterColorsSchema, z.null()]).optional()
  })
}).refine(
  (data) => data.task.subtasks_completed <= data.task.subtasks_total,
  {
    message: 'Completed subtasks cannot exceed total subtasks',
    path: ['task', 'subtasks_completed']
  }
).openapi('CreateTaskBody')

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
    project_id: z.union([uuidSchema, z.null()]).optional(),
    assigned_agent_id: z.union([z.string().max(120, 'Invalid agent id'), z.null()]).optional(),
    monster_type: z.union([z.string().max(50, 'Monster type too long'), z.null()]).optional(),
    monster_colors: z.union([MonsterColorsSchema, z.null()]).optional(),
    order_index: z.number().int().nonnegative().optional()
  }).refine(
    (data) => !data.subtasks_completed || !data.subtasks_total || data.subtasks_completed <= data.subtasks_total,
    {
      message: 'Completed subtasks cannot exceed total subtasks',
      path: ['subtasks_completed']
    }
  )
}).openapi('UpdateTaskBody')

export const uuidParamSchema = z.object({
  id: uuidSchema
})

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  assignees: z.array(z.string()).nullable(),
  due_date: z.string().nullable(),
  subtasks_completed: z.number().int().nullable(),
  subtasks_total: z.number().int().nullable(),
  status: z.string().nullable(),
  priority: z.string().nullable(),
  pinned: z.boolean().nullable(),
  completed: z.boolean().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  order_index: z.number().int().nullable(),
  completion_count: z.number().int().nullable(),
  user_email: z.string().nullable(),
  user_id: z.string(),
  impact: z.number().int().nullable(),
  severity: z.number().int().nullable(),
  timeliness: z.number().int().nullable(),
  effort: z.number().int().nullable(),
  strategic_fit: z.number().int().nullable(),
  priority_score: z.string().nullable(),
  project_id: z.string().uuid().nullable(),
  monster_type: z.string().nullable(),
  monster_colors: MonsterColorsSchema.nullable(),
  assigned_agent_id: z.string().nullable(),
}).openapi('Task')

export const TaskListSchema = z.array(TaskSchema).openapi('TaskList')

export const UpdateTaskRequestSchema = z.object({
  id: uuidSchema,
  updates: updateTaskSchema.shape.task,
}).openapi('UpdateTaskRequest')

export const DeleteTaskQuerySchema = z.object({
  id: uuidSchema,
})

export const PrioritiesAxesSchema = z.object({
  impact: z.number().min(1).max(5),
  severity: z.number().min(1).max(5),
  timeliness: z.number().min(1).max(5),
  effort: z.number().min(1).max(5),
  strategic_fit: z.number().min(1).max(5),
})

export const updatePrioritiesSchema = z.object({
  taskId: uuidSchema,
  axes: PrioritiesAxesSchema,
}).openapi('UpdatePrioritiesBody')

export const batchPrioritiesSchema = z.object({
  taskIds: z.array(uuidSchema).min(1).max(500),
}).openapi('BatchPrioritiesBody')

export const BatchPrioritiesResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
  tasks: z.array(z.object({
    taskId: z.string().uuid(),
    priorityScore: z.number(),
  })),
}).openapi('BatchPrioritiesResponse')

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
})

export const AnalyticsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({
    date: z.string(),
    tasksCreated: z.number().int().nonnegative(),
    tasksCompleted: z.number().int().nonnegative(),
  })),
  summary: z.object({
    totalTasksCreated: z.number().int().nonnegative(),
    totalTasksCompleted: z.number().int().nonnegative(),
    avgTasksCreatedPerDay: z.number().nonnegative(),
    avgTasksCompletedPerDay: z.number().nonnegative(),
    days: z.number().int().positive(),
  }),
}).openapi('TaskAnalyticsResponse')

export const incrementCompletionSchema = z.object({
  taskId: uuidSchema,
  increment: z.number().int().min(1, 'Increment must be at least 1').max(10, 'Increment too large').default(1),
}).openapi('IncrementCompletionBody')

export const IncrementCompletionResponseSchema = z.object({
  success: z.literal(true),
  completion_count: z.number().int().nonnegative(),
}).openapi('IncrementCompletionResponse')

export const DeleteSuccessSchema = z.object({
  success: z.literal(true),
}).openapi('DeleteSuccess')
