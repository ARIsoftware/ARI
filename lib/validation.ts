// Comprehensive API validation schemas using Zod
import { z } from 'zod'

// Common validation patterns
const uuidSchema = z.string().uuid('Invalid UUID format')
const emailSchema = z.string().email('Invalid email format')
const nonEmptyString = z.string().min(1, 'Cannot be empty')
const positiveNumber = z.number().positive('Must be positive')
const nonNegativeNumber = z.number().nonnegative('Cannot be negative')

// Task-related schemas
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
    due_date: z.string().datetime('Invalid date format').optional(),
    starred: z.boolean().default(false),
    completed: z.boolean().default(false),
    subtasks_total: nonNegativeNumber.max(100, 'Too many subtasks').default(0),
    subtasks_completed: nonNegativeNumber.default(0),
    impact: z.number().min(1).max(5).default(3).optional(),
    severity: z.number().min(1).max(5).default(3).optional(),
    timeliness: z.number().min(1).max(5).default(3).optional(),
    effort: z.number().min(1).max(5).default(3).optional(),
    strategic_fit: z.number().min(1).max(5).default(3).optional()
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
    due_date: z.string().datetime('Invalid date format').optional(),
    starred: z.boolean().optional(),
    completed: z.boolean().optional(),
    subtasks_total: nonNegativeNumber.max(100, 'Too many subtasks').optional(),
    subtasks_completed: nonNegativeNumber.optional(),
    impact: z.number().min(1).max(5).optional(),
    severity: z.number().min(1).max(5).optional(),
    timeliness: z.number().min(1).max(5).optional(),
    effort: z.number().min(1).max(5).optional(),
    strategic_fit: z.number().min(1).max(5).optional(),
    priority_score: z.number().optional()
  }).refine(
    (data) => !data.subtasks_completed || !data.subtasks_total || data.subtasks_completed <= data.subtasks_total,
    {
      message: 'Completed subtasks cannot exceed total subtasks',
      path: ['subtasks_completed']
    }
  )
})

export const incrementTaskCompletionSchema = z.object({
  increment: z.number().int().min(1, 'Increment must be at least 1').max(10, 'Increment too large')
})

// Contact-related schemas
export const createContactSchema = z.object({
  contact: z.object({
    name: nonEmptyString.max(255, 'Name too long'),
    email: emailSchema.max(255, 'Email too long').optional(),
    phone: z.string().max(50, 'Phone too long').optional(),
    company: z.string().max(255, 'Company name too long').optional(),
    notes: z.string().max(2000, 'Notes too long').optional()
  })
})

export const updateContactSchema = z.object({
  contact: z.object({
    name: nonEmptyString.max(255, 'Name too long').optional(),
    email: emailSchema.max(255, 'Email too long').optional(),
    phone: z.string().max(50, 'Phone too long').optional(),
    company: z.string().max(255, 'Company name too long').optional(),
    notes: z.string().max(2000, 'Notes too long').optional()
  })
})

// Fitness-related schemas
export const createFitnessTaskSchema = z.object({
  fitnessTask: z.object({
    title: nonEmptyString.max(255, 'Title too long'),
    description: z.string().max(2000, 'Description too long').optional(),
    completed: z.boolean().default(false),
    order_index: nonNegativeNumber.optional()
  })
})

export const updateFitnessTaskSchema = z.object({
  fitnessTask: z.object({
    title: nonEmptyString.max(255, 'Title too long').optional(),
    description: z.string().max(2000, 'Description too long').optional(),
    completed: z.boolean().optional(),
    order_index: nonNegativeNumber.optional()
  })
})

// Goal-related schemas
export const createGoalSchema = z.object({
  goal: z.object({
    title: nonEmptyString.max(255, 'Title too long'),
    description: z.string().max(2000, 'Description too long').optional(),
    completed: z.boolean().default(false),
    target_date: z.string().datetime('Invalid date format').optional(),
    progress: z.number().min(0, 'Progress cannot be negative').max(100, 'Progress cannot exceed 100%').default(0)
  })
})

export const updateGoalSchema = z.object({
  goal: z.object({
    title: nonEmptyString.max(255, 'Title too long').optional(),
    description: z.string().max(2000, 'Description too long').optional(),
    completed: z.boolean().optional(),
    target_date: z.string().datetime('Invalid date format').optional(),
    progress: z.number().min(0, 'Progress cannot be negative').max(100, 'Progress cannot exceed 100%').optional()
  })
})

// HYROX-related schemas
export const HyroxStationName = z.enum([
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Rowing',
  'Farmers Carry', 'Sandbag Lunges', 'Wall Balls', '1km Run'
], {
  errorMap: () => ({ message: 'Invalid HYROX station name' })
})

export const updateStationRecordSchema = z.object({
  stationName: HyroxStationName,
  newTime: positiveNumber.max(3600000, 'Time cannot exceed 1 hour') // milliseconds
})

export const createHyroxWorkoutSchema = z.object({
  workout: z.object({
    total_time: nonNegativeNumber.max(7200000, 'Total time cannot exceed 2 hours').default(0), // milliseconds
    completed: z.boolean().default(false)
  })
})

export const completeHyroxWorkoutSchema = z.object({
  workoutId: uuidSchema,
  totalTime: positiveNumber.max(7200000, 'Total time cannot exceed 2 hours') // milliseconds
})

export const addWorkoutStationSchema = z.object({
  workoutId: uuidSchema,
  stationName: HyroxStationName,
  stationOrder: z.number().int().min(1, 'Station order must be at least 1').max(20, 'Station order too high'),
  stationTime: positiveNumber.max(3600000, 'Station time cannot exceed 1 hour').optional(), // milliseconds
  completed: z.boolean().default(true)
})

// Backup-related schemas (for completeness, though these are admin-only)
export const backupImportSchema = z.object({
  file: z.string().min(1, 'File content cannot be empty'),
  validateOnly: z.boolean().default(false)
})

// Path parameter schemas
export const uuidParamSchema = z.object({
  id: uuidSchema
})

// Query parameter schemas
export const paginationSchema = z.object({
  limit: z.string().regex(/^\d+$/, 'Limit must be a number').transform(Number).pipe(
    z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100')
  ).default('10'),
  offset: z.string().regex(/^\d+$/, 'Offset must be a number').transform(Number).pipe(
    z.number().int().nonnegative('Offset cannot be negative')
  ).default('0')
})

// Generic validation utility
export function validateRequestBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
      throw new ValidationError('Invalid request data', errorMessages)
    }
    throw error
  }
}

export class ValidationError extends Error {
  public readonly errors: Array<{ field: string; message: string }>
  
  constructor(message: string, errors: Array<{ field: string; message: string }>) {
    super(message)
    this.name = 'ValidationError'
    this.errors = errors
  }
}