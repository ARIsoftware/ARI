/**
 * Module Template Module - Global Provider (reference implementation)
 *
 * A module can declare a globalProvider in module.json to wrap the WHOLE app
 * in a React context provider:
 *
 *   "globalProvider": {
 *     "component": "./components/global-provider.tsx",
 *     "exportName": "ModuleTemplateProvider"   // omit for a default export
 *   }
 *
 * Use this when module state must outlive the module's own pages — e.g. the
 * music player keeps audio playing while the user browses other routes, and
 * tasks mounts its global Quick Add sheet this way.
 *
 * Contract (see components/module-providers.tsx):
 * - The component receives { children, isAuthenticated } and MUST render
 *   {children} — it wraps the entire authenticated app shell.
 * - It is statically imported into the generated MODULE_PROVIDERS registry,
 *   so a missing file FAILS THE BUILD — keep the manifest path correct.
 * - It only MOUNTS for users who have the module enabled, but its code is in
 *   the shared bundle for everyone. Keep it small; lazy-load heavy pieces.
 * - Side effects (timers, audio, sockets) belong in useEffect and must be
 *   cleaned up — this runs on every page of the app.
 */

'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

interface ModuleTemplateGlobalState {
  /** Whether the current visitor is signed in (passed in by the app shell). */
  isAuthenticated: boolean
  /** Demo state that survives navigation between any of the app's pages. */
  visitCount: number
  recordVisit: () => void
}

const ModuleTemplateGlobalContext = createContext<ModuleTemplateGlobalState | null>(null)

export function ModuleTemplateProvider({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode
  isAuthenticated: boolean
}) {
  const [visitCount, setVisitCount] = useState(0)
  const recordVisit = useCallback(() => setVisitCount((n) => n + 1), [])

  const value = useMemo(
    () => ({ isAuthenticated, visitCount, recordVisit }),
    [isAuthenticated, visitCount, recordVisit],
  )

  return (
    <ModuleTemplateGlobalContext.Provider value={value}>
      {children}
    </ModuleTemplateGlobalContext.Provider>
  )
}

/**
 * Consumer hook. Returns null when the module is disabled (provider not
 * mounted) — callers outside this module must handle that case.
 */
export function useModuleTemplateGlobal(): ModuleTemplateGlobalState | null {
  return useContext(ModuleTemplateGlobalContext)
}
