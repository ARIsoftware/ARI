'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { MODULE_PROVIDERS } from '@/lib/generated/module-provider-registry'
import { useEnabledModulesFromContext } from '@/lib/modules/context'

interface ModuleProvidersProps {
  children: React.ReactNode
  isAuthenticated: boolean
}

/**
 * Dynamically loads and nests global provider components declared by modules.
 * Each module can declare a `globalProvider` in its module.json with
 * `component` (file path) and `exportName` (named export to use).
 * Providers receive { children, isAuthenticated } props.
 *
 * Only providers belonging to currently-enabled modules are loaded — disabled
 * modules' providers are never mounted, so their side effects (canvases,
 * timers, DOM mutation, etc.) never run.
 */
export function ModuleProviders({ children, isAuthenticated }: ModuleProvidersProps) {
  const [providers, setProviders] = useState<React.ComponentType<any>[] | null>(null)
  const enabledModules = useEnabledModulesFromContext()

  // Derive a stable primitive from the enabled set so the loader effect only
  // re-runs on real id-set changes — `enabledModules` becomes a new array
  // reference on every client-side navigation even when its contents are
  // identical.
  const enabledIdsKey = useMemo(
    () => enabledModules.map(m => m.id).sort().join(','),
    [enabledModules],
  )

  useEffect(() => {
    const enabledIds = new Set(enabledIdsKey ? enabledIdsKey.split(',') : [])
    const entries = Object.entries(MODULE_PROVIDERS).filter(([moduleId]) =>
      enabledIds.has(moduleId),
    )
    if (entries.length === 0) {
      setProviders([])
      return
    }

    let cancelled = false

    Promise.all(
      entries.map(([, { loader, exportName }]) =>
        loader()
          .then(mod => mod[exportName] ?? mod.default)
          .catch(() => null)
      )
    ).then(results => {
      if (!cancelled) {
        // Atomic swap — keep the previous provider list mounted while loading
        // so unrelated modules' contexts don't flash through a null state when
        // a single module gets toggled.
        setProviders(results.filter(Boolean))
      }
    })

    return () => { cancelled = true }
  }, [enabledIdsKey])

  if (!providers) {
    return <>{children}</>
  }

  let wrapped = children
  for (let i = providers.length - 1; i >= 0; i--) {
    const Provider = providers[i]
    wrapped = <Provider isAuthenticated={isAuthenticated}>{wrapped}</Provider>
  }

  return <>{wrapped}</>
}
