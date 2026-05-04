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
 * JSONB keys inside `module_settings.settings` that track schema-install
 * state per (user, module). The `__` prefix marks them as system-managed —
 * don't expose them in user-facing config UIs.
 *
 * - `__schema_installed_hash`: SHA-256 of the schema.sql that was last
 *   successfully installed. The runtime gate compares this against the
 *   current manifest hash; mismatch triggers a re-run, so additive schema
 *   changes (added ALTER, new tables) auto-apply on next page load.
 * - `__schema_installed_at`: diagnostic-only ISO timestamp of the last
 *   successful install. Not used by the gate.
 */
const SCHEMA_INSTALLED_HASH_KEY = '__schema_installed_hash'
const SCHEMA_INSTALLED_AT_KEY = '__schema_installed_at'

function moduleHasTables(module: ModuleMetadata): boolean {
  return (module.database?.tables?.length ?? 0) > 0
}

/**
 * True iff the module declares tables in its manifest but ships no
 * `schema.sql` for the registry generator to hash. This is almost always
 * a developer error — the manifest promises tables that nothing creates.
 */
function isMisconfiguredSchemaModule(module: ModuleMetadata): boolean {
  return moduleHasTables(module) && !module.schemaSha256
}

const warnedMisconfigured = new Set<string>()
function warnIfMisconfiguredSchema(module: ModuleMetadata): void {
  if (!isMisconfiguredSchemaModule(module)) return
  if (warnedMisconfigured.has(module.id)) return
  warnedMisconfigured.add(module.id)
  console.warn(
    `[Modules] ${module.id}: module.json declares database.tables but database/schema.sql is missing or unreadable. ` +
    `Tables won't be auto-provisioned. Add the file, or remove database.tables from the manifest.`
  )
}

/**
 * True if the user's stored hash matches the manifest's current hash —
 * i.e. schema.sql has not changed since this user last installed it.
 *
 * - `expectedHash` undefined → module has no schema.sql; nothing to install.
 * - `settings` null/undefined → no row yet → not up to date.
 * - Stored hash absent or different → schema.sql changed → re-run needed.
 */
function isSchemaUpToDate(
  settings: Record<string, unknown> | null | undefined,
  expectedHash: string | undefined,
): boolean {
  if (!expectedHash) return true
  if (!settings) return false
  return settings[SCHEMA_INSTALLED_HASH_KEY] === expectedHash
}

/**
 * Atomically write the schema-install marker into a module_settings row's
 * JSONB `settings`. The Postgres `||` merge preserves concurrent writes to
 * other keys (e.g. `menuPriority`).
 *
 * Both the hash (used by the gate) and a timestamp (diagnostic) are written
 * in a single SQL UPDATE.
 */
async function persistSchemaInstalled(
  userId: string,
  moduleId: string,
  hash: string,
): Promise<void> {
  const patch = JSON.stringify({
    [SCHEMA_INSTALLED_HASH_KEY]: hash,
    [SCHEMA_INSTALLED_AT_KEY]: new Date().toISOString(),
  })
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
    console.error(`[Modules] Failed to persist schema-install marker for ${moduleId}:`, error)
    // Non-fatal — gate will retry next access.
  }
}

/**
 * Run the schema installer once and persist the install hash on success or
 * "already exists" (harmless) results. Errors are logged but never thrown —
 * a failed install must not break a page load. The gate retries on
 * subsequent access until install succeeds.
 *
 * Idempotent: safe to call concurrently — the underlying installer itself
 * uses CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, etc.
 *
 * Callers must only invoke this when they have a hash to persist. The hash
 * is required (no longer optional) so call sites must explicitly handle
 * "module has no schema" by skipping the call.
 */
async function installAndMark(
  userId: string,
  moduleId: string,
  expectedHash: string,
): Promise<void> {
  const result = await runModuleSchemaInstall(moduleId)
  if (!result.ok && !result.alreadyExisted) {
    console.error(`[Modules] Schema install failed for ${moduleId}: ${result.error}`)
    return
  }
  if (result.alreadyExisted) {
    console.warn(`[Modules] Schema install warning for ${moduleId}: ${result.error}`)
  }
  await persistSchemaInstalled(userId, moduleId, expectedHash)
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

    // Iterate the rich `unseeded` modules directly — `records` carries only
    // the bare DB columns. Skip modules that are disabled or have no schema
    // to install; warn loudly when a module declares tables but ships no SQL.
    await Promise.all(unseeded.map(async (m) => {
      const isCustom = m.path?.includes('modules-custom')
      const enabled = isCustom ? false : (m.enabled ?? true)
      if (!enabled) return
      warnIfMisconfiguredSchema(m)
      if (!m.schemaSha256) return
      await installAndMark(userId, m.id, m.schemaSha256)
    }))
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

  // Self-healing schema gate. Fast-path: only modules whose stored install
  // hash differs from the current manifest hash need a re-run. Healthy
  // installs (hashes match) produce an empty list, so we skip the
  // Promise.all + microtask hops entirely.
  for (const m of enabledModules) warnIfMisconfiguredSchema(m)
  const needsInstall = enabledModules.filter(module =>
    !!module.schemaSha256 &&
    !isSchemaUpToDate(moduleSettingsMap.get(module.id), module.schemaSha256)
  )
  if (needsInstall.length > 0) {
    await Promise.all(needsInstall.map(module =>
      installAndMark(currentUserId, module.id, module.schemaSha256!)
    ))
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
      if (defaultEnabled) {
        warnIfMisconfiguredSchema(module)
        if (module.schemaSha256) {
          await installAndMark(currentUserId, moduleId, module.schemaSha256)
        }
      }
    } catch (error) {
      console.error(`[Modules] Bootstrap for ${moduleId} failed:`, error)
    }

    return defaultEnabled ? module : null
  }

  if (!setting.enabled) return null

  warnIfMisconfiguredSchema(module)
  const settingJsonb = (setting.settings as Record<string, unknown> | null) ?? null
  if (module.schemaSha256 && !isSchemaUpToDate(settingJsonb, module.schemaSha256)) {
    await installAndMark(currentUserId, moduleId, module.schemaSha256)
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
  if (schemaProvisioned && module.schemaSha256) {
    await persistSchemaInstalled(userId, moduleId, module.schemaSha256)
  }

  return { success: true, warning: schemaWarning }
}
