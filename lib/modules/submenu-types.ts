import type { ModuleMetadata } from '@/lib/modules/module-types'

/**
 * Props passed to module submenu components.
 *
 * Extracted into a standalone file so both the sidebar-submenu-renderer
 * and the auto-generated submenu registry can import it without creating
 * a circular dependency.
 */
export interface ModuleSubmenuProps {
  /** Module ID this submenu belongs to */
  moduleId: string
  /** Module metadata for reference */
  module: ModuleMetadata
}
