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
import { withAdminDb } from '@/lib/db'
import { moduleSettings as moduleSettingsTable } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { loadModules } from './module-loader'
import { runModuleSchemaInstall } from './schema-installer'
import type { ModuleMetadata } from './module-types'

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
 * Bootstrap module_settings records for modules that don't have one yet.
 * Core modules default to their manifest `enabled` state.
 * Custom modules always default to disabled so the user must explicitly enable
 * them (which triggers the schema installer).
 *
 * Safe to call repeatedly — uses INSERT … ON CONFLICT DO NOTHING.
 */
export async function bootstrapModuleSettings(
  userId: string,
  allModules: ModuleMetadata[],
  existingModuleIds: Set<string>
): Promise<void> {
  const unseeded = allModules.filter(
    m => !existingModuleIds.has(m.id) && !m.isOverridden
  )
  if (unseeded.length === 0) return

  const records = unseeded.map(m => {
    const isCustom = m.path?.includes('modules-custom')
    return {
      userId,
      moduleId: m.id,
      enabled: isCustom ? false : (m.enabled ?? true),
      settings: {},
    }
  })

  try {
    await withAdminDb(async (db) => {
      await db.insert(moduleSettingsTable)
        .values(records)
        .onConflictDoNothing({
          target: [moduleSettingsTable.userId, moduleSettingsTable.moduleId],
        })
    })

    // Run schema installer for modules being bootstrapped as enabled (parallel)
    const enabledRecords = records.filter(r => r.enabled)
    await Promise.all(enabledRecords.map(r => runModuleSchemaInstall(r.moduleId)))
  } catch (error) {
    console.error('[Modules] Bootstrap failed:', error)
    // Non-fatal — modules will appear disabled until next load
  }
}

/** Build maps from a module_settings query result */
function buildSettingsMaps(settings: { moduleId: string; enabled: boolean | null; settings: unknown }[]) {
  const enabledMap = new Map<string, boolean>()
  const configMap = new Map<string, Record<string, any>>()
  for (const s of settings) {
    enabledMap.set(s.moduleId, s.enabled ?? false)
    if (s.settings) {
      configMap.set(s.moduleId, s.settings as Record<string, any>)
    }
  }
  return { enabledMap, configMap }
}

/**
 * Get all enabled modules for the current authenticated user
 *
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns Array of enabled modules
 */
export async function getEnabledModules(userId?: string): Promise<ModuleMetadata[]> {
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

  // Get user's module settings from database (Drizzle via PG pool)
  const settings = await withAdminDb(async (db) =>
    db.select()
      .from(moduleSettingsTable)
      .where(eq(moduleSettingsTable.userId, currentUserId!))
  )

  let { enabledMap: settingsMap, configMap: moduleSettingsMap } = buildSettingsMaps(settings)

  // Bootstrap: seed DB records for newly discovered modules
  const existingIds = new Set(settingsMap.keys())
  const unseeded = allModules.filter(m => !existingIds.has(m.id) && !m.isOverridden)
  if (unseeded.length > 0) {
    await bootstrapModuleSettings(currentUserId, allModules, existingIds)
    // Re-read from DB after bootstrap (don't assume defaults)
    const refreshed = await withAdminDb(async (db) =>
      db.select()
        .from(moduleSettingsTable)
        .where(eq(moduleSettingsTable.userId, currentUserId!))
    )
    ;({ enabledMap: settingsMap, configMap: moduleSettingsMap } = buildSettingsMaps(refreshed))
  }

  // Filter modules based on enabled state and merge user's custom menuPriority
  // Require explicit DB record — default to disabled
  // Exclude overridden modules - they should never appear in enabled list
  return allModules
    .filter(module => {
      if (module.isOverridden) return false
      return settingsMap.get(module.id) === true
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

  // Check if module is enabled for this user (Drizzle via PG pool)
  const settingRows = await withAdminDb(async (db) =>
    db.select({ enabled: moduleSettingsTable.enabled })
      .from(moduleSettingsTable)
      .where(
        and(
          eq(moduleSettingsTable.userId, currentUserId!),
          eq(moduleSettingsTable.moduleId, moduleId)
        )
      )
  )
  const setting = settingRows[0] ?? null

  // If no setting exists, seed just this module's record
  if (!setting) {
    const isCustom = module.path?.includes('modules-custom')
    const defaultEnabled = isCustom ? false : (module.enabled ?? true)

    try {
      await withAdminDb(async (db) => {
        await db.insert(moduleSettingsTable)
          .values({ userId: currentUserId!, moduleId, enabled: defaultEnabled, settings: {} })
          .onConflictDoNothing({
            target: [moduleSettingsTable.userId, moduleSettingsTable.moduleId],
          })
      })
      if (defaultEnabled) await runModuleSchemaInstall(moduleId)
    } catch (error) {
      console.error(`[Modules] Bootstrap for ${moduleId} failed:`, error)
    }

    return defaultEnabled ? module : null
  }

  return setting.enabled ? module : null
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
): Promise<{ success: boolean; error?: string; warning?: string }> {
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

  // When enabling, run the module's schema.sql to provision its tables.
  // This is idempotent — re-runs are no-ops. uninstall.sql is never run.
  // "already exists" errors are harmless warnings; other failures block the enable.
  let schemaWarning: string | undefined
  if (enabled) {
    const installResult = await runModuleSchemaInstall(moduleId)
    if (!installResult.ok) {
      const isHarmless = installResult.error?.includes('already exists')
      if (isHarmless) {
        console.warn(`[Modules] Schema install warning for ${moduleId}: ${installResult.error}`)
        schemaWarning = `Schema install failed: ${installResult.error}`
      } else {
        return {
          success: false,
          error: `Schema install failed: ${installResult.error}`
        }
      }
    }
  }

  // Upsert module setting via Drizzle (replaces legacy Supabase REST upsert)
  try {
    await withAdminDb(async (db) => {
      await db.insert(moduleSettingsTable)
        .values({
          userId,
          moduleId,
          enabled,
          settings: {},
        })
        .onConflictDoUpdate({
          target: [moduleSettingsTable.userId, moduleSettingsTable.moduleId],
          set: {
            enabled,
            updatedAt: new Date().toISOString(),
          },
        })
    })
  } catch (error) {
    console.error('[Modules] Failed to update module settings:', error)
    return {
      success: false,
      error: (error as Error).message
    }
  }

  return { success: true, warning: schemaWarning }
}
