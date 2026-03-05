/**
 * Module React Hooks
 *
 * Client-side React hooks for accessing module data.
 * These hooks read from the ModulesProvider context (server-side pre-fetched),
 * eliminating redundant client-side /api/modules fetches.
 */

'use client'

import type { ModuleMetadata } from './module-types'
import { useEnabledModulesFromContext } from './context'

/**
 * Hook to get all enabled modules for the current user
 *
 * @returns Object with modules array, loading state, and error
 */
export function useModules() {
  const modules = useEnabledModulesFromContext()
  return { modules, loading: false, error: null }
}

/**
 * Hook to get a specific module by ID
 *
 * @param moduleId - The module ID to fetch
 * @returns Object with module metadata, loading state, and error
 */
export function useModule(moduleId: string | null) {
  const modules = useEnabledModulesFromContext()
  const module = moduleId ? modules.find(m => m.id === moduleId) ?? null : null
  return { module, loading: false, error: null }
}

/**
 * Hook to check if a specific module is enabled
 *
 * @param moduleId - The module ID to check
 * @returns Object with enabled state, loading state, and error
 *
 * @example
 * ```tsx
 * function FeatureGate({ moduleId, children }: { moduleId: string, children: React.ReactNode }) {
 *   const { enabled, loading } = useModuleEnabled(moduleId)
 *
 *   if (loading) return <div>Loading...</div>
 *   if (!enabled) return null
 *
 *   return <>{children}</>
 * }
 * ```
 */
export function useModuleEnabled(moduleId: string | null) {
  const { module, loading, error } = useModule(moduleId)

  return {
    // If module is found in the enabled modules list, it's enabled
    enabled: module !== null,
    loading,
    error
  }
}

/**
 * Hook to fetch modules by sidebar position
 *
 * @param position - Sidebar position to filter by
 * @returns Object with filtered modules, loading state, and error
 *
 * @example
 * ```tsx
 * function MainNav() {
 *   const { modules, loading } = useModulesByPosition('main')
 *
 *   if (loading) return <div>Loading...</div>
 *
 *   return (
 *     <nav>
 *       {modules.map(module => (
 *         <NavItem key={module.id} module={module} />
 *       ))}
 *     </nav>
 *   )
 * }
 * ```
 */
export function useModulesByPosition(position: 'main' | 'bottom' | 'secondary') {
  const { modules, loading, error } = useModules()

  const filteredModules = modules.filter(module =>
    module.routes?.some(route => route.sidebarPosition === position)
  )

  return {
    modules: filteredModules,
    loading,
    error
  }
}

/**
 * Hook to fetch modules that provide dashboard widgets
 *
 * @returns Object with widget-enabled modules, loading state, and error
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { modules, loading } = useModulesWithWidgets()
 *
 *   if (loading) return <div>Loading...</div>
 *
 *   return (
 *     <div className="grid grid-cols-3 gap-4">
 *       {modules.map(module => (
 *         <ModuleWidget key={module.id} moduleId={module.id} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useModulesWithWidgets() {
  const { modules, loading, error } = useModules()

  const widgetModules = modules.filter(module => module.dashboard?.widgets === true)

  return {
    modules: widgetModules,
    loading,
    error
  }
}
