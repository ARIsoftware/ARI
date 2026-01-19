/**
 * Module Registry
 *
 * Central registry for managing module state and providing access to modules.
 * Handles module enable/disable state from database and provides query methods.
 *
 * This is server-side only.
 */

import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { createDbClient } from '@/lib/db-supabase'
import { loadModules } from './module-loader'
import type { ModuleMetadata, ModuleSettings } from './module-types'

// Track if we've logged the module list on server start
let hasLoggedModuleListOnStartup = false

/**
 * Get all discovered modules (regardless of enabled state)
 *
 * @returns Array of all module metadata
 */
export async function getModules(): Promise<ModuleMetadata[]> {
  const { modules } = await loadModules()

  // Log module list once on server startup
  if (!hasLoggedModuleListOnStartup) {
    hasLoggedModuleListOnStartup = true
    console.log(`[Modules] Server startup - discovered ${modules.length} modules:`, modules.map(m => m.id))
  }

  return modules
}

/**
 * Get all enabled modules for the current authenticated user
 *
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns Array of enabled modules
 */
export async function getEnabledModules(userId?: string): Promise<ModuleMetadata[]> {
  const supabase = createDbClient()

  // Get current user if not provided
  let currentUserId = userId
  if (!currentUserId) {
    const session = await auth.api.getSession({
      headers: await headers(),
    })
    if (!session?.user) {
      return [] // No user session = no modules
    }
    currentUserId = session.user.id
  }

  // Get all modules
  const allModules = await getModules()

  // Get user's module settings from database
  const { data: settings } = await supabase
    .from('module_settings')
    .select('*')
    .eq('user_id', currentUserId)

  // Create maps for module_id -> enabled state and settings
  const settingsMap = new Map<string, boolean>()
  const moduleSettingsMap = new Map<string, Record<string, any>>()
  if (settings) {
    settings.forEach((setting: ModuleSettings) => {
      settingsMap.set(setting.module_id, setting.enabled)
      if (setting.settings) {
        moduleSettingsMap.set(setting.module_id, setting.settings as Record<string, any>)
      }
    })
  }

  // Filter modules based on enabled state and merge user's custom menuPriority
  // Default to enabled if no setting exists
  // Exclude overridden modules - they should never appear in enabled list
  return allModules
    .filter(module => {
      if (module.isOverridden) return false

      const isEnabledInDb = settingsMap.get(module.id)
      return isEnabledInDb !== undefined ? isEnabledInDb : (module.enabled ?? true)
    })
    .map(module => {
      // Merge user's custom menuPriority from settings if available
      const userSettings = moduleSettingsMap.get(module.id)
      const customPriority = userSettings?.menuPriority

      if (customPriority !== undefined) {
        return {
          ...module,
          menuPriority: customPriority
        }
      }
      return module
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
  const supabase = createDbClient()

  // Get current user if not provided
  let currentUserId = userId
  if (!currentUserId) {
    const session = await auth.api.getSession({
      headers: await headers(),
    })
    if (!session?.user) {
      return null // No user session = no access
    }
    currentUserId = session.user.id
  }

  // Get all modules
  const allModules = await getModules()

  // Find the requested module
  const module = allModules.find(m => m.id === moduleId)
  if (!module) {
    return null // Module doesn't exist
  }

  // Check if module is enabled for this user
  const { data: setting } = await supabase
    .from('module_settings')
    .select('enabled')
    .eq('user_id', currentUserId)
    .eq('module_id', moduleId)
    .single()

  // If no setting exists, use manifest default
  const isEnabled = setting ? setting.enabled : (module.enabled ?? true)

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
  const supabase = createDbClient()

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
  const supabase = createDbClient()

  // Get current user if not provided
  let currentUserId = userId
  if (!currentUserId) {
    const session = await auth.api.getSession({
      headers: await headers(),
    })
    if (!session?.user) {
      return null
    }
    currentUserId = session.user.id
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
  const supabase = createDbClient()

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
