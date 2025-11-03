/**
 * Major Projects Module - Utility Functions
 *
 * This file contains helper functions for working with major projects,
 * including API calls, date calculations, status determination, and statistics.
 *
 * All functions are pure (no side effects) except for the API call functions.
 *
 * @module major-projects/lib/utils
 * @version 1.0.0
 */

import type {
  MajorProject,
  ProjectStatus,
  ProjectStatistics,
  ProjectWithStatus,
  CreateProjectRequest,
  UpdateProjectRequest
} from '../types'

// ============================================================================
// API CALL FUNCTIONS
// ============================================================================

/**
 * Fetch all major projects for the authenticated user
 *
 * @returns Promise resolving to array of projects
 * @throws Error if request fails or user is not authenticated
 *
 * @example
 * ```typescript
 * try {
 *   const projects = await getMajorProjects()
 *   console.log(`Found ${projects.length} projects`)
 * } catch (error) {
 *   console.error('Failed to load projects:', error.message)
 * }
 * ```
 */
export async function getMajorProjects(): Promise<MajorProject[]> {
  const response = await fetch('/api/modules/major-projects/data', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch major projects')
  }

  return response.json()
}

/**
 * Create a new major project
 *
 * @param project_name - Name of the project (required, 1-255 characters)
 * @param project_description - Optional description (max 2000 characters)
 * @param project_due_date - Optional due date (ISO string or YYYY-MM-DD)
 * @returns Promise resolving to the created project
 * @throws Error if validation fails or request fails
 *
 * @example
 * ```typescript
 * const newProject = await createMajorProject(
 *   'Website Redesign',
 *   'Complete overhaul of company website',
 *   '2025-12-31'
 * )
 * ```
 */
export async function createMajorProject(
  project_name: string,
  project_description: string | null,
  project_due_date: string | null
): Promise<MajorProject> {
  const response = await fetch('/api/modules/major-projects/data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_name,
      project_description,
      project_due_date,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create major project')
  }

  return response.json()
}

/**
 * Update an existing major project
 *
 * All parameters except id are optional. Only provided fields will be updated.
 *
 * @param id - UUID of the project to update
 * @param project_name - New project name (optional)
 * @param project_description - New description (optional, null to clear)
 * @param project_due_date - New due date (optional, null to clear)
 * @returns Promise resolving to the updated project
 * @throws Error if project not found or validation fails
 *
 * @example
 * ```typescript
 * // Update only the due date
 * const updated = await updateMajorProject(
 *   'project-uuid',
 *   undefined,
 *   undefined,
 *   '2025-12-31'
 * )
 * ```
 */
export async function updateMajorProject(
  id: string,
  project_name?: string,
  project_description?: string | null,
  project_due_date?: string | null
): Promise<MajorProject> {
  const response = await fetch(`/api/modules/major-projects/data/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_name,
      project_description,
      project_due_date,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update major project')
  }

  return response.json()
}

/**
 * Delete a major project
 *
 * This is a permanent deletion. The project cannot be recovered after deletion.
 *
 * @param id - UUID of the project to delete
 * @returns Promise that resolves when deletion is complete
 * @throws Error if project not found or deletion fails
 *
 * @example
 * ```typescript
 * await deleteMajorProject('project-uuid')
 * console.log('Project deleted successfully')
 * ```
 */
export async function deleteMajorProject(id: string): Promise<void> {
  const response = await fetch(`/api/modules/major-projects/data/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete major project')
  }
}

// ============================================================================
// DATE UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate days until due date
 *
 * @param dueDate - ISO date string or YYYY-MM-DD format
 * @returns Number of days until due (negative if overdue), or null if no due date
 *
 * @example
 * ```typescript
 * const days = calculateDaysUntilDue('2025-12-31')
 * if (days < 0) console.log(`Overdue by ${Math.abs(days)} days`)
 * else if (days === 0) console.log('Due today!')
 * else console.log(`Due in ${days} days`)
 * ```
 */
export function calculateDaysUntilDue(dueDate: string | null): number | null {
  if (!dueDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0) // Reset to start of day for accurate comparison

  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)

  const diffTime = due.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

/**
 * Format due date for display
 *
 * @param dueDate - ISO date string or YYYY-MM-DD format
 * @returns Formatted date string (e.g., "Dec 31, 2025") or "No due date"
 *
 * @example
 * ```typescript
 * formatDueDate('2025-12-31') // "Dec 31, 2025"
 * formatDueDate(null) // "No due date"
 * ```
 */
export function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'No due date'

  const date = new Date(dueDate)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Format due date with countdown
 *
 * @param dueDate - ISO date string or YYYY-MM-DD format
 * @returns Formatted string with date and countdown (e.g., "Dec 31, 2025 (5 days left)")
 *
 * @example
 * ```typescript
 * formatDueDateWithCountdown('2025-12-31') // "Dec 31, 2025 (5 days left)"
 * formatDueDateWithCountdown(null) // "No due date"
 * ```
 */
export function formatDueDateWithCountdown(dueDate: string | null): string {
  if (!dueDate) return 'No due date'

  const formatted = formatDueDate(dueDate)
  const days = calculateDaysUntilDue(dueDate)

  if (days === null) return formatted
  if (days < 0) return `${formatted} (${Math.abs(days)} days overdue)`
  if (days === 0) return `${formatted} (Due today!)`
  if (days === 1) return `${formatted} (1 day left)`
  return `${formatted} (${days} days left)`
}

// ============================================================================
// STATUS CALCULATION FUNCTIONS
// ============================================================================

/**
 * Determine project status based on due date
 *
 * Status categories:
 * - overdue: Past due date
 * - due_soon: 0-7 days until due
 * - upcoming: 8-30 days until due
 * - active: More than 30 days until due
 * - no_due_date: No due date set
 *
 * @param dueDate - ISO date string or YYYY-MM-DD format
 * @returns ProjectStatus enum value
 *
 * @example
 * ```typescript
 * const status = getProjectStatus('2025-12-31')
 * if (status === 'overdue') {
 *   console.log('This project needs attention!')
 * }
 * ```
 */
export function getProjectStatus(dueDate: string | null): ProjectStatus {
  const days = calculateDaysUntilDue(dueDate)

  if (days === null) return 'no_due_date'
  if (days < 0) return 'overdue'
  if (days <= 7) return 'due_soon'
  if (days <= 30) return 'upcoming'
  return 'active'
}

/**
 * Get badge color class for project status
 *
 * @param status - ProjectStatus enum value
 * @returns Tailwind CSS class string for badge styling
 *
 * @example
 * ```typescript
 * const color = getStatusBadgeColor('overdue') // "bg-red-100 text-red-800"
 * ```
 */
export function getStatusBadgeColor(status: ProjectStatus): string {
  const colors = {
    overdue: 'bg-red-100 text-red-800 border-red-200',
    due_soon: 'bg-orange-100 text-orange-800 border-orange-200',
    upcoming: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    active: 'bg-green-100 text-green-800 border-green-200',
    no_due_date: 'bg-gray-100 text-gray-800 border-gray-200'
  }

  return colors[status] || colors.no_due_date
}

/**
 * Get status label for display
 *
 * @param status - ProjectStatus enum value
 * @returns Human-readable status label
 *
 * @example
 * ```typescript
 * getStatusLabel('due_soon') // "Due Soon"
 * ```
 */
export function getStatusLabel(status: ProjectStatus): string {
  const labels = {
    overdue: 'Overdue',
    due_soon: 'Due Soon',
    upcoming: 'Upcoming',
    active: 'Active',
    no_due_date: 'No Due Date'
  }

  return labels[status] || 'Unknown'
}

/**
 * Get status icon for display
 *
 * @param status - ProjectStatus enum value
 * @returns Emoji icon representing the status
 *
 * @example
 * ```typescript
 * getStatusIcon('overdue') // "⚠️"
 * ```
 */
export function getStatusIcon(status: ProjectStatus): string {
  const icons = {
    overdue: '⚠️',
    due_soon: '🔥',
    upcoming: '⏰',
    active: '✨',
    no_due_date: '📋'
  }

  return icons[status] || '📋'
}

// ============================================================================
// PROJECT STATISTICS FUNCTIONS
// ============================================================================

/**
 * Calculate statistics for a list of projects
 *
 * @param projects - Array of MajorProject objects
 * @returns ProjectStatistics object with counts for each category
 *
 * @example
 * ```typescript
 * const stats = getProjectStatistics(projects)
 * console.log(`${stats.dueSoon} projects due soon`)
 * console.log(`${stats.overdue} projects overdue`)
 * ```
 */
export function getProjectStatistics(projects: MajorProject[]): ProjectStatistics {
  const stats: ProjectStatistics = {
    total: projects.length,
    dueSoon: 0,
    onTrack: 0,
    overdue: 0,
    noDueDate: 0
  }

  projects.forEach(project => {
    const status = getProjectStatus(project.project_due_date)

    switch (status) {
      case 'overdue':
        stats.overdue++
        break
      case 'due_soon':
        stats.dueSoon++
        break
      case 'upcoming':
      case 'active':
        stats.onTrack++
        break
      case 'no_due_date':
        stats.noDueDate++
        break
    }
  })

  return stats
}

/**
 * Enhance projects with computed status fields
 *
 * Adds status, daysUntilDue, badgeColor, and badgeIcon to each project
 * for easier rendering in UI components.
 *
 * @param projects - Array of MajorProject objects
 * @returns Array of ProjectWithStatus objects
 *
 * @example
 * ```typescript
 * const enhanced = enhanceProjectsWithStatus(projects)
 * enhanced.forEach(project => {
 *   console.log(`${project.project_name}: ${project.status} ${project.badgeIcon}`)
 * })
 * ```
 */
export function enhanceProjectsWithStatus(projects: MajorProject[]): ProjectWithStatus[] {
  return projects.map(project => {
    const status = getProjectStatus(project.project_due_date)
    const daysUntilDue = calculateDaysUntilDue(project.project_due_date)

    return {
      ...project,
      status,
      daysUntilDue,
      badgeColor: getStatusBadgeColor(status),
      badgeIcon: getStatusIcon(status)
    }
  })
}

// ============================================================================
// SORTING FUNCTIONS
// ============================================================================

/**
 * Sort projects by due date (earliest first, null dates last)
 *
 * @param projects - Array of projects to sort
 * @returns Sorted array (does not mutate original)
 *
 * @example
 * ```typescript
 * const sorted = sortProjectsByDueDate(projects)
 * ```
 */
export function sortProjectsByDueDate(projects: MajorProject[]): MajorProject[] {
  return [...projects].sort((a, b) => {
    // Null dates go to the end
    if (!a.project_due_date && !b.project_due_date) return 0
    if (!a.project_due_date) return 1
    if (!b.project_due_date) return -1

    // Compare dates
    return new Date(a.project_due_date).getTime() - new Date(b.project_due_date).getTime()
  })
}

/**
 * Sort projects by name (alphabetical)
 *
 * @param projects - Array of projects to sort
 * @returns Sorted array (does not mutate original)
 *
 * @example
 * ```typescript
 * const sorted = sortProjectsByName(projects)
 * ```
 */
export function sortProjectsByName(projects: MajorProject[]): MajorProject[] {
  return [...projects].sort((a, b) =>
    a.project_name.localeCompare(b.project_name, 'en', { sensitivity: 'base' })
  )
}

/**
 * Sort projects by creation date (newest first)
 *
 * @param projects - Array of projects to sort
 * @returns Sorted array (does not mutate original)
 *
 * @example
 * ```typescript
 * const sorted = sortProjectsByCreatedDate(projects)
 * ```
 */
export function sortProjectsByCreatedDate(projects: MajorProject[]): MajorProject[] {
  return [...projects].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate project name
 *
 * @param name - Project name to validate
 * @returns Object with valid flag and optional error message
 *
 * @example
 * ```typescript
 * const result = validateProjectName('My Project')
 * if (!result.valid) {
 *   console.error(result.error)
 * }
 * ```
 */
export function validateProjectName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Project name is required' }
  }

  if (trimmed.length > 255) {
    return { valid: false, error: 'Project name must be 255 characters or less' }
  }

  return { valid: true }
}

/**
 * Validate project description
 *
 * @param description - Project description to validate
 * @returns Object with valid flag and optional error message
 *
 * @example
 * ```typescript
 * const result = validateProjectDescription(description)
 * if (!result.valid) {
 *   console.error(result.error)
 * }
 * ```
 */
export function validateProjectDescription(description: string): { valid: boolean; error?: string } {
  if (description.length > 2000) {
    return { valid: false, error: 'Description must be 2000 characters or less' }
  }

  return { valid: true }
}

// ============================================================================
// DEVELOPER NOTES
// ============================================================================

/**
 * Date Handling Best Practices:
 *
 * 1. Always use setHours(0,0,0,0) when comparing dates by day
 *    - Prevents time-of-day from affecting day calculations
 *
 * 2. Store dates in ISO format or YYYY-MM-DD in database
 *    - ISO format: "2025-12-31T00:00:00.000Z"
 *    - Simple format: "2025-12-31"
 *    - Both work with new Date() constructor
 *
 * 3. Use Math.ceil for day calculations
 *    - Ensures partial days count as full days
 *    - "Due in 0.5 days" becomes "Due in 1 day"
 *
 * 4. Handle null values explicitly
 *    - Projects without due dates should be handled gracefully
 *    - Don't crash on null, return sensible defaults
 */

/**
 * Status Thresholds:
 *
 * The 7-day and 30-day thresholds are arbitrary but common in project management:
 * - 7 days: "This week" - needs immediate attention
 * - 30 days: "This month" - needs planning
 * - >30 days: "Future" - long-term tracking
 *
 * These can be made configurable via settings if needed.
 */

/**
 * Performance Considerations:
 *
 * All utility functions are pure and fast:
 * - No async operations (except API calls)
 * - No DOM access
 * - No external dependencies (except types)
 * - Safe to call frequently in render cycles
 *
 * Sorting functions create new arrays (non-mutating):
 * - Prevents unexpected side effects
 * - Safe for React state management
 * - Slightly higher memory usage, but negligible for typical project counts
 */
