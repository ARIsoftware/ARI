'use client'

import React, { useEffect, useState } from 'react'
import { MODULE_PROVIDERS } from '@/lib/generated/module-provider-registry'

interface ModuleProvidersProps {
  children: React.ReactNode
  isAuthenticated: boolean
}

/**
 * Dynamically loads and nests global provider components declared by modules.
 * Each module can declare a `globalProvider` in its module.json with
 * `component` (file path) and `exportName` (named export to use).
 * Providers receive { children, isAuthenticated } props.
 */
export function ModuleProviders({ children, isAuthenticated }: ModuleProvidersProps) {
  const [providers, setProviders] = useState<React.ComponentType<any>[] | null>(null)

  useEffect(() => {
    const entries = Object.entries(MODULE_PROVIDERS)
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
        setProviders(results.filter(Boolean))
      }
    })

    return () => { cancelled = true }
  }, [])

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
