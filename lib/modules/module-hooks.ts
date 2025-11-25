/**
 * Module React Hooks
 *
 * Client-side React hooks for accessing module data.
 * These hooks fetch module metadata via API routes.
 */

'use client'

import { useEffect, useState } from 'react'
import type { ModuleMetadata } from './module-types'

/**
 * Hook to fetch all enabled modules for the current user
 *
 * @returns Object with modules array, loading state, and error
 *
 * @example
 * ```tsx
 * function Sidebar() {
 *   const { modules, loading, error } = useModules()
 *
 *   if (loading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error}</div>
 *
 *   return (
 *     <nav>
 *       {modules.map(module => (
 *         <Link key={module.id} href={`/${module.id}`}>
 *           {module.name}
 *         </Link>
 *       ))}
 *     </nav>
 *   )
 * }
 * ```
 */
export function useModules() {
  const [modules, setModules] = useState<ModuleMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchModules() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/modules')

        if (!response.ok) {
          throw new Error('Failed to fetch modules')
        }

        const data = await response.json()
        setModules(data.modules || [])
      } catch (err: any) {
        console.error('[useModules] Error:', err)
        setError(err.message || 'Failed to load modules')
        setModules([])
      } finally {
        setLoading(false)
      }
    }

    fetchModules()
  }, [])

  return { modules, loading, error }
}

/**
 * Hook to fetch a specific module by ID
 *
 * @param moduleId - The module ID to fetch
 * @returns Object with module metadata, loading state, and error
 *
 * @example
 * ```tsx
 * function ModuleSettings({ moduleId }: { moduleId: string }) {
 *   const { module, loading, error } = useModule(moduleId)
 *
 *   if (loading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error}</div>
 *   if (!module) return <div>Module not found</div>
 *
 *   return <div>Version: {module.version}</div>
 * }
 * ```
 */
export function useModule(moduleId: string | null) {
  const [module, setModule] = useState<ModuleMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!moduleId) {
      setModule(null)
      setLoading(false)
      return
    }

    async function fetchModule() {
      try {
        setLoading(true)
        setError(null)

        // Fetch all enabled modules and filter by ID
        const response = await fetch('/api/modules')

        if (!response.ok) {
          throw new Error('Failed to fetch modules')
        }

        const data = await response.json()
        const foundModule = data.modules?.find((m: ModuleMetadata) => m.id === moduleId) || null
        setModule(foundModule)
      } catch (err: any) {
        console.error(`[useModule] Error fetching ${moduleId}:`, err)
        setError(err.message || 'Failed to load module')
        setModule(null)
      } finally {
        setLoading(false)
      }
    }

    fetchModule()
  }, [moduleId])

  return { module, loading, error }
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
