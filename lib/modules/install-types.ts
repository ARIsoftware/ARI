/** Shared contract for the 409 conflict response between the install route and /modules page. */
export const TARGET_EXISTS_CODE = 'TARGET_EXISTS' as const
export type ConflictType = 'custom_exists' | 'core_override'
