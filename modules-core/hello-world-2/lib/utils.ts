/**
 * Hello World Module - Utility Functions
 *
 * This file contains helper functions used across the module.
 * It demonstrates:
 * - Reusable utility functions
 * - Type-safe helpers
 * - Common patterns
 */

import type { HelloWorldEntry } from '../types'

/**
 * Format entry date for display
 *
 * @param dateString - ISO date string from database
 * @returns Formatted date string
 */
export function formatEntryDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

  return date.toLocaleDateString()
}

/**
 * Validate message content
 *
 * @param message - Message to validate
 * @returns Validation result with error message if invalid
 */
export function validateMessage(message: string): { valid: boolean; error?: string } {
  if (!message || message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' }
  }

  if (message.length > 500) {
    return { valid: false, error: 'Message must be less than 500 characters' }
  }

  return { valid: true }
}

/**
 * Sort entries by date
 *
 * @param entries - Array of entries to sort
 * @param order - Sort order ('asc' or 'desc')
 * @returns Sorted array
 */
export function sortEntriesByDate(
  entries: HelloWorldEntry[],
  order: 'asc' | 'desc' = 'desc'
): HelloWorldEntry[] {
  return [...entries].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime()
    const dateB = new Date(b.created_at).getTime()
    return order === 'desc' ? dateB - dateA : dateA - dateB
  })
}

/**
 * Filter entries by search query
 *
 * @param entries - Array of entries to filter
 * @param query - Search query string
 * @returns Filtered array
 */
export function filterEntries(
  entries: HelloWorldEntry[],
  query: string
): HelloWorldEntry[] {
  if (!query || query.trim().length === 0) {
    return entries
  }

  const lowerQuery = query.toLowerCase()
  return entries.filter(entry =>
    entry.message.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Get statistics from entries
 *
 * @param entries - Array of entries
 * @returns Statistics object
 */
export function getEntryStats(entries: HelloWorldEntry[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  return {
    total: entries.length,
    today: entries.filter(e => new Date(e.created_at) >= today).length,
    thisWeek: entries.filter(e => new Date(e.created_at) >= thisWeek).length,
    thisMonth: entries.filter(e => new Date(e.created_at) >= thisMonth).length,
    averageLength: entries.length > 0
      ? Math.round(entries.reduce((sum, e) => sum + e.message.length, 0) / entries.length)
      : 0
  }
}

/**
 * Truncate long messages for display
 *
 * @param message - Message to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated message with ellipsis if needed
 */
export function truncateMessage(message: string, maxLength: number = 100): string {
  if (message.length <= maxLength) {
    return message
  }
  return message.substring(0, maxLength - 3) + '...'
}

/**
 * Check if entry was created today
 *
 * @param entry - Entry to check
 * @returns True if created today
 */
export function isCreatedToday(entry: HelloWorldEntry): boolean {
  const now = new Date()
  const entryDate = new Date(entry.created_at)
  return (
    entryDate.getDate() === now.getDate() &&
    entryDate.getMonth() === now.getMonth() &&
    entryDate.getFullYear() === now.getFullYear()
  )
}

/**
 * Debug mode helper
 * Only logs in development
 */
export const DEBUG = process.env.NODE_ENV === 'development'

export function log(...args: any[]) {
  if (DEBUG) {
    console.log('[hello-world]', ...args)
  }
}

/**
 * DEVELOPER NOTES:
 *
 * 1. Utility Organization:
 *    - Group related functions together
 *    - Keep functions pure (no side effects)
 *    - Use descriptive names
 *    - Add JSDoc comments
 *
 * 2. Type Safety:
 *    - Import types from ../types
 *    - Add explicit return types
 *    - Use TypeScript generics where appropriate
 *    - Avoid 'any' types
 *
 * 3. Reusability:
 *    - Keep functions focused on one task
 *    - Make functions composable
 *    - Avoid module-specific logic
 *    - Consider extracting to shared library
 *
 * 4. Testing:
 *    - Write unit tests for utility functions
 *    - Test edge cases (empty arrays, null values)
 *    - Test boundary conditions
 *    - Mock dependencies where needed
 *
 * 5. Performance:
 *    - Avoid unnecessary iterations
 *    - Use built-in methods where possible
 *    - Consider memoization for expensive operations
 *    - Profile hot paths
 */
