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
import { eq, and, sql } from 'drizzle-orm'
import { loadModules } from './module-loader'
import { runModuleSchemaInstall } from './schema-installer'
import type { ModuleMetadata } from './module-types'

/**
 * JSONB key inside `module_settings.settings` that records when the module's
 * schema.sql was last successfully installed. Used by the self-healing gate
 * (see `ensureSchemaInstalled`) so a row that says `enabled: true` but never
 * had its tables provisioned auto-heals on next access. The `__` prefix
 * marks it as system-managed (don't expose in user config UIs).
 */
const SCHEMA_INSTALLED_KEY = '__schema_installed_at'

/**
 * True if the module declares any database tables in its manifest. Modules
 * without tables (pure UI/API modules) skip the schema gate entirely.
 */
function moduleHasTables(module: ModuleMetadata): boolean {
  return (module.database?.tables?.length ?? 0) > 0
}

/**
 * Merge the schema-install timestamp into a module_settings row's JSONB
 * `settings`. Atomic via Postgres `||` jsonb merge so concurrent writes to
 * other keys (e.g. `menuPriority`) aren't clobbered.
 */
async function persistSchemaInstalledAt(userId: string, moduleId: string): Promise<void> {
  const patch = JSON.stringify({ [SCHEMA_INSTALLED_KEY]: new Date().toISOString() })
  try {
    await withAdminDb(async (db) =>
      db.update(moduleSettingsTable)
        .set({
          settings: sql`COALESCE(${moduleSettingsTable.settings}, '{}'::jsonb) || ${patch}::jsonb`,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(moduleSettingsTable.userId, userId),
            eq(moduleSettingsTable.moduleId, moduleId),
          ),
        )
    )
  } catch (error) {
    console.error(`[Modules] Failed to persist ${SCHEMA_INSTALLED_KEY} for ${moduleId}:`, error)
    // Non-fatal — gate will retry next access.
  }
}

/**
 * True iff the row's settings already record a successful schema install.
 */
function isSchemaInstalledMarked(settings: Record<string, unknown> | null | undefined): boolean {
  return !!settings && !!settings[SCHEMA_INSTALLED_KEY]
}

/**
 * Run the schema installer once and persist the `__schema_installed_at`
 * marker on success or "already exists" (harmless) results. Errors are
 * logged but never thrown — a failed install must not break a page load,
 * and the gate will retry on subsequent access until install succeeds.
 *
 * Idempotent: safe to call concurrently — the underlying installer is
 * itself idempotent (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS …).
 */
async function installAndMark(userId: string, moduleId: string): Promise<void> {
  const result = await runModuleSchemaInstall(moduleId)
  if (!result.ok && !result.alreadyExisted) {
    console.error(`[Modules] Schema install failed for ${moduleId}: ${result.error}`)
    return
  }
  if (result.ok === false) {
    // Harmless "already exists" — log a hint and proceed to mark installed.
    console.warn(`[Modules] Schema install warning for ${moduleId}: ${result.error}`)
  }
  await persistSchemaInstalledAt(userId, moduleId)
}

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

    const enabledRecords = records.filter(r => r.enabled)
    await Promise.all(enabledRecords.map(r => installAndMark(userId, r.moduleId)))
  } catch (error) {
    console.error('[Modules] Bootstrap failed:', error)
    // Non-fatal — modules will appear disabled until next load
  }
}

/** Build maps from a module_settings query result */
function buildSettingsMaps(settings: { moduleId: string; enabled: boolean | null; settings: unknown }[]) {
  const enabledMap = new Map<string, boolean>()
  const configMap = new Map<string, Record<string, unknown>>()
  for (const s of settings) {
    enabledMap.set(s.moduleId, s.enabled ?? false)
    if (s.settings && typeof s.settings === 'object') {
      configMap.set(s.moduleId, s.settings as Record<string, unknown>)
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

  const enabledModules = allModules.filter(module => {
    if (module.isOverridden) return false
    return settingsMap.get(module.id) === true
  })

  // Self-healing schema gate. Fast-path: only modules that own tables AND
  // lack the marker need an install attempt. On a healthy install this is
  // an empty list, so we skip the Promise.all + microtask hops entirely.
  const needsInstall = enabledModules.filter(module =>
    moduleHasTables(module) && !isSchemaInstalledMarked(moduleSettingsMap.get(module.id))
  )
  if (needsInstall.length > 0) {
    await Promise.all(needsInstall.map(module => installAndMark(currentUserId, module.id)))
  }

  return enabledModules.map(module => {
    const userSettings = moduleSettingsMap.get(module.id)
    const customPriority = typeof userSettings?.menuPriority === 'number' ? userSettings.menuPriority : undefined
    if (customPriority !== undefined) {
      return { ...module, menuPriority: customPriority }
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
    db.select({ enabled: moduleSettingsTable.enabled, settings: moduleSettingsTable.settings })
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
      if (defaultEnabled && moduleHasTables(module)) {
        await installAndMark(currentUserId, moduleId)
      }
    } catch (error) {
      console.error(`[Modules] Bootstrap for ${moduleId} failed:`, error)
    }

    return defaultEnabled ? module : null
  }

  if (!setting.enabled) return null

  const settingJsonb = (setting.settings as Record<string, unknown> | null) ?? null
  if (moduleHasTables(module) && !isSchemaInstalledMarked(settingJsonb)) {
    await installAndMark(currentUserId, moduleId)
  }

  return module
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

  // Run the schema installer when enabling. Tables-already-exist is a
  // recoverable warning; any other install failure blocks the enable.
  let schemaWarning: string | undefined
  let schemaProvisioned = false
  if (enabled) {
    const result = await runModuleSchemaInstall(moduleId)
    if (!result.ok && !result.alreadyExisted) {
      return { success: false, error: `Schema install failed: ${result.error}` }
    }
    if (result.ok === false) {
      console.warn(`[Modules] Schema install warning for ${moduleId}: ${result.error}`)
      schemaWarning = `Schema install failed: ${result.error}`
    }
    schemaProvisioned = true
  }

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

  // Persist the marker after the row exists so the JSONB merge has a target.
  if (schemaProvisioned) {
    await persistSchemaInstalledAt(userId, moduleId)
  }

  return { success: true, warning: schemaWarning }
}
