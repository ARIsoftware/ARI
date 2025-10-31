/**
 * Reserved Module IDs
 *
 * This file defines route paths that are reserved by the core app
 * and cannot be used as module IDs.
 *
 * Modules attempting to use these IDs will fail validation.
 */

/**
 * Complete list of reserved module IDs
 * Modules cannot use these as their ID in module.json
 */
export const RESERVED_MODULE_IDS = [
  // Core pages
  'dashboard',
  'tasks',
  'settings',
  'profile',
  'sign-in',
  'sign-up',

  // Core features
  'northstar',
  'radar',
  'fitness',
  'winter-arc',
  'hd-dashboard',
  'logs',

  // Core add/edit pages
  'add-fitness',
  'add-task',
  'edit-fitness',
  'edit-task',

  // Core utility pages
  'debug',
  'backups',

  // API routes
  'api',

  // Auth routes
  'auth',

  // Next.js reserved
  '_next',
  'public',
  'static',

  // Future reserved (planning ahead)
  'admin',
  'billing',
  'teams',
  'marketplace',
  'modules',
] as const

/**
 * Type representing a reserved module ID
 */
export type ReservedModuleId = typeof RESERVED_MODULE_IDS[number]

/**
 * Check if a module ID conflicts with a reserved route
 *
 * @param id - The module ID to check (from module.json)
 * @returns true if the ID is reserved (conflict), false if it's available
 *
 * @example
 * ```typescript
 * isReservedModuleId('dashboard')  // true - conflict!
 * isReservedModuleId('my-module')  // false - OK to use
 * ```
 */
export function isReservedModuleId(id: string): boolean {
  return RESERVED_MODULE_IDS.includes(id as ReservedModuleId)
}

/**
 * Get a user-friendly error message for reserved ID conflicts
 *
 * @param id - The conflicting module ID
 * @returns Error message explaining the conflict
 */
export function getReservedIdError(id: string): string {
  return `Module ID '${id}' conflicts with reserved route. Please choose a different ID.`
}

/**
 * Validate module ID against reserved routes and naming conventions
 *
 * @param id - Module ID to validate
 * @returns Object with validation result and error message if invalid
 */
export function validateModuleId(id: string): { valid: boolean; error?: string } {
  // Check if empty
  if (!id || id.trim().length === 0) {
    return {
      valid: false,
      error: 'Module ID cannot be empty'
    }
  }

  // Check naming convention (kebab-case: lowercase letters, numbers, hyphens)
  const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/
  if (!kebabCaseRegex.test(id)) {
    return {
      valid: false,
      error: `Module ID '${id}' must be in kebab-case (lowercase letters, numbers, and hyphens only)`
    }
  }

  // Check if reserved
  if (isReservedModuleId(id)) {
    return {
      valid: false,
      error: getReservedIdError(id)
    }
  }

  // Check length (reasonable bounds)
  if (id.length < 2) {
    return {
      valid: false,
      error: 'Module ID must be at least 2 characters long'
    }
  }

  if (id.length > 50) {
    return {
      valid: false,
      error: 'Module ID must be 50 characters or less'
    }
  }

  // ID is valid
  return { valid: true }
}
