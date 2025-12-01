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
  category: 'todo' | 'packing_list' | 'morning_routine'
  completed: boolean
  completed_at?: string | null
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
  category: 'todo' | 'packing_list' | 'morning_routine'
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

/**
 * Activity
 *
 * Represents a row in the travel_activities table
 * Can be either a Stay (accommodation) or Event
 */
export interface Activity {
  id: string
  user_id: string
  title: string
  start_date: string
  end_date: string
  address: string
  activity_type: 'stay' | 'event'
  lat?: number
  lng?: number
  created_at: string
  updated_at?: string
}

/**
 * CreateActivityRequest
 *
 * Request body for POST /api/modules/south-africa/activities
 */
export interface CreateActivityRequest {
  title: string
  start_date: string
  end_date: string
  address: string
  activity_type: 'stay' | 'event'
  lat?: number
  lng?: number
}

/**
 * GetActivitiesResponse
 *
 * Response from GET /api/modules/south-africa/activities
 */
export interface GetActivitiesResponse {
  activities: Activity[]
  count: number
}
