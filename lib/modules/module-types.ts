/**
 * Module System - Type Definitions
 *
 * This file defines all TypeScript interfaces and types for the ARI module system.
 * These types are used throughout the module infrastructure for type safety and IntelliSense.
 */

/**
 * Module Route Configuration
 * Defines navigation items that appear in the sidebar
 */
export interface ModuleRoute {
  /** Route path (must start with /{module-id}) */
  path: string
  /** Display label in sidebar */
  label: string
  /** Lucide icon name (e.g., "Package", "Zap") */
  icon?: string
  /** Where to place in sidebar: "main", "bottom", or "secondary" */
  sidebarPosition?: 'main' | 'bottom' | 'secondary'
  /** Child routes (sub-pages) */
  children?: ModuleRoute[]
}

/**
 * Module Dependencies
 * Defines what other modules or core features this module requires
 */
export interface ModuleDependencies {
  /** Other module IDs this module depends on */
  modules?: string[]
  /** Core features this module depends on (e.g., "tasks", "contacts") */
  coreFeatures?: string[]
}

/**
 * Module Database Configuration
 * Defines database tables and migrations for the module
 */
export interface ModuleDatabaseConfig {
  /** List of table names this module creates */
  tables?: string[]
  /** Path to migrations directory (relative to module root) */
  migrations?: string
}

/**
 * Module Dashboard Configuration
 * Defines dashboard widget settings
 */
export interface ModuleDashboardConfig {
  /** Whether this module provides dashboard widgets */
  widgets?: boolean
  /** Paths to widget components (relative to module root) */
  widgetComponents?: string[]
}

/**
 * Module Settings Configuration
 * Defines settings panel for the module
 */
export interface ModuleSettingsConfig {
  /** Path to settings panel component (relative to module root) */
  panel?: string
}

/**
 * Module Permissions (metadata only, not enforced)
 * Documents what capabilities the module uses
 */
export interface ModulePermissions {
  /** Module uses database tables */
  database?: boolean
  /** Module provides API routes */
  api?: boolean
  /** Module provides dashboard widgets */
  dashboard?: boolean
}

/**
 * Module Manifest
 * The complete module.json structure
 */
export interface ModuleManifest {
  /** Unique module identifier (kebab-case, e.g., "hello-world") */
  id: string
  /** Display name shown in UI */
  name: string
  /** Brief description (max 200 chars) */
  description: string
  /** Semantic version (e.g., "1.0.0") */
  version: string
  /** Module author name or email */
  author: string
  /** Lucide icon name for this module */
  icon?: string
  /** Default enabled state for new users */
  enabled?: boolean
  /** Module capabilities (metadata only) */
  permissions?: ModulePermissions
  /** Navigation routes */
  routes?: ModuleRoute[]
  /** Module dependencies */
  dependencies?: ModuleDependencies
  /** Database configuration */
  database?: ModuleDatabaseConfig
  /** Dashboard widget configuration */
  dashboard?: ModuleDashboardConfig
  /** Settings panel configuration */
  settings?: ModuleSettingsConfig
}

/**
 * Module Metadata
 * Extended module information including runtime state
 */
export interface ModuleMetadata extends ModuleManifest {
  /** Absolute path to module directory */
  path: string
  /** Whether module is currently enabled for the user */
  isEnabled: boolean
  /** Validation errors (if any) */
  errors?: string[]
  /** Whether module passed validation */
  isValid: boolean
}

/**
 * Module Settings (stored in database)
 * Per-user module configuration
 */
export interface ModuleSettings {
  id: string
  user_id: string
  module_id: string
  enabled: boolean
  /** Module-specific configuration stored as JSON */
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

/**
 * Module Migration Record (stored in database)
 * Tracks which migrations have been applied (global, not per-user)
 */
export interface ModuleMigration {
  id: string
  module_id: string
  migration_name: string
  applied_at: string
  applied_by: string | null
}

/**
 * Module Load Error
 * Represents an error that occurred during module loading
 */
export interface ModuleLoadError {
  moduleId: string
  modulePath: string
  error: string
  errorType: 'MANIFEST_MISSING' | 'MANIFEST_INVALID' | 'DEPENDENCY_MISSING' | 'RESERVED_ID' | 'VALIDATION_FAILED'
}

/**
 * Module Registry State
 * The in-memory registry of all loaded modules
 */
export interface ModuleRegistryState {
  /** All discovered modules (including disabled) */
  modules: Map<string, ModuleMetadata>
  /** IDs of enabled modules for current user */
  enabledModuleIds: Set<string>
  /** Module loading errors */
  errors: ModuleLoadError[]
  /** Whether registry has been initialized */
  isInitialized: boolean
  /** Timestamp of last load */
  lastLoaded: Date | null
}

/**
 * Module API Route Context
 * Context object passed to module API handlers
 */
export interface ModuleAPIContext {
  params: Promise<{
    module: string
    path: string[]
  }>
}

/**
 * Core Features Available to Modules
 * These are the core app features modules can depend on
 */
export type CoreFeature =
  | 'tasks'
  | 'contacts'
  | 'fitness'
  | 'northstar'
  | 'auth'
  | 'hyrox'
  | 'dashboard'

/**
 * Module State
 * Possible states for a module
 */
export type ModuleState =
  | 'enabled'      // Module is active and functional
  | 'disabled'     // Module is installed but disabled
  | 'error'        // Module failed to load
  | 'pending'      // Migrations not yet applied

/**
 * Sidebar Position
 * Where module navigation items can be placed
 */
export type SidebarPosition = 'main' | 'bottom' | 'secondary'
