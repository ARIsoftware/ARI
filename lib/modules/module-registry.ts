/**
 * Module Registry
 *
 * Central registry for managing module state and providing access to modules.
 * Handles module enable/disable state from database and provides query methods.
 *
 * This is server-side only.
 */

import { createAuthenticatedClient } from '@/lib/auth-helpers'
import { loadModules } from './module-loader'
import type { ModuleMetadata, ModuleSettings } from './module-types'

/**
 * Get all discovered modules (regardless of enabled state)
 *
 * @returns Array of all module metadata
 */
export async function getModules(): Promise<ModuleMetadata[]> {
  const { modules } = await loadModules()
  return modules
}

/**
 * Get all enabled modules for the current authenticated user
 *
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns Array of enabled modules
 */
export async function getEnabledModules(userId?: string): Promise<ModuleMetadata[]> {
  const supabase = await createAuthenticatedClient()

  // Get current user if not provided
  let currentUserId = userId
  if (!currentUserId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return [] // No user session = no modules
    }
    currentUserId = user.id
  }

  // Get all modules
  const allModules = await getModules()

  // Get user's module settings from database
  const { data: settings } = await supabase
    .from('module_settings')
    .select('*')
    .eq('user_id', currentUserId)

  // Create a map of module_id -> enabled state
  const settingsMap = new Map<string, boolean>()
  if (settings) {
    settings.forEach((setting: ModuleSettings) => {
      settingsMap.set(setting.module_id, setting.enabled)
    })
  }

  // Filter modules based on enabled state
  // Default to enabled if no setting exists
  // Exclude overridden modules - they should never appear in enabled list
  return allModules.filter(module => {
    if (module.isOverridden) return false

    const isEnabledInDb = settingsMap.get(module.id)
    return isEnabledInDb !== undefined ? isEnabledInDb : (module.enabled ?? true)
  })
}

/**
 * Get module metadata if it exists and is enabled for the current user
 *
 * This is the KEY function used by catch-all routes to validate access.
 *
 * @param moduleId - The module's unique identifier
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns Module metadata if enabled, null otherwise
 */
export async function getEnabledModule(
  moduleId: string,
  userId?: string
): Promise<ModuleMetadata | null> {
  console.log(`[getEnabledModule] Checking module: ${moduleId}`)

  const supabase = await createAuthenticatedClient()

  // Get current user if not provided
  let currentUserId = userId
  if (!currentUserId) {
    const { data: { user } } = await supabase.auth.getUser()
    console.log(`[getEnabledModule] User from session:`, user ? user.id : 'null')
    if (!user) {
      console.log(`[getEnabledModule] No user session - returning null`)
      return null // No user session = no access
    }
    currentUserId = user.id
  }

  // Get all modules
  const allModules = await getModules()
  console.log(`[getEnabledModule] All modules:`, allModules.map(m => m.id))

  // Find the requested module
  const module = allModules.find(m => m.id === moduleId)
  console.log(`[getEnabledModule] Module found:`, !!module)
  if (!module) {
    console.log(`[getEnabledModule] Module doesn't exist - returning null`)
    return null // Module doesn't exist
  }

  // Check if module is enabled for this user
  const { data: setting, error: dbError } = await supabase
    .from('module_settings')
    .select('enabled')
    .eq('user_id', currentUserId)
    .eq('module_id', moduleId)
    .single()

  console.log(`[getEnabledModule] DB setting:`, setting, 'error:', dbError?.message)

  // If no setting exists, use manifest default
  const isEnabled = setting ? setting.enabled : (module.enabled ?? true)
  console.log(`[getEnabledModule] isEnabled:`, isEnabled, '(from:', setting ? 'database' : 'manifest default', ')')

  return isEnabled ? module : null
}

/**
 * Check if a specific module is enabled for a user
 *
 * @param moduleId - Module ID to check
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns true if module is enabled, false otherwise
 */
export async function isModuleEnabled(moduleId: string, userId?: string): Promise<boolean> {
  const module = await getEnabledModule(moduleId, userId)
  return module !== null
}

/**
 * Set a module's enabled state for a user
 *
 * @param moduleId - Module ID to update
 * @param userId - User ID
 * @param enabled - New enabled state
 * @returns Success status
 */
export async function setModuleEnabled(
  moduleId: string,
  userId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createAuthenticatedClient()

  // Verify module exists
  const module = await getModules().then(modules =>
    modules.find(m => m.id === moduleId)
  )

  if (!module) {
    return {
      success: false,
      error: `Module '${moduleId}' not found`
    }
  }

  // Upsert module setting
  const { error } = await supabase
    .from('module_settings')
    .upsert({
      user_id: userId,
      module_id: moduleId,
      enabled,
      settings: {}, // Default empty settings object
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,module_id'
    })

  if (error) {
    console.error('[Modules] Failed to update module settings:', error)
    return {
      success: false,
      error: error.message
    }
  }

  return { success: true }
}

/**
 * Get module settings for a user
 *
 * @param moduleId - Module ID
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns Module settings object or null
 */
export async function getModuleSettings(
  moduleId: string,
  userId?: string
): Promise<Record<string, any> | null> {
  const supabase = await createAuthenticatedClient()

  // Get current user if not provided
  let currentUserId = userId
  if (!currentUserId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return null
    }
    currentUserId = user.id
  }

  const { data } = await supabase
    .from('module_settings')
    .select('settings')
    .eq('user_id', currentUserId)
    .eq('module_id', moduleId)
    .single()

  return data?.settings || null
}

/**
 * Update module settings for a user
 *
 * @param moduleId - Module ID
 * @param userId - User ID
 * @param settings - New settings object
 * @returns Success status
 */
export async function updateModuleSettings(
  moduleId: string,
  userId: string,
  settings: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createAuthenticatedClient()

  // Verify module exists
  const module = await getModules().then(modules =>
    modules.find(m => m.id === moduleId)
  )

  if (!module) {
    return {
      success: false,
      error: `Module '${moduleId}' not found`
    }
  }

  // Update settings (create row if doesn't exist)
  const { error } = await supabase
    .from('module_settings')
    .upsert({
      user_id: userId,
      module_id: moduleId,
      enabled: true, // Default enabled when updating settings
      settings,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,module_id'
    })

  if (error) {
    console.error('[Modules] Failed to update module settings:', error)
    return {
      success: false,
      error: error.message
    }
  }

  return { success: true }
}

/**
 * Get modules by sidebar position
 *
 * @param position - Sidebar position to filter by
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns Array of enabled modules for that position
 */
export async function getModulesByPosition(
  position: 'main' | 'bottom' | 'secondary',
  userId?: string
): Promise<ModuleMetadata[]> {
  const enabledModules = await getEnabledModules(userId)

  return enabledModules.filter(module =>
    module.routes?.some(route => route.sidebarPosition === position)
  )
}

/**
 * Get all modules with dashboard widgets
 *
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns Array of enabled modules that provide dashboard widgets
 */
export async function getModulesWithWidgets(userId?: string): Promise<ModuleMetadata[]> {
  const enabledModules = await getEnabledModules(userId)

  return enabledModules.filter(module => module.dashboard?.widgets === true)
}
