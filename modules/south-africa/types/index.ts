/**
 * South Africa Module - Type Definitions
 */

/**
 * TravelTask
 *
 * Represents a row in the travel table
 */
export interface TravelTask {
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
 * Request body for POST /api/modules/south-africa/tasks
 */
export interface CreateTaskRequest {
  title: string
  category: 'todo' | 'packing_list'
}

/**
 * UpdateTaskRequest
 *
 * Request body for PATCH /api/modules/south-africa/tasks
 */
export interface UpdateTaskRequest {
  completed?: boolean
  title?: string
}

/**
 * GetTasksResponse
 *
 * Response from GET /api/modules/south-africa/tasks
 */
export interface GetTasksResponse {
  tasks: TravelTask[]
  count: number
}

/**
 * API Error Response
 */
export interface ApiErrorResponse {
  error: string
  details?: any
}
