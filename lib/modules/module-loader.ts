/**
 * Module Loader
 *
 * Loads module metadata from the pre-generated manifest file.
 * The manifest is generated at build time by scripts/generate-module-registry.js
 *
 * This approach works in serverless environments (like Vercel) where filesystem
 * scanning is not possible because only statically-analyzed dependencies are included.
 *
 * This runs server-side only (never in browser).
 */

import type { ModuleMetadata, ModuleLoadError } from './module-types'

// Import the pre-generated manifest (generated at build time)
// This static import ensures the JSON is bundled with the serverless function
import moduleManifest from '@/lib/generated/module-manifest.json'

/**
 * Type for the generated manifest structure
 */
interface GeneratedManifest {
  generatedAt: string
  modules: Array<{
    id: string
    name: string
    description: string
    version: string
    author: string
    icon?: string
    enabled?: boolean
    fullscreen?: boolean
    menuPriority?: number
    routes?: Array<{
      path: string
      label: string
      icon?: string
      sidebarPosition?: 'main' | 'bottom' | 'secondary'
    }>
    permissions?: {
      database?: boolean
      api?: boolean
      dashboard?: boolean
    }
    dependencies?: {
      modules?: string[]
      coreFeatures?: string[]
    }
    database?: {
      tables?: string[]
      migrations?: string | null
    }
    dashboard?: {
      widgets?: boolean
      widgetComponents?: string[]
    }
    settings?: {
      panel?: string
    }
    topBarIcon?: {
      icon: string
      route: string
      tooltip?: string
    }
    path: string
    sourceDir: string
    isOverridden: boolean
  }>
}

// Cast the imported manifest to the correct type
const manifest = moduleManifest as GeneratedManifest

/**
 * Load all modules from the pre-generated manifest
 *
 * @returns Object containing discovered modules and any errors
 */
export async function loadModules(): Promise<{
  modules: ModuleMetadata[]
  errors: ModuleLoadError[]
}> {
  const modules: ModuleMetadata[] = manifest.modules.map(mod => ({
    ...mod,
    isEnabled: mod.enabled ?? true,
    isValid: true,
    errors: []
  }))

  // No errors since we're loading from a pre-validated manifest
  return { modules, errors: [] }
}

/**
 * Check if a module with the given ID exists
 *
 * @param moduleId - Module ID to check
 * @returns true if module exists and is valid
 */
export async function moduleExists(moduleId: string): Promise<boolean> {
  const { modules } = await loadModules()
  return modules.some(m => m.id === moduleId && m.isValid && !m.isOverridden)
}

/**
 * Get metadata for a specific module by ID
 *
 * @param moduleId - Module ID to retrieve
 * @returns Module metadata or null if not found
 */
export async function getModuleById(moduleId: string): Promise<ModuleMetadata | null> {
  const { modules } = await loadModules()
  return modules.find(m => m.id === moduleId && m.isValid && !m.isOverridden) || null
}
