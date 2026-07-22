// validation.ts imports '@/lib/openapi/registry' which calls extendZodWithOpenApi(z).
// We mock @asteasolutions/zod-to-openapi so that extendZodWithOpenApi becomes a
// no-op (Zod keeps its base API) and .openapi() is monkey-patched onto every
// ZodType as a pass-through. This lets the schemas load without the OpenAPI
// registry running.
import { vi, describe, it, expect } from 'vitest'
import { z } from 'zod'

vi.mock('@asteasolutions/zod-to-openapi', () => ({
  extendZodWithOpenApi: (zodInstance: typeof z) => {
    // Add a no-op .openapi() to every ZodType prototype so `.openapi('Name')` works
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = (zodInstance as any).ZodType.prototype
    if (!proto.openapi) {
      proto.openapi = function () { return this }
    }
  },
  OpenAPIRegistry: class {
    register() {}
    registerPath() {}
    registerComponent() {}
    definitions = []
  },
}))

// Now import the schemas
import {
  createTaskSchema,
  updateTaskSchema,
  PrioritiesAxesSchema,
  prioritiesQuerySchema,
  updatePrioritiesSchema,
  batchPrioritiesSchema,
  analyticsQuerySchema,
  incrementCompletionSchema,
  createSubtaskSchema,
  UpdateSubtaskRequestSchema,
  ListSubtasksQuerySchema,
  DeleteTaskQuerySchema,
  ListTasksQuerySchema,
  TaskStatus,
  TaskPriority,
} from '@/modules-core/tasks/lib/validation'

// ---------------------------------------------------------------------------
// TaskStatus enum
// ---------------------------------------------------------------------------
describe('TaskStatus', () => {
  it('accepts valid statuses', () => {
    expect(TaskStatus.parse('Pending')).toBe('Pending')
    expect(TaskStatus.parse('In Progress')).toBe('In Progress')
    expect(TaskStatus.parse('Completed')).toBe('Completed')
  })

  it('rejects invalid status', () => {
    expect(() => TaskStatus.parse('Done')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// TaskPriority enum
// ---------------------------------------------------------------------------
describe('TaskPriority', () => {
  it('accepts Low / Medium / High', () => {
    expect(TaskPriority.parse('Low')).toBe('Low')
    expect(TaskPriority.parse('Medium')).toBe('Medium')
    expect(TaskPriority.parse('High')).toBe('High')
  })

  it('rejects invalid priority', () => {
    expect(() => TaskPriority.parse('Critical')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// createTaskSchema
// ---------------------------------------------------------------------------
describe('createTaskSchema', () => {
  const minValid = { task: { title: 'Hello' } }

  it('parses a minimal valid payload (title only)', () => {
    const result = createTaskSchema.parse(minValid)
    expect(result.task.title).toBe('Hello')
    expect(result.task.status).toBe('Pending')   // default
    expect(result.task.priority).toBe('Medium')  // default
    expect(result.task.pinned).toBe(false)
    expect(result.task.completed).toBe(false)
    expect(result.task.assignees).toEqual([])
  })

  it('rejects empty title', () => {
    expect(() => createTaskSchema.parse({ task: { title: '' } })).toThrow()
  })

  it('rejects title longer than 255 chars', () => {
    expect(() => createTaskSchema.parse({ task: { title: 'x'.repeat(256) } })).toThrow()
  })

  it('rejects notes longer than 5000 chars', () => {
    expect(() => createTaskSchema.parse({ task: { title: 'T', notes: 'x'.repeat(5001) } })).toThrow()
  })

  it('accepts notes: null', () => {
    const result = createTaskSchema.parse({ task: { title: 'T', notes: null } })
    expect(result.task.notes).toBeNull()
  })

  it('rejects description longer than 2000 chars', () => {
    expect(() => createTaskSchema.parse({ task: { title: 'T', description: 'x'.repeat(2001) } })).toThrow()
  })

  it('rejects impact out of range', () => {
    expect(() => createTaskSchema.parse({ task: { title: 'T', impact: 0 } })).toThrow()
    expect(() => createTaskSchema.parse({ task: { title: 'T', impact: 6 } })).toThrow()
  })

  it('accepts impact in [1, 5]', () => {
    const result = createTaskSchema.parse({ task: { title: 'T', impact: 5 } })
    expect(result.task.impact).toBe(5)
  })

  it('rejects more than 10 assignees', () => {
    const assignees = Array.from({ length: 11 }, (_, i) => `user-${i}`)
    expect(() => createTaskSchema.parse({ task: { title: 'T', assignees } })).toThrow()
  })

  it('accepts a date-only due_date', () => {
    const result = createTaskSchema.parse({ task: { title: 'T', due_date: '2025-12-31' } })
    expect(result.task.due_date).toBe('2025-12-31')
  })

  it('rejects malformed due_date', () => {
    expect(() => createTaskSchema.parse({ task: { title: 'T', due_date: 'not-a-date' } })).toThrow()
  })

  it('rejects a non-UUID project_id', () => {
    expect(() => createTaskSchema.parse({ task: { title: 'T', project_id: 'bad-id' } })).toThrow()
  })

  it('accepts project_id: null', () => {
    const result = createTaskSchema.parse({ task: { title: 'T', project_id: null } })
    expect(result.task.project_id).toBeNull()
  })

  it('rejects monster_type longer than 50 chars', () => {
    expect(() => createTaskSchema.parse({ task: { title: 'T', monster_type: 'x'.repeat(51) } })).toThrow()
  })

  it('accepts valid monster_colors', () => {
    const result = createTaskSchema.parse({ task: { title: 'T', monster_colors: { primary: '#fff', secondary: '#000' } } })
    expect(result.task.monster_colors?.primary).toBe('#fff')
  })
})

// ---------------------------------------------------------------------------
// updateTaskSchema
// ---------------------------------------------------------------------------
describe('updateTaskSchema', () => {
  it('parses an empty update (all fields optional)', () => {
    const result = updateTaskSchema.parse({ task: {} })
    expect(result.task).toBeDefined()
  })

  it('rejects title update to empty string', () => {
    expect(() => updateTaskSchema.parse({ task: { title: '' } })).toThrow()
  })

  it('accepts partial update with priority_score', () => {
    const result = updateTaskSchema.parse({ task: { priority_score: 7.5 } })
    expect(result.task.priority_score).toBe(7.5)
  })

  it('accepts order_index nonnegative int', () => {
    const result = updateTaskSchema.parse({ task: { order_index: 3 } })
    expect(result.task.order_index).toBe(3)
  })

  it('rejects negative order_index', () => {
    expect(() => updateTaskSchema.parse({ task: { order_index: -1 } })).toThrow()
  })

  it('accepts deleted: true', () => {
    const result = updateTaskSchema.parse({ task: { deleted: true } })
    expect(result.task.deleted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// PrioritiesAxesSchema
// ---------------------------------------------------------------------------
describe('PrioritiesAxesSchema', () => {
  it('accepts all axes at boundaries 1 and 5', () => {
    expect(() => PrioritiesAxesSchema.parse({ impact: 1, severity: 1, timeliness: 1, effort: 1, strategic_fit: 1 })).not.toThrow()
    expect(() => PrioritiesAxesSchema.parse({ impact: 5, severity: 5, timeliness: 5, effort: 5, strategic_fit: 5 })).not.toThrow()
  })

  it('rejects any axis below 1', () => {
    expect(() => PrioritiesAxesSchema.parse({ impact: 0, severity: 1, timeliness: 1, effort: 1, strategic_fit: 1 })).toThrow()
  })

  it('rejects any axis above 5', () => {
    expect(() => PrioritiesAxesSchema.parse({ impact: 1, severity: 6, timeliness: 1, effort: 1, strategic_fit: 1 })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// prioritiesQuerySchema (coercion)
// ---------------------------------------------------------------------------
describe('prioritiesQuerySchema', () => {
  it('coerces string limit/offset to numbers', () => {
    const result = prioritiesQuerySchema.parse({ limit: '10', offset: '5' })
    expect(result.limit).toBe(10)
    expect(result.offset).toBe(5)
  })

  it('rejects limit below 1', () => {
    expect(() => prioritiesQuerySchema.parse({ limit: '0' })).toThrow()
  })

  it('rejects limit above 500', () => {
    expect(() => prioritiesQuerySchema.parse({ limit: '501' })).toThrow()
  })

  it('rejects negative offset', () => {
    expect(() => prioritiesQuerySchema.parse({ offset: '-1' })).toThrow()
  })

  it('accepts completed filter "true" and "false"', () => {
    expect(prioritiesQuerySchema.parse({ completed: 'true' }).completed).toBe('true')
    expect(prioritiesQuerySchema.parse({ completed: 'false' }).completed).toBe('false')
  })

  it('parses empty object (all optional)', () => {
    const result = prioritiesQuerySchema.parse({})
    expect(result.limit).toBeUndefined()
    expect(result.offset).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// updatePrioritiesSchema
// ---------------------------------------------------------------------------
describe('updatePrioritiesSchema', () => {
  const validUuid = '00000000-0000-0000-0000-000000000001'
  const validAxes = { impact: 3, severity: 3, timeliness: 3, effort: 3, strategic_fit: 3 }

  it('accepts valid taskId + axes', () => {
    const result = updatePrioritiesSchema.parse({ taskId: validUuid, axes: validAxes })
    expect(result.taskId).toBe(validUuid)
  })

  it('rejects non-UUID taskId', () => {
    expect(() => updatePrioritiesSchema.parse({ taskId: 'bad', axes: validAxes })).toThrow()
  })

  it('rejects invalid axis values', () => {
    expect(() => updatePrioritiesSchema.parse({ taskId: validUuid, axes: { ...validAxes, impact: 0 } })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// batchPrioritiesSchema
// ---------------------------------------------------------------------------
describe('batchPrioritiesSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001'

  it('accepts an array of UUIDs', () => {
    const result = batchPrioritiesSchema.parse({ taskIds: [uuid] })
    expect(result.taskIds).toEqual([uuid])
  })

  it('rejects an empty array', () => {
    expect(() => batchPrioritiesSchema.parse({ taskIds: [] })).toThrow()
  })

  it('rejects an array longer than 500', () => {
    const ids = Array.from({ length: 501 }, () => uuid)
    expect(() => batchPrioritiesSchema.parse({ taskIds: ids })).toThrow()
  })

  it('rejects non-UUID entries', () => {
    expect(() => batchPrioritiesSchema.parse({ taskIds: ['not-a-uuid'] })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// analyticsQuerySchema
// ---------------------------------------------------------------------------
describe('analyticsQuerySchema', () => {
  it('parses days in range [1, 365]', () => {
    expect(analyticsQuerySchema.parse({ days: 30 }).days).toBe(30)
    expect(analyticsQuerySchema.parse({ days: 1 }).days).toBe(1)
    expect(analyticsQuerySchema.parse({ days: 365 }).days).toBe(365)
  })

  it('rejects days = 0', () => {
    expect(() => analyticsQuerySchema.parse({ days: 0 })).toThrow()
  })

  it('rejects days > 365', () => {
    expect(() => analyticsQuerySchema.parse({ days: 366 })).toThrow()
  })

  it('parses without days (optional)', () => {
    const result = analyticsQuerySchema.parse({})
    expect(result.days).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// incrementCompletionSchema
// ---------------------------------------------------------------------------
describe('incrementCompletionSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001'

  it('defaults increment to 1', () => {
    const result = incrementCompletionSchema.parse({ taskId: uuid })
    expect(result.increment).toBe(1)
  })

  it('accepts increment in [1, 10]', () => {
    expect(incrementCompletionSchema.parse({ taskId: uuid, increment: 10 }).increment).toBe(10)
  })

  it('rejects increment < 1', () => {
    expect(() => incrementCompletionSchema.parse({ taskId: uuid, increment: 0 })).toThrow()
  })

  it('rejects increment > 10', () => {
    expect(() => incrementCompletionSchema.parse({ taskId: uuid, increment: 11 })).toThrow()
  })

  it('rejects non-UUID taskId', () => {
    expect(() => incrementCompletionSchema.parse({ taskId: 'not-uuid' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// createSubtaskSchema
// ---------------------------------------------------------------------------
describe('createSubtaskSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001'

  it('accepts valid subtask', () => {
    const result = createSubtaskSchema.parse({ subtask: { task_id: uuid, title: 'Do something' } })
    expect(result.subtask.title).toBe('Do something')
  })

  it('rejects empty title', () => {
    expect(() => createSubtaskSchema.parse({ subtask: { task_id: uuid, title: '' } })).toThrow()
  })

  it('rejects title > 255 chars', () => {
    expect(() => createSubtaskSchema.parse({ subtask: { task_id: uuid, title: 'x'.repeat(256) } })).toThrow()
  })

  it('rejects non-UUID task_id', () => {
    expect(() => createSubtaskSchema.parse({ subtask: { task_id: 'bad', title: 'T' } })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// UpdateSubtaskRequestSchema
// ---------------------------------------------------------------------------
describe('UpdateSubtaskRequestSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001'

  it('accepts partial updates', () => {
    const result = UpdateSubtaskRequestSchema.parse({ id: uuid, updates: { completed: true } })
    expect(result.updates.completed).toBe(true)
  })

  it('accepts order_index 0', () => {
    const result = UpdateSubtaskRequestSchema.parse({ id: uuid, updates: { order_index: 0 } })
    expect(result.updates.order_index).toBe(0)
  })

  it('rejects negative order_index', () => {
    expect(() => UpdateSubtaskRequestSchema.parse({ id: uuid, updates: { order_index: -1 } })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// ListSubtasksQuerySchema
// ---------------------------------------------------------------------------
describe('ListSubtasksQuerySchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001'

  it('accepts task_id as UUID', () => {
    expect(ListSubtasksQuerySchema.parse({ task_id: uuid }).task_id).toBe(uuid)
  })

  it('accepts missing task_id (optional)', () => {
    expect(ListSubtasksQuerySchema.parse({}).task_id).toBeUndefined()
  })

  it('rejects non-UUID task_id', () => {
    expect(() => ListSubtasksQuerySchema.parse({ task_id: 'nope' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// DeleteTaskQuerySchema
// ---------------------------------------------------------------------------
describe('DeleteTaskQuerySchema', () => {
  it('accepts valid UUID', () => {
    const uuid = '00000000-0000-0000-0000-000000000001'
    expect(DeleteTaskQuerySchema.parse({ id: uuid }).id).toBe(uuid)
  })

  it('rejects non-UUID', () => {
    expect(() => DeleteTaskQuerySchema.parse({ id: 'bad' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// ListTasksQuerySchema
// ---------------------------------------------------------------------------
describe('ListTasksQuerySchema', () => {
  it('accepts deleted="true"', () => {
    expect(ListTasksQuerySchema.parse({ deleted: 'true' }).deleted).toBe('true')
  })

  it('accepts deleted="false"', () => {
    expect(ListTasksQuerySchema.parse({ deleted: 'false' }).deleted).toBe('false')
  })

  it('accepts missing deleted (optional)', () => {
    expect(ListTasksQuerySchema.parse({}).deleted).toBeUndefined()
  })

  it('rejects deleted="yes"', () => {
    expect(() => ListTasksQuerySchema.parse({ deleted: 'yes' })).toThrow()
  })
})
