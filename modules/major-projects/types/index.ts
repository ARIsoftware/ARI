/**
 * TypeScript Type Definitions for Major Projects Module
 *
 * This file contains all TypeScript interfaces and types used throughout the
 * Major Projects module, including database models, API request/response types,
 * and UI component props.
 *
 * @module major-projects/types
 * @version 1.0.0
 */

// ============================================================================
// DATABASE TYPES
// ============================================================================

/**
 * MajorProject
 *
 * Represents a major project in the database.
 * Projects belong to a specific user and can be linked to tasks.
 *
 * @interface MajorProject
 * @property {string} id - Unique UUID identifier for the project
 * @property {string} user_id - UUID of the user who owns this project
 * @property {string} project_name - Name/title of the project (max 255 chars)
 * @property {string | null} project_description - Optional detailed description
 * @property {string | null} project_due_date - Optional due date (ISO date string)
 * @property {string} created_at - ISO timestamp when project was created
 * @property {string} updated_at - ISO timestamp when project was last updated
 *
 * @example
 * ```typescript
 * const project: MajorProject = {
 *   id: "123e4567-e89b-12d3-a456-426614174000",
 *   user_id: "user-uuid-here",
 *   project_name: "Website Redesign",
 *   project_description: "Complete overhaul of company website",
 *   project_due_date: "2025-12-31",
 *   created_at: "2025-01-01T00:00:00.000Z",
 *   updated_at: "2025-01-15T12:30:00.000Z"
 * }
 * ```
 */
export interface MajorProject {
  id: string
  user_id: string
  project_name: string
  project_description: string | null
  project_due_date: string | null
  created_at: string
  updated_at: string
}

/**
 * ProjectStatus
 *
 * Calculated status of a project based on its due date.
 * Used for badge coloring and sorting logic.
 *
 * @type ProjectStatus
 */
export type ProjectStatus = 'overdue' | 'due_soon' | 'upcoming' | 'active' | 'no_due_date'

// ============================================================================
// API REQUEST TYPES
// ============================================================================

/**
 * CreateProjectRequest
 *
 * Request body for creating a new major project.
 * Only project_name is required; description and due_date are optional.
 *
 * @interface CreateProjectRequest
 * @property {string} project_name - Name of the project (1-255 characters)
 * @property {string | null} [project_description] - Optional description (max 2000 chars)
 * @property {string | null} [project_due_date] - Optional due date (ISO date or YYYY-MM-DD)
 *
 * @example
 * ```typescript
 * const request: CreateProjectRequest = {
 *   project_name: "Q1 Marketing Campaign",
 *   project_description: "Launch new product line marketing",
 *   project_due_date: "2025-03-31"
 * }
 * ```
 */
export interface CreateProjectRequest {
  project_name: string
  project_description?: string | null
  project_due_date?: string | null
}

/**
 * UpdateProjectRequest
 *
 * Request body for updating an existing project.
 * All fields are optional - only include fields you want to change.
 *
 * @interface UpdateProjectRequest
 * @property {string} [project_name] - New project name
 * @property {string | null} [project_description] - New description (null to clear)
 * @property {string | null} [project_due_date] - New due date (null to clear)
 *
 * @example
 * ```typescript
 * // Update only the due date
 * const request: UpdateProjectRequest = {
 *   project_due_date: "2025-12-31"
 * }
 * ```
 */
export interface UpdateProjectRequest {
  project_name?: string
  project_description?: string | null
  project_due_date?: string | null
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * GetProjectsResponse
 *
 * Response from GET /api/modules/major-projects/data
 * Returns array of all projects for the authenticated user.
 *
 * @interface GetProjectsResponse
 * @property {MajorProject[]} projects - Array of user's projects
 * @property {number} count - Total number of projects returned
 *
 * @example
 * ```typescript
 * const response: GetProjectsResponse = {
 *   projects: [project1, project2],
 *   count: 2
 * }
 * ```
 */
export interface GetProjectsResponse {
  projects: MajorProject[]
  count: number
}

/**
 * CreateProjectResponse
 *
 * Response from POST /api/modules/major-projects/data
 * Returns the newly created project.
 *
 * @interface CreateProjectResponse
 * @property {MajorProject} project - The created project with generated ID and timestamps
 *
 * @example
 * ```typescript
 * const response: CreateProjectResponse = {
 *   project: {
 *     id: "new-uuid",
 *     user_id: "user-uuid",
 *     project_name: "New Project",
 *     project_description: null,
 *     project_due_date: null,
 *     created_at: "2025-01-01T00:00:00.000Z",
 *     updated_at: "2025-01-01T00:00:00.000Z"
 *   }
 * }
 * ```
 */
export interface CreateProjectResponse {
  project: MajorProject
}

/**
 * UpdateProjectResponse
 *
 * Response from PATCH /api/modules/major-projects/data/[id]
 * Returns the updated project.
 *
 * @interface UpdateProjectResponse
 * @property {MajorProject} project - The updated project with new updated_at timestamp
 */
export interface UpdateProjectResponse {
  project: MajorProject
}

/**
 * DeleteProjectResponse
 *
 * Response from DELETE /api/modules/major-projects/data/[id]
 * Confirms successful deletion.
 *
 * @interface DeleteProjectResponse
 * @property {boolean} success - Always true if deletion succeeded
 * @property {string} message - Confirmation message
 */
export interface DeleteProjectResponse {
  success: boolean
  message: string
}

/**
 * ApiErrorResponse
 *
 * Standard error response format for all API endpoints.
 *
 * @interface ApiErrorResponse
 * @property {string} error - Human-readable error message
 * @property {string} [details] - Optional additional error details
 * @property {string} [code] - Optional error code for programmatic handling
 */
export interface ApiErrorResponse {
  error: string
  details?: string
  code?: string
}

// ============================================================================
// UI COMPONENT TYPES
// ============================================================================

/**
 * ProjectStatistics
 *
 * Calculated statistics for dashboard cards and analytics.
 *
 * @interface ProjectStatistics
 * @property {number} total - Total number of projects
 * @property {number} dueSoon - Projects due within 7 days
 * @property {number} onTrack - Projects with more than 7 days until due
 * @property {number} overdue - Projects past their due date
 * @property {number} noDueDate - Projects without a due date
 */
export interface ProjectStatistics {
  total: number
  dueSoon: number
  onTrack: number
  overdue: number
  noDueDate: number
}

/**
 * ProjectWithStatus
 *
 * MajorProject with additional computed fields for UI rendering.
 * Used in the main page component for status badges and colors.
 *
 * @interface ProjectWithStatus
 * @extends MajorProject
 * @property {ProjectStatus} status - Computed status based on due date
 * @property {number | null} daysUntilDue - Days until due date (negative if overdue)
 * @property {string} badgeColor - Color class for status badge
 * @property {string} badgeIcon - Icon name for status badge
 */
export interface ProjectWithStatus extends MajorProject {
  status: ProjectStatus
  daysUntilDue: number | null
  badgeColor: string
  badgeIcon: string
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

/**
 * MajorProjectsSettings
 *
 * User preferences for the Major Projects module.
 * Stored in the module_settings table.
 *
 * @interface MajorProjectsSettings
 * @property {boolean} showInDashboard - Whether to display widget on dashboard
 * @property {boolean} enableNotifications - Enable due date notifications
 * @property {'name' | 'due_date' | 'created_at'} defaultSortBy - Default sort order
 * @property {'asc' | 'desc'} defaultSortOrder - Default sort direction
 * @property {number} dueSoonThreshold - Days to consider "due soon" (default: 7)
 */
export interface MajorProjectsSettings {
  showInDashboard: boolean
  enableNotifications: boolean
  defaultSortBy: 'name' | 'due_date' | 'created_at'
  defaultSortOrder: 'asc' | 'desc'
  dueSoonThreshold: number
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an object is a valid MajorProject
 *
 * @param obj - Object to check
 * @returns True if obj matches MajorProject interface
 *
 * @example
 * ```typescript
 * const data = await fetchProject()
 * if (isMajorProject(data)) {
 *   console.log(data.project_name) // TypeScript knows this is safe
 * }
 * ```
 */
export function isMajorProject(obj: unknown): obj is MajorProject {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'user_id' in obj &&
    'project_name' in obj &&
    'created_at' in obj &&
    typeof (obj as any).id === 'string' &&
    typeof (obj as any).user_id === 'string' &&
    typeof (obj as any).project_name === 'string' &&
    typeof (obj as any).created_at === 'string'
  )
}

/**
 * Type guard to check if a value is a valid ProjectStatus
 *
 * @param value - Value to check
 * @returns True if value is a valid ProjectStatus
 */
export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === 'string' &&
    ['overdue', 'due_soon', 'upcoming', 'active', 'no_due_date'].includes(value)
  )
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Partial update type for optimistic UI updates
 */
export type PartialProject = Partial<MajorProject> & { id: string }

/**
 * Project creation input (excludes auto-generated fields)
 */
export type ProjectInput = Omit<MajorProject, 'id' | 'user_id' | 'created_at' | 'updated_at'>

/**
 * Project for display (includes computed fields)
 */
export type ProjectDisplay = MajorProject & {
  formattedDueDate?: string
  daysUntilDue?: number
  taskCount?: number
}
