/**
 * Cape Town Module - Type Definitions
 */

/**
 * CapeTownTask
 *
 * Represents a row in the cape_town table
 */
export interface CapeTownTask {
  id: string
  user_id: string
  title: string
  category: 'todo' | 'packing_list'
  completed: boolean
  created_at: string
  updated_at?: string
}

/**
 * CreateTaskRequest
 *
 * Request body for POST /api/modules/cape-town/tasks
 */
export interface CreateTaskRequest {
  title: string
  category: 'todo' | 'packing_list'
}

/**
 * UpdateTaskRequest
 *
 * Request body for PATCH /api/modules/cape-town/tasks
 */
export interface UpdateTaskRequest {
  completed?: boolean
  title?: string
}

/**
 * GetTasksResponse
 *
 * Response from GET /api/modules/cape-town/tasks
 */
export interface GetTasksResponse {
  tasks: CapeTownTask[]
  count: number
}

/**
 * API Error Response
 */
export interface ApiErrorResponse {
  error: string
  details?: any
}
