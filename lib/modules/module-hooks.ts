/**
 * Module React Hooks
 *
 * Client-side React hooks for accessing module data.
 * These hooks read from the ModulesProvider context (server-side pre-fetched),
 * eliminating redundant client-side /api/modules fetches.
 */

'use client'

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
function useModule(moduleId: string | null) {
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

