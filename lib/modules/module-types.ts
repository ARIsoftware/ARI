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
  /** Where to place in sidebar: "main", "bottom", "secondary", or hidden ("hidden" / "none") */
  sidebarPosition?: 'main' | 'bottom' | 'secondary' | 'hidden' | 'none'
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
  migrations?: string | null
}

/**
 * Module Dashboard Configuration
 * Defines dashboard widget settings
 */
export interface ModuleDashboardConfig {
  /** Whether this module provides dashboard widgets */
  widgets?: boolean
  /** Paths to small stat card components for the Quick Overview grid (relative to module root) */
  statCards?: string[]
  /** Paths to larger widget components for the content area (relative to module root) */
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
 * Module Submenu Configuration
 * Defines a custom submenu component that slides in when the module is clicked
 */
export interface ModuleSubmenuConfig {
  /** Path to submenu component (relative to module root) */
  component: string
}

/**
 * Module Top Bar Icon Configuration
 * Defines an icon shortcut that appears in the top navigation bar
 */
export interface ModuleTopBarIcon {
  /** Lucide icon name (e.g., "Zap", "Bell", "CheckSquare") */
  icon?: string
  /** Route to navigate to when clicked (e.g., "/tasks") */
  route?: string
  /** Optional tooltip text displayed on hover */
  tooltip?: string
  /** Path to a custom component file (e.g., "./components/my-top-bar-icon.tsx") */
  component?: string
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
 * Public Route Security Configuration
 * Defines security requirements for public (unauthenticated) API routes
 */
export interface PublicRouteSecurity {
  /** Security mechanism type */
  type: 'webhook_signature' | 'api_key' | 'rate_limit_only' | 'ip_allowlist' | 'custom'
  /** Environment variable containing the webhook signing secret (for webhook_signature type) */
  secretEnvVar?: string
  /** Environment variable containing the API key (for api_key type) */
  apiKeyEnvVar?: string
  /** Header name for API key (default: 'x-api-key') */
  apiKeyHeader?: string
  /** Allowed IP addresses (for ip_allowlist type) */
  allowedIps?: string[]
  /** Rate limit: maximum requests per minute (optional, applies to all types) */
  rateLimit?: number
  /** Description of custom security implementation (for custom type) */
  customDescription?: string
}

/**
 * Public Route Configuration
 * Defines a public (unauthenticated) API route with mandatory security
 */
export interface PublicRouteConfig {
  /** API path relative to module (e.g., "webhook" for /api/modules/{moduleId}/webhook) */
  path: string
  /** Allowed HTTP methods */
  methods: ('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')[]
  /** Security configuration - REQUIRED for all public routes */
  security: PublicRouteSecurity
  /** Human-readable description of the endpoint */
  description?: string
}

/**
 * Module Manifest
 * The complete module.json structure
 */
export interface ModuleManifest {
  /** Unique module identifier (kebab-case, e.g., "module-template") */
  id: string
  /** Group name for organizing modules in sidebar (modules with same group appear together) */
  group?: string
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
  /** Fullscreen mode - when true, hides sidebar and top bar (default: false) */
  fullscreen?: boolean
  /** Menu priority for ordering (1-100, lower appears first, default: 50) */
  menuPriority?: number
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
  /** Top bar icon configuration for quick access shortcut */
  topBarIcon?: ModuleTopBarIcon
  /** Submenu configuration - if present, clicking the menu item shows a sliding submenu */
  submenu?: ModuleSubmenuConfig
  /** Public (unauthenticated) API routes with mandatory security configuration */
  publicRoutes?: PublicRouteConfig[]
  /**
   * SHA-256 of database/schema.sql at manifest-generation time.
   * Omitted if the module has no schema.sql. Runtime gate uses this to
   * detect when schema.sql has changed and a re-run is needed.
   */
  schemaSha256?: string
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
  /** Whether this module has been overridden by a custom module */
  isOverridden?: boolean
  /** The ID of the module that overrides this one (if overridden) */
  overriddenBy?: string
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
  errorType: 'MANIFEST_MISSING' | 'MANIFEST_INVALID' | 'DEPENDENCY_MISSING' | 'RESERVED_ID' | 'VALIDATION_FAILED' | 'DUPLICATE_ID'
  /** For DUPLICATE_ID errors, list of all directories using this ID */
  duplicateDirectories?: string[]
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
