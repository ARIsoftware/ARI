'use client'

import React, { useMemo } from 'react'
import { MODULE_PROVIDERS } from '@/lib/generated/module-provider-registry'
import { useEnabledModulesFromContext } from '@/lib/modules/context'

interface ModuleProvidersProps {
  children: React.ReactNode
  isAuthenticated: boolean
}

/**
 * Wraps `children` with each enabled module's globalProvider component.
 * Providers from disabled modules are never mounted — their side effects
 * (canvases, timers, audio elements, etc.) never run.
 *
 * Static imports in MODULE_PROVIDERS mean the wrapping happens on the
 * first render — no useEffect / Promise-load / setState round-trip — so
 * any UI that depends on a provider's context renders immediately.
 */
export function ModuleProviders({ children, isAuthenticated }: ModuleProvidersProps) {
  const enabledModules = useEnabledModulesFromContext()

  const enabledProviders = useMemo(() => {
    const enabledIds = new Set(enabledModules.map(m => m.id))
    return Object.entries(MODULE_PROVIDERS)
      .filter(([id]) => enabledIds.has(id))
      .map(([, Provider]) => Provider)
  }, [enabledModules])

  let wrapped = children
  for (let i = enabledProviders.length - 1; i >= 0; i--) {
    const Provider = enabledProviders[i]
    wrapped = <Provider isAuthenticated={isAuthenticated}>{wrapped}</Provider>
  }
  return <>{wrapped}</>
}
