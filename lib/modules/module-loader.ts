/**
 * Module Loader
 *
 * Scans the /modules directory and discovers all installed modules.
 * Validates module manifests and returns metadata for each module.
 *
 * This runs server-side only (never in browser).
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { ModuleManifest, ModuleMetadata, ModuleLoadError } from './module-types'
import { validateModuleId } from './reserved-routes'

/**
 * Get the absolute path to the modules directory
 */
function getModulesDirectory(): string {
  // In production and development, modules are in project root
  return join(process.cwd(), 'modules')
}

/**
 * Read and parse a module's manifest file
 *
 * @param modulePath - Absolute path to module directory
 * @param moduleId - Module directory name
 * @returns Parsed manifest or error
 */
async function readModuleManifest(
  modulePath: string,
  moduleId: string
): Promise<{ manifest?: ModuleManifest; error?: ModuleLoadError }> {
  try {
    const manifestPath = join(modulePath, 'module.json')
    const manifestContent = await readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestContent) as ModuleManifest

    return { manifest }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        error: {
          moduleId,
          modulePath,
          error: 'module.json file not found',
          errorType: 'MANIFEST_MISSING'
        }
      }
    }

    return {
      error: {
        moduleId,
        modulePath,
        error: `Failed to parse module.json: ${error.message}`,
        errorType: 'MANIFEST_INVALID'
      }
    }
  }
}

/**
 * Validate a module manifest against required fields and constraints
 *
 * @param manifest - The module manifest to validate
 * @returns Array of validation errors (empty if valid)
 */
function validateManifest(manifest: ModuleManifest): string[] {
  const errors: string[] = []

  // Required fields
  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Missing or invalid "id" field')
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Missing or invalid "name" field')
  }
  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('Missing or invalid "description" field')
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('Missing or invalid "version" field')
  }
  if (!manifest.author || typeof manifest.author !== 'string') {
    errors.push('Missing or invalid "author" field')
  }

  // Validate ID format and reserved routes
  if (manifest.id) {
    const idValidation = validateModuleId(manifest.id)
    if (!idValidation.valid) {
      errors.push(idValidation.error || 'Invalid module ID')
    }
  }

  // Validate version format (semantic versioning)
  if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Invalid version format (must be semantic version like "1.0.0")')
  }

  // Validate name length
  if (manifest.name && manifest.name.length > 50) {
    errors.push('Module name must be 50 characters or less')
  }

  // Validate description length
  if (manifest.description && manifest.description.length > 200) {
    errors.push('Module description must be 200 characters or less')
  }

  // Validate routes if present
  if (manifest.routes) {
    if (!Array.isArray(manifest.routes)) {
      errors.push('"routes" must be an array')
    } else {
      manifest.routes.forEach((route, index) => {
        if (!route.path || typeof route.path !== 'string') {
          errors.push(`Route ${index}: missing or invalid "path" field`)
        } else if (!route.path.startsWith(`/${manifest.id}`)) {
          errors.push(
            `Route ${index}: path "${route.path}" must start with "/${manifest.id}" (module ID)`
          )
        }

        if (!route.label || typeof route.label !== 'string') {
          errors.push(`Route ${index}: missing or invalid "label" field`)
        }

        if (route.sidebarPosition) {
          const validPositions = ['main', 'bottom', 'secondary']
          if (!validPositions.includes(route.sidebarPosition)) {
            errors.push(
              `Route ${index}: invalid sidebarPosition "${route.sidebarPosition}" (must be ${validPositions.join(', ')})`
            )
          }
        }
      })
    }
  }

  // Validate dependencies if present
  if (manifest.dependencies) {
    if (manifest.dependencies.modules && !Array.isArray(manifest.dependencies.modules)) {
      errors.push('"dependencies.modules" must be an array')
    }
    if (manifest.dependencies.coreFeatures && !Array.isArray(manifest.dependencies.coreFeatures)) {
      errors.push('"dependencies.coreFeatures" must be an array')
    }
  }

  // Validate database config if present
  if (manifest.database) {
    if (manifest.database.tables && !Array.isArray(manifest.database.tables)) {
      errors.push('"database.tables" must be an array')
    }
    if (manifest.database.migrations && typeof manifest.database.migrations !== 'string') {
      errors.push('"database.migrations" must be a string path')
    }
  }

  // Validate dashboard config if present
  if (manifest.dashboard) {
    if (manifest.dashboard.widgets !== undefined && typeof manifest.dashboard.widgets !== 'boolean') {
      errors.push('"dashboard.widgets" must be a boolean')
    }
    if (manifest.dashboard.widgetComponents && !Array.isArray(manifest.dashboard.widgetComponents)) {
      errors.push('"dashboard.widgetComponents" must be an array')
    }
  }

  // Validate settings config if present
  if (manifest.settings) {
    if (manifest.settings.panel && typeof manifest.settings.panel !== 'string') {
      errors.push('"settings.panel" must be a string path')
    }
  }

  return errors
}

/**
 * Load all modules from the /modules directory
 *
 * @returns Object containing discovered modules and any errors
 */
export async function loadModules(): Promise<{
  modules: ModuleMetadata[]
  errors: ModuleLoadError[]
}> {
  const modules: ModuleMetadata[] = []
  const errors: ModuleLoadError[] = []

  try {
    const modulesDir = getModulesDirectory()

    // Read all directories in /modules
    const entries = await readdir(modulesDir, { withFileTypes: true })
    const moduleDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name)

    // Process each potential module directory
    for (const moduleId of moduleDirs) {
      const modulePath = join(modulesDir, moduleId)

      // Read and parse manifest
      const { manifest, error } = await readModuleManifest(modulePath, moduleId)

      if (error) {
        errors.push(error)
        continue
      }

      if (!manifest) {
        errors.push({
          moduleId,
          modulePath,
          error: 'Unknown error reading manifest',
          errorType: 'MANIFEST_INVALID'
        })
        continue
      }

      // Validate manifest
      const validationErrors = validateManifest(manifest)

      if (validationErrors.length > 0) {
        errors.push({
          moduleId,
          modulePath,
          error: `Manifest validation failed: ${validationErrors.join(', ')}`,
          errorType: 'VALIDATION_FAILED'
        })
        continue
      }

      // Create module metadata
      const metadata: ModuleMetadata = {
        ...manifest,
        path: modulePath,
        isEnabled: manifest.enabled ?? true, // Default to enabled
        isValid: true,
        errors: []
      }

      modules.push(metadata)
    }

    // Log summary (development only)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Modules] Discovered ${modules.length} modules`)
      if (errors.length > 0) {
        console.warn(`[Modules] ${errors.length} modules failed to load:`)
        errors.forEach(err => {
          console.warn(`  - ${err.moduleId}: ${err.error}`)
        })
      }
    }

    return { modules, errors }
  } catch (error: any) {
    console.error('[Modules] Failed to scan modules directory:', error)

    // Return empty results if directory doesn't exist or other critical error
    return { modules: [], errors: [] }
  }
}

/**
 * Check if a module with the given ID exists (cached)
 *
 * @param moduleId - Module ID to check
 * @returns true if module exists and is valid
 */
export async function moduleExists(moduleId: string): Promise<boolean> {
  const { modules } = await loadModules()
  return modules.some(m => m.id === moduleId && m.isValid)
}

/**
 * Get metadata for a specific module by ID
 *
 * @param moduleId - Module ID to retrieve
 * @returns Module metadata or null if not found
 */
export async function getModuleById(moduleId: string): Promise<ModuleMetadata | null> {
  const { modules } = await loadModules()
  return modules.find(m => m.id === moduleId && m.isValid) || null
}
