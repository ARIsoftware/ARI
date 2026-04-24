'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/components/providers'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle2, XCircle, Loader2, Shield, ShieldAlert, ShieldCheck, Database as DatabaseIcon, Package, Save, Key, Globe, Lock, ChevronRight } from 'lucide-react'
import moduleManifest from '@/lib/generated/module-manifest.json'

type ManifestModule = { id: string; name: string; enabled?: boolean }
type ManifestApiRoute = { path: string; fullPath: string; moduleId: string; methods: string[] }
type ManifestCoreRoute = { path: string; fullPath: string; methods: string[]; debugRole?: string; isPublic?: boolean }
type ManifestPublicRoute = {
  moduleId: string
  path: string
  fullPath: string
  methods: string[]
  security?: { type: string; rateLimit?: boolean | number } | string
  description?: string
}
type Manifest = {
  modules: ManifestModule[]
  moduleApiRoutes: ManifestApiRoute[]
  coreApiRoutes: ManifestCoreRoute[]
  publicRoutes: ManifestPublicRoute[]
}
const MANIFEST = moduleManifest as Manifest

/** Extract a human-readable message from an unknown catch value. */
const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)

/** Check whether an unknown catch value is an Error with a given `name`. */
const errName = (e: unknown, name: string): boolean =>
  e instanceof Error && e.name === name

/** HTTP methods considered mutations for security probing. */
const MUTATION_METHODS = ['PUT', 'PATCH'] as const
const isMutationMethod = (m: string): boolean =>
  (MUTATION_METHODS as readonly string[]).includes(m)

/**
 * Better Auth owns its catch-all (`/api/auth/[...all]/route.ts`), so its
 * sub-paths can't carry `debugRole` exports. This is the one place to update
 * if Better Auth ever changes its API surface.
 */
const BETTER_AUTH_ROUTES = {
  'auth-get-session': '/api/auth/get-session',
  'auth-list-sessions': '/api/auth/list-sessions',
} as const
type BetterAuthRole = keyof typeof BETTER_AUTH_ROUTES

/**
 * debug-role → fully-qualified core API path. Each core route declares its
 * own role via `export const debugRole = '...'` in its route.ts.
 */
const CORE_ROUTE_BY_ROLE = new Map<string, string>(
  MANIFEST.coreApiRoutes
    .filter((r) => !!r.debugRole)
    .map((r) => [r.debugRole as string, r.fullPath])
)

/**
 * Look up a core API route by its debug role. Throws loudly if the role is
 * unknown — renaming or deleting a tagged route file without updating its
 * `debugRole` export breaks /debug at the call site instead of silently 404ing.
 */
const route = (role: string): string => {
  if (role in BETTER_AUTH_ROUTES) {
    return BETTER_AUTH_ROUTES[role as BetterAuthRole]
  }
  const path = CORE_ROUTE_BY_ROLE.get(role)
  if (!path) {
    throw new Error(
      `/debug: no core route tagged with debugRole='${role}' — add 'export const debugRole = "${role}"' to the relevant route.ts file and regenerate the manifest`
    )
  }
  return path
}

const ENABLED_MODULES: ManifestModule[] = MANIFEST.modules.filter((m) => m.enabled !== false)
const ENABLED_MODULE_IDS = new Set(ENABLED_MODULES.map((m) => m.id))
const MODULE_NAME_BY_ID = new Map(MANIFEST.modules.map((m) => [m.id, m.name]))

/**
 * Group every manifest API route by its enabled moduleId. Single source of
 * truth for /debug — used both to seed the per-module fetch tests below and
 * to drive the Modules tab's API-route probing loop.
 */
const ENABLED_MODULE_API_ROUTES: ReadonlyMap<string, readonly ManifestApiRoute[]> = (() => {
  const byModule = new Map<string, ManifestApiRoute[]>()
  for (const r of MANIFEST.moduleApiRoutes) {
    if (!ENABLED_MODULE_IDS.has(r.moduleId)) continue
    const arr = byModule.get(r.moduleId) ?? []
    arr.push(r)
    byModule.set(r.moduleId, arr)
  }
  return byModule
})()

/**
 * One "Fetch <Module Name>" test per enabled module that exposes a GET route.
 * Prefers a static (non-parameterized) GET so the request is meaningful.
 */
type DynamicModuleTest = { name: string; moduleId: string; fullPath: string }
const DYNAMIC_MODULE_TESTS: DynamicModuleTest[] = (() => {
  const tests: DynamicModuleTest[] = []
  for (const [moduleId, routes] of ENABLED_MODULE_API_ROUTES) {
    const getRoutes = routes.filter((r) => r.methods.includes('GET'))
    const preferred = getRoutes.find((r) => !r.path.includes('[')) ?? getRoutes[0]
    if (!preferred) continue
    const displayName = MODULE_NAME_BY_ID.get(moduleId) ?? moduleId
    tests.push({ name: `Fetch ${displayName}`, moduleId, fullPath: preferred.fullPath })
  }
  return tests.sort((a, b) => a.name.localeCompare(b.name))
})()

const DATA_TOGGLE_COLORS = {
  success: { bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-600 dark:text-green-400', btn: 'text-green-600 dark:text-green-400' },
  error: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-500 dark:text-red-300', btn: 'text-red-500 dark:text-red-400' },
  warning: { bg: 'bg-yellow-50 dark:bg-yellow-950', text: 'text-yellow-600 dark:text-yellow-400', btn: 'text-yellow-600 dark:text-yellow-400' },
} as const

/** Collapsible data block — hidden by default, toggle to show */
function DataToggle({ data, variant = 'success' }: { data: any; variant?: 'success' | 'error' | 'warning' }) {
  const [open, setOpen] = useState(false)
  const c = DATA_TOGGLE_COLORS[variant]
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 text-xs ${c.btn} hover:underline`}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <div className={`mt-1 p-2 ${c.bg} rounded`}>
          <pre className={`text-xs ${c.text} whitespace-pre-wrap break-all`}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

interface TestResult {
  name: string
  status: 'pending' | 'testing' | 'success' | 'error' | 'warning'
  message?: string
  data?: any
  error?: any
}

interface SecurityTestResult {
  endpoint: string
  method: string
  status: 'pending' | 'testing' | 'secure' | 'vulnerable' | 'error' | 'warning'
  message?: string
  responseStatus?: number
  error?: string
}

export default function DatabaseTestPage() {
  // Use the global Supabase client from context (already authenticated)
  const { supabase, user, session } = useSupabase()
  const [sessionLoading, setSessionLoading] = useState(true)

  // Wait for session to initialize from Providers
  useEffect(() => {
    // Give Providers context time to initialize
    const timer = setTimeout(() => {
      setSessionLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const [testResults, setTestResults] = useState<TestResult[]>(() => [
    { name: 'Database Mode', status: 'pending' },
    { name: 'Environment Variables', status: 'pending' },
    { name: 'Database Connectivity', status: 'pending' },
    { name: 'Connection Test', status: 'pending' },
    { name: 'Authentication Status', status: 'pending' },
    { name: 'Session Status', status: 'pending' },
    ...DYNAMIC_MODULE_TESTS.map((t) => ({ name: t.name, status: 'pending' as const })),
    { name: 'Test RLS Policies', status: 'pending' },
  ])
  const [securityResults, setSecurityResults] = useState<SecurityTestResult[]>([])
  const [moduleResults, setModuleResults] = useState<TestResult[]>([])
  const [backupResults, setBackupResults] = useState<TestResult[]>([])
  const [authConfigResults, setAuthConfigResults] = useState<TestResult[]>([])
  const [endpointsData, setEndpointsData] = useState<{
    coreEndpoints: Array<{
      path: string
      fullPath: string
      methods: string[]
    }>
    moduleEndpoints: Array<{
      path: string
      fullPath: string
      moduleId: string
      methods: string[]
    }>
    publicEndpoints: Array<{
      path: string
      fullPath: string
      moduleId: string
      methods: string[]
      securityType: string
      description?: string
      hasRateLimit: boolean
    }>
    summary: {
      totalCore: number
      totalModule: number
      totalPublic: number
      totalPrivate: number
      modulesWithPublicRoutes: string[]
      securityCoverage: Record<string, number>
    }
    warnings: string[]
  } | null>(null)
  const [healthChecks, setHealthChecks] = useState<{
    database: 'loading' | 'ok' | 'error'
    domain: { status: 'loading' | 'ok'; hostname: string }
    resend: 'loading' | 'ok' | 'error' | 'not_set'
  }>({ database: 'loading', domain: { status: 'loading', hostname: '' }, resend: 'loading' })

  // Auto-run health checks on mount (all in parallel)
  useEffect(() => {
    // Domain is just the current origin — no API call needed
    const origin = window.location.origin
    setHealthChecks(prev => ({ ...prev, domain: { status: 'ok', hostname: origin } }))

    async function runHealthChecks() {
      const [dbResult, resendResult] = await Promise.allSettled([
        fetch(route('health-database')).then(r => r.json()),
        fetch(route('health-resend')).then(r => r.json()),
      ])

      setHealthChecks(prev => ({
        ...prev,
        database: dbResult.status === 'fulfilled' && dbResult.value.checks?.database?.status === 'ok' ? 'ok' : 'error',
        resend: resendResult.status === 'fulfilled' ? resendResult.value.status : 'error',
      }))
    }
    runHealthChecks()

    // Auto-fetch endpoint summary on mount
    async function fetchEndpointSummary() {
      try {
        const response = await fetch(route('debug-endpoints'))
        if (response.ok) {
          const data = await response.json()
          setEndpointsData(data)
        }
      } catch {
        // Silently fail — the endpoints tab can still manually load
      }
    }
    fetchEndpointSummary()
  }, [])

  const [isRunning, setIsRunning] = useState(false)
  const [isRunningSecurityTests, setIsRunningSecurityTests] = useState(false)
  const [isRunningModuleTests, setIsRunningModuleTests] = useState(false)
  const [isRunningBackupTests, setIsRunningBackupTests] = useState(false)
  const [isRunningAuthConfigTests, setIsRunningAuthConfigTests] = useState(false)
  const [isRunningEndpointsTests, setIsRunningEndpointsTests] = useState(false)
  const [isRunningPublicSecurityTests, setIsRunningPublicSecurityTests] = useState(false)
  const [publicSecurityResults, setPublicSecurityResults] = useState<Array<{
    endpoint: string
    method: string
    status: 'pending' | 'testing' | 'secure' | 'vulnerable' | 'error' | 'warning'
    message?: string
    responseStatus?: number
    securityType?: string
    hasSecurityValidation: boolean
  }>>([])
  const [securityValidationHeader, setSecurityValidationHeader] = useState<string | null>(null)

  const updateTestResult = (name: string, update: Partial<TestResult>) => {
    setTestResults(prev => prev.map(test =>
      test.name === name ? { ...test, ...update } : test
    ))
  }

  const updateSecurityResult = (endpoint: string, method: string, update: Partial<SecurityTestResult>) => {
    setSecurityResults(prev => {
      const key = `${method} ${endpoint}`
      const existing = prev.find(r => r.endpoint === endpoint && r.method === method)
      if (existing) {
        return prev.map(r => r.endpoint === endpoint && r.method === method ? { ...r, ...update } : r)
      } else {
        return [...prev, { endpoint, method, status: 'pending', ...update }]
      }
    })
  }

  const testApiEndpointSecurity = async (endpoint: string, method: string) => {
    updateSecurityResult(endpoint, method, { status: 'testing' })

    // Skip routes that are intentionally public — sourced from the manifest
    // via /api/debug/endpoints (auto-fetched on mount). No hardcoded list.
    const knownPublic = endpointsData?.publicEndpoints?.some((e) => e.fullPath === endpoint)
    if (knownPublic) {
      updateSecurityResult(endpoint, method, {
        status: 'secure',
        message: 'Intentionally public (no auth by design)',
        responseStatus: 200
      })
      return
    }

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        // Force browser to omit cookies so we truly test unauthenticated access
        credentials: 'omit',
        redirect: 'manual'
      }

      // For POST/PUT requests, include minimal body if needed
      if (method === 'POST' || method === 'PUT') {
        options.body = JSON.stringify({})
      }

      const response = await fetch(endpoint, options)

      const redirectedToSignIn = response.type === 'opaqueredirect' ||
        response.redirected ||
        (response.url && response.url.includes('/sign-in')) ||
        (response.status >= 300 && response.status < 400)

      // Check if endpoint properly rejects unauthorized requests
      if (response.status === 401 || response.status === 403 || redirectedToSignIn) {
        updateSecurityResult(endpoint, method, {
          status: 'secure',
          message: redirectedToSignIn
            ? 'Redirected to sign-in (secure)'
            : 'Properly requires authentication',
          responseStatus: response.status || (response.type === 'opaqueredirect' ? 0 : undefined)
        })
      } else if (response.status === 200 || response.status === 201) {
        updateSecurityResult(endpoint, method, {
          status: 'vulnerable',
          message: 'WARNING: Endpoint accessible without authentication!',
          responseStatus: response.status
        })
      } else if (response.status === 400) {
        updateSecurityResult(endpoint, method, {
          status: 'warning',
          message: 'Received 400 (likely validation blocking unauthenticated request); review manually',
          responseStatus: response.status
        })
      } else if (response.status === 404) {
        updateSecurityResult(endpoint, method, {
          status: 'secure',
          message: 'Endpoint not found (expected for some routes)',
          responseStatus: response.status
        })
      } else if (response.status === 405) {
        updateSecurityResult(endpoint, method, {
          status: 'secure',
          message: 'Method not allowed (secure)',
          responseStatus: response.status
        })
      } else {
        updateSecurityResult(endpoint, method, {
          status: 'error',
          message: `Unexpected response: ${response.status}`,
          responseStatus: response.status
        })
      }
    } catch (error: unknown) {
      updateSecurityResult(endpoint, method, {
        status: 'error',
        message: 'Network error during test',
        error: errMsg(error)
      })
    }
  }

  const runSecurityTests = async () => {
    setIsRunningSecurityTests(true)
    console.log('🔒 Starting API security tests...')

    // Clear previous results
    setSecurityResults([])

    try {
      // Reuse already-fetched data or fetch fresh
      let data = endpointsData
      if (!data) {
        const response = await fetch(route('debug-endpoints'))
        if (!response.ok) throw new Error(`Failed to fetch endpoints: ${response.status}`)
        data = await response.json()
        setEndpointsData(data)
      }

      // Build test list from discovered endpoints (core + module)
      const allTests: Array<{ endpoint: string; method: string }> = []
      for (const ep of [...(data!.coreEndpoints || []), ...(data!.moduleEndpoints || [])]) {
        for (const method of ep.methods) {
          if (method === 'unknown') continue
          allTests.push({ endpoint: ep.fullPath, method })
        }
      }

      // Process in batches of 5 to avoid overwhelming the server
      const BATCH_SIZE = 5
      for (let i = 0; i < allTests.length; i += BATCH_SIZE) {
        const batch = allTests.slice(i, i + BATCH_SIZE)
        await Promise.all(
          batch.map(({ endpoint, method }) => testApiEndpointSecurity(endpoint, method))
        )
      }
    } catch (error: unknown) {
      console.error('❌ Failed to fetch endpoints for security testing:', error)
    }

    setIsRunningSecurityTests(false)
    console.log('🔒 API security tests complete!')
  }

  const updateModuleResult = (name: string, update: Partial<TestResult>) => {
    setModuleResults(prev => {
      const existing = prev.find(r => r.name === name)
      if (existing) {
        return prev.map(r => r.name === name ? { ...r, ...update } : r)
      } else {
        return [...prev, { name, status: 'pending', ...update }]
      }
    })
  }

  const updateBackupResult = (name: string, update: Partial<TestResult>) => {
    setBackupResults(prev => {
      const existing = prev.find(r => r.name === name)
      if (existing) {
        return prev.map(r => r.name === name ? { ...r, ...update } : r)
      } else {
        return [...prev, { name, status: 'pending', ...update }]
      }
    })
  }

  const runModuleTests = async () => {
    setIsRunningModuleTests(true)
    setModuleResults([])
    console.log('📦 Starting module diagnostics...')

    // Test 1: Discover modules via API
    updateModuleResult('Module Discovery', { status: 'testing' })
    try {
      const response = await fetch(route('modules-list-all'))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      const modules = data.modules || []

      updateModuleResult('Module Discovery', {
        status: 'success',
        message: `Found ${modules.length} module(s)`,
        data: {
          count: modules.length,
          modules: modules.map((m: any) => ({
            id: m.id,
            name: m.name,
            enabled: m.isEnabled,
            version: m.version
          }))
        }
      })
      console.log('✅ Module discovery passed:', modules.length, 'modules found')

      // Test 2: Check MODULE_PAGES registry completeness
      // Dynamically fetch the generated registry to compare against discovered modules
      updateModuleResult('Registry Completeness', { status: 'testing' })
      try {
        const statusResponse = await fetch(route('debug-module-status'))
        const statusData = statusResponse.ok ? await statusResponse.json() : null

        // Modules with routes defined should have pages registered
        const modulesWithRoutes = modules.filter((m: any) => m.routes && m.routes.length > 0)
        const modulesWithoutRoutes = modules.filter((m: any) => !m.routes || m.routes.length === 0)

        // Check if the registry reports any issues
        const registeredCount = statusData?.registeredModules?.length ?? modulesWithRoutes.length
        const totalDiscovered = modules.length

        updateModuleResult('Registry Completeness', {
          status: 'success',
          message: `${registeredCount} module(s) with pages registered, ${modulesWithoutRoutes.length} without pages (expected)`,
          data: {
            totalDiscovered,
            withRoutes: modulesWithRoutes.length,
            withoutRoutes: modulesWithoutRoutes.map((m: any) => m.id),
            note: 'Registry is auto-generated at build time via generate-module-registry'
          }
        })
        console.log('✅ Registry completeness check passed')
      } catch (error: unknown) {
        updateModuleResult('Registry Completeness', {
          status: 'warning',
          message: 'Could not verify registry completeness',
          data: { error: errMsg(error) }
        })
      }

      // Test 3: Validate module manifests
      updateModuleResult('Manifest Validation', { status: 'testing' })
      const invalidModules = []
      for (const module of modules) {
        const required = ['id', 'name', 'description', 'version', 'icon']
        const missing = required.filter((field: any) => !(field in module))
        if (missing.length > 0) {
          invalidModules.push({ id: module.id, missing })
        }
      }

      if (invalidModules.length === 0) {
        updateModuleResult('Manifest Validation', {
          status: 'success',
          message: 'All module manifests have required fields',
          data: { validatedModules: modules.length }
        })
        console.log('✅ Manifest validation passed')
      } else {
        updateModuleResult('Manifest Validation', {
          status: 'error',
          message: `${invalidModules.length} module(s) have invalid manifests`,
          data: { invalidModules }
        })
        console.error('❌ Manifest validation failed:', invalidModules)
      }

      // Test 4: Check module route accessibility
      updateModuleResult('Route Accessibility', { status: 'testing' })
      const enabledModules = modules.filter((m: any) => m.isEnabled && m.routes && m.routes.length > 0)
      const routeTests: Array<{ module: string; accessible: boolean; status?: number }> = []

      for (const module of enabledModules) {
        try {
          const response = await fetch(`/${module.id}`, {
            method: 'HEAD',
            redirect: 'manual'
          })
          // 200 = accessible, 401/302/307 = requires auth (expected), 404 = not found
          const accessible = response.status === 200 || response.status === 401 ||
                           response.status === 302 || response.status === 307 ||
                           response.type === 'opaqueredirect'
          routeTests.push({
            module: module.id,
            accessible,
            status: response.status
          })
        } catch (error) {
          routeTests.push({
            module: module.id,
            accessible: false
          })
        }
      }

      const inaccessibleRoutes = routeTests.filter(t => !t.accessible)
      if (inaccessibleRoutes.length === 0) {
        updateModuleResult('Route Accessibility', {
          status: 'success',
          message: `All ${enabledModules.length} enabled module routes are accessible`,
          data: { routeTests }
        })
        console.log('✅ Route accessibility check passed')
      } else {
        updateModuleResult('Route Accessibility', {
          status: 'warning',
          message: `${inaccessibleRoutes.length} module route(s) may not be accessible`,
          data: {
            inaccessibleRoutes,
            allTests: routeTests
          }
        })
        console.warn('⚠️ Some routes inaccessible:', inaccessibleRoutes)
      }

      // Test 5: Module API Routes Registry — pulls every registered module API
      // route from the manifest (via the shared ENABLED_MODULE_API_ROUTES map),
      // intersects with the currently enabled modules, and probes them in
      // parallel. No module IDs are hardcoded.
      updateModuleResult('Module API Routes', { status: 'testing' })
      const enabledModuleIds = new Set<string>(enabledModules.map((m: any) => m.id))
      const authHeaders = session?.access_token
        ? { 'Authorization': `Bearer ${session.access_token}` }
        : undefined

      type ApiRouteTest = { module: string; route: string; status: string; message?: string }
      const probeJobs: Array<Promise<ApiRouteTest>> = []
      const skippedModules: string[] = []

      for (const moduleId of enabledModuleIds) {
        const routes = ENABLED_MODULE_API_ROUTES.get(moduleId)
        if (!routes || routes.length === 0) {
          skippedModules.push(moduleId)
          continue
        }
        for (const r of routes) {
          // Routes with [param] segments can't be HEAD-probed without a real ID.
          if (r.path.includes('[')) {
            probeJobs.push(Promise.resolve({
              module: moduleId,
              route: r.fullPath,
              status: 'accessible',
              message: 'dynamic segment — skipped probe',
            }))
            continue
          }
          probeJobs.push(
            fetch(r.fullPath, { method: 'HEAD', headers: authHeaders })
              .then((response): ApiRouteTest => {
                // 200 = ok, 401 = auth wall reached, 405 = method-only endpoint
                const success = response.status === 200 || response.status === 401 || response.status === 405
                return {
                  module: moduleId,
                  route: r.fullPath,
                  status: success ? 'accessible' : 'error',
                  message: `HTTP ${response.status}`,
                }
              })
              .catch((): ApiRouteTest => ({
                module: moduleId,
                route: r.fullPath,
                status: 'error',
                message: 'Request failed',
              }))
          )
        }
      }

      const apiRouteTests = await Promise.all(probeJobs)

      const failedApiRoutes = apiRouteTests.filter(t => t.status === 'error')
      if (failedApiRoutes.length === 0) {
        updateModuleResult('Module API Routes', {
          status: 'success',
          message: `All ${apiRouteTests.length} enabled module API routes accessible${skippedModules.length > 0 ? ` (${skippedModules.length} module(s) without API routes)` : ''}`,
          data: {
            tested: apiRouteTests.length,
            routes: apiRouteTests,
            modulesWithoutApiRoutes: skippedModules.length > 0 ? skippedModules : undefined,
            info: 'Tests every module API route declared in the manifest for enabled modules'
          }
        })
        console.log('✅ Module API routes check passed')
      } else {
        updateModuleResult('Module API Routes', {
          status: 'warning',
          message: `${failedApiRoutes.length} module API route(s) may have issues`,
          data: {
            failedApiRoutes,
            allTests: apiRouteTests,
            modulesWithoutApiRoutes: skippedModules.length > 0 ? skippedModules : undefined,
            hint: 'Check MODULE_API_ROUTES registry in /app/api/modules/[module]/[[...path]]/route.ts'
          }
        })
        console.warn('⚠️ Some module API routes have issues:', failedApiRoutes)
      }

      // Test 6: Module Enabled/Disabled Status
      updateModuleResult('Module Status Check', { status: 'testing' })
      try {
        const response = await fetch(route('debug-module-status'))
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const statusData = await response.json()

        if (!statusData.authenticated) {
          updateModuleResult('Module Status Check', {
            status: 'error',
            message: 'Not authenticated',
            error: 'User must be logged in to check module status'
          })
        } else {
          const moduleChecks = statusData.moduleChecks || {}
          const moduleEntries = Object.entries(moduleChecks) as [string, { exists: boolean; enabled: boolean }][]
          const activeModules = moduleEntries.filter(([, c]) => c.enabled).map(([id]) => id)
          const inactiveModules = moduleEntries.filter(([, c]) => !c.enabled).map(([id]) => id)

          updateModuleResult('Module Status Check', {
            status: 'success',
            message: `${activeModules.length} active, ${inactiveModules.length} inactive`,
            data: {
              userId: statusData.userId,
              activeCount: activeModules.length,
              inactiveCount: inactiveModules.length,
              activeModules,
              inactiveModules,
              moduleChecks
            }
          })
          console.log(`✅ Modules: ${activeModules.length} active, ${inactiveModules.length} inactive`)
        }
      } catch (error: unknown) {
        updateModuleResult('Module Status Check', {
          status: 'error',
          error: errMsg(error),
          data: {
            hint: 'Check if /api/debug/module-status endpoint exists'
          }
        })
        console.error('❌ Module status check failed:', error)
      }

    } catch (error: unknown) {
      updateModuleResult('Module Discovery', {
        status: 'error',
        error: errMsg(error),
        data: {
          hint: 'Check if /api/modules/all endpoint is working'
        }
      })
      console.error('❌ Module discovery failed:', error)
    }

    setIsRunningModuleTests(false)
    console.log('📦 Module diagnostics complete!')
  }

  const runBackupTests = async () => {
    setIsRunningBackupTests(true)
    setBackupResults([])
    console.log('💾 Starting backup system diagnostics...')

    // Single verify fetch reused by all subtests below — the route is
    // expensive (full table discovery + row counts) so one call serves all.
    let verifyResult: any = null
    updateBackupResult('Backup Endpoint Accessibility', { status: 'testing' })
    try {
      const response = await fetch(route('backup-verify'))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      verifyResult = await response.json()

      updateBackupResult('Backup Endpoint Accessibility', {
        status: 'success',
        message: 'Backup verify endpoint is accessible',
      })
      console.log('✅ Backup endpoint accessible')
    } catch (error: unknown) {
      updateBackupResult('Backup Endpoint Accessibility', {
        status: 'error',
        error: errMsg(error),
        data: { hint: 'Check if backup-verify route is registered' }
      })
      console.error('❌ Backup endpoint failed:', error)
      setIsRunningBackupTests(false)
      return
    }

    // Test 2: Table Discovery Methods (reuses verifyResult)
    updateBackupResult('Table Discovery Test', { status: 'testing' })
    try {
      const result = verifyResult

      if (result.status === 'error') {
        throw new Error(result.error)
      }

      const methodLabels: Record<string, string> = {
        'rpc_function': 'RPC Function (Optimal)',
        'raw_sql': 'Raw SQL (Fallback)',
        'individual_validation': 'Individual Validation (Manual)',
        'hardcoded_fallback': 'Hardcoded List (Critical)'
      }

      const methodLabel = methodLabels[result.discoveryMethod] || result.discoveryMethod

      updateBackupResult('Table Discovery Test', {
        status: result.status === 'critical' ? 'error' : result.status === 'warning' ? 'warning' : 'success',
        message: `Using discovery method: ${methodLabel}`,
        data: {
          method: result.discoveryMethod,
          methodsAvailable: result.discoveryResults,
          recommendation: result.discoveryMethod === 'rpc_function'
            ? 'Optimal - database functions working correctly'
            : 'Re-run lib/db/setup.sql in Supabase to install the backup RPC functions for optimal performance'
        }
      })
      console.log('✅ Table discovery test complete:', methodLabel)
    } catch (error: unknown) {
      updateBackupResult('Table Discovery Test', {
        status: 'error',
        error: errMsg(error),
        data: { hint: 'Failed to test discovery methods' }
      })
      console.error('❌ Table discovery test failed:', error)
    }

    // Test 3: Table Discovery Results (reuses verifyResult)
    updateBackupResult('Table Discovery Results', { status: 'testing' })
    try {
      const result = verifyResult

      const foundTables = result.tablesFound

      if (foundTables > 0) {
        updateBackupResult('Table Discovery Results', {
          status: 'success',
          message: `Discovered ${foundTables} tables (dynamic discovery)`,
          data: {
            found: foundTables,
            tables: result.tables.map((t: any) => t.name),
            hint: 'Tables are discovered dynamically from the database'
          }
        })
        console.log('✅ Table discovery successful:', foundTables, 'tables')
      } else {
        updateBackupResult('Table Discovery Results', {
          status: 'error',
          message: 'No tables discovered - all discovery methods failed',
          data: {
            found: 0,
            hint: 'Check database connection and re-run lib/db/setup.sql in the Supabase SQL editor to install the backup RPC functions'
          }
        })
        console.error('❌ No tables discovered')
      }
    } catch (error: unknown) {
      updateBackupResult('Table Discovery Results', {
        status: 'error',
        error: errMsg(error)
      })
      console.error('❌ Table discovery failed:', error)
    }

    // Test 4: Row Count Summary (reuses verifyResult)
    updateBackupResult('Row Count Summary', { status: 'testing' })
    try {
      const result = verifyResult

      updateBackupResult('Row Count Summary', {
        status: 'success',
        message: `Total: ${result.totalRows.toLocaleString()} rows across all tables`,
        data: {
          totalRows: result.totalRows,
          tableBreakdown: result.tables.map((t: any) => ({
            table: t.name,
            rows: t.rowCount,
            status: t.status
          }))
        }
      })
      console.log('✅ Row count summary complete:', result.totalRows)
    } catch (error: unknown) {
      updateBackupResult('Row Count Summary', {
        status: 'error',
        error: errMsg(error)
      })
      console.error('❌ Row count summary failed:', error)
    }

    // Test 5: System Warnings Check (reuses verifyResult)
    updateBackupResult('System Warnings', { status: 'testing' })
    try {
      const result = verifyResult

      if (!result.warnings || result.warnings.length === 0) {
        updateBackupResult('System Warnings', {
          status: 'success',
          message: 'No warnings - backup system is fully operational',
        })
        console.log('✅ No warnings')
      } else {
        updateBackupResult('System Warnings', {
          status: 'warning',
          message: `${result.warnings.length} warning(s) detected`,
          data: {
            warnings: result.warnings,
            hint: result.warnings.some((w: string) => w.includes('CRITICAL'))
              ? 'CRITICAL warnings require immediate attention'
              : 'Review warnings and consider running database migration'
          }
        })
        console.warn('⚠️ Warnings:', result.warnings)
      }
    } catch (error: unknown) {
      updateBackupResult('System Warnings', {
        status: 'error',
        error: errMsg(error)
      })
      console.error('❌ Warnings check failed:', error)
    }

    // Test 6: Export Endpoint Test
    updateBackupResult('Export Endpoint Test', { status: 'testing' })
    try {
      // Just check accessibility, don't actually download
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(route('backup-export'), {
        method: 'HEAD',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // HEAD request should return 405 (method not allowed) or similar
      // That's actually good - it means the endpoint exists
      updateBackupResult('Export Endpoint Test', {
        status: 'success',
        message: 'Export endpoint is accessible',
        data: {
          note: 'Endpoint exists and is protected (requires POST)',
          status: response.status
        }
      })
      console.log('✅ Export endpoint accessible')
    } catch (error: unknown) {
      if (errName(error, 'AbortError')) {
        updateBackupResult('Export Endpoint Test', {
          status: 'error',
          error: 'Export endpoint timed out',
          data: { hint: 'Check if backup export route is working' }
        })
      } else {
        updateBackupResult('Export Endpoint Test', {
          status: 'warning',
          message: 'Could not verify export endpoint',
          error: errMsg(error)
        })
      }
      console.error('⚠️ Export endpoint test:', error)
    }

    setIsRunningBackupTests(false)
    console.log('💾 Backup system diagnostics complete!')
  }

  const runEndpointsTests = async () => {
    setIsRunningEndpointsTests(true)
    setEndpointsData(null)
    console.log('🌐 Fetching endpoints data...')

    try {
      const response = await fetch(route('debug-endpoints'))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      setEndpointsData(data)
      console.log('✅ Endpoints data loaded:', data.summary)
    } catch (error: unknown) {
      console.error('❌ Failed to fetch endpoints:', error)
      setEndpointsData(null)
    }

    setIsRunningEndpointsTests(false)
    console.log('🌐 Endpoints check complete!')
  }

  const runPublicSecurityTests = async () => {
    setIsRunningPublicSecurityTests(true)
    setPublicSecurityResults([])
    console.log('🔐 Starting public endpoint security tests...')

    try {
      // Reuse already-fetched data or fetch fresh
      let data = endpointsData
      if (!data) {
        const response = await fetch(route('debug-endpoints'))
        if (!response.ok) throw new Error(`Failed to fetch endpoints: ${response.status}`)
        data = await response.json()
        setEndpointsData(data)
      }
      const publicEndpoints = data!.publicEndpoints || []

      if (publicEndpoints.length === 0) {
        console.log('No public endpoints to test')
        setIsRunningPublicSecurityTests(false)
        return
      }

      // Test each public endpoint
      for (const endpoint of publicEndpoints) {
        for (const method of endpoint.methods) {
          // Skip GET requests for webhook endpoints (health checks are expected to pass)
          if (method === 'GET' && endpoint.securityType === 'webhook_signature') {
            setPublicSecurityResults(prev => [...prev, {
              endpoint: endpoint.fullPath,
              method,
              status: 'secure',
              message: 'GET health check endpoint (expected to be open)',
              securityType: endpoint.securityType,
              hasSecurityValidation: true
            }])
            continue
          }

          // Update status to testing
          setPublicSecurityResults(prev => [...prev, {
            endpoint: endpoint.fullPath,
            method,
            status: 'testing',
            securityType: endpoint.securityType,
            hasSecurityValidation: false
          }])

          try {
            const options: RequestInit = {
              method,
              headers: { 'Content-Type': 'application/json' },
              credentials: 'omit' // No cookies
            }

            // For POST/PUT/PATCH, send empty body (no signature headers)
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
              options.body = JSON.stringify({ test: true })
            }

            const testResponse = await fetch(endpoint.fullPath, options)
            const responseStatus = testResponse.status

            // Check if response includes security validation header
            const hasValidationHeader = testResponse.headers.get('x-security-validated') === 'true'

            // Determine if endpoint properly rejected the request
            // 400 = missing headers, 401 = invalid signature, 403 = forbidden
            // 200 without auth = VULNERABLE (unless it's a health check)
            let status: 'secure' | 'vulnerable' | 'warning' | 'error' = 'error'
            let message = ''

            if (responseStatus === 400) {
              status = 'secure'
              message = 'Properly rejected: missing security headers'
            } else if (responseStatus === 401) {
              status = 'secure'
              message = 'Correctly denied for invalid/missing credentials'
            } else if (responseStatus === 403) {
              status = 'secure'
              message = 'Properly rejected: access denied'
            } else if (responseStatus === 429) {
              status = 'secure'
              message = 'Rate limit enforced'
            } else if (responseStatus === 200 || responseStatus === 201) {
              // Check if this is a self-limiting endpoint (e.g. bootstrap)
              let responseBody: Record<string, unknown> | null = null
              try { responseBody = await testResponse.json() } catch {}
              if (responseBody?.status === 'already_initialized') {
                status = 'secure'
                message = 'Locked after initialization'
              } else {
                status = 'vulnerable'
                message = 'WARNING: Request succeeded without security headers!'
              }
            } else if (responseStatus === 404) {
              status = 'warning'
              message = 'Endpoint not found (may not be registered in proxy)'
            } else if (responseStatus === 500) {
              status = 'warning'
              message = 'Server error (may be missing env var for secret)'
            } else {
              status = 'warning'
              message = `Unexpected response: ${responseStatus}`
            }

            setPublicSecurityResults(prev => prev.map(r =>
              r.endpoint === endpoint.fullPath && r.method === method
                ? { ...r, status, message, responseStatus, hasSecurityValidation: hasValidationHeader }
                : r
            ))

          } catch (error: unknown) {
            setPublicSecurityResults(prev => prev.map(r =>
              r.endpoint === endpoint.fullPath && r.method === method
                ? { ...r, status: 'error', message: `Network error: ${errMsg(error)}`, hasSecurityValidation: false }
                : r
            ))
          }
        }
      }
    } catch (error: unknown) {
      console.error('Failed to run public security tests:', error)
    }

    setIsRunningPublicSecurityTests(false)
    console.log('🔐 Public endpoint security tests complete!')
  }

  const updateAuthConfigResult = (name: string, update: Partial<TestResult>) => {
    setAuthConfigResults(prev => {
      const existing = prev.find(r => r.name === name)
      if (existing) {
        return prev.map(r => r.name === name ? { ...r, ...update } : r)
      } else {
        return [...prev, { name, status: 'pending', ...update }]
      }
    })
  }

  const runAuthConfigTests = async () => {
    setIsRunningAuthConfigTests(true)
    setAuthConfigResults([])
    console.log('🔐 Starting auth configuration checks...')

    // Test 1: Check if auth API endpoint is accessible
    // Better Auth uses /api/auth/get-session for session checks
    updateAuthConfigResult('Auth API Endpoint', { status: 'testing' })
    try {
      const response = await fetch(route('auth-get-session'), {
        method: 'GET',
        credentials: 'include'
      })

      // Better Auth returns 200 with session data or 200 with null session
      if (response.ok) {
        const data = await response.json()
        updateAuthConfigResult('Auth API Endpoint', {
          status: 'success',
          message: 'Better Auth API endpoint is accessible',
          data: {
            status: response.status,
            hasSession: !!data?.session
          }
        })
      } else {
        throw new Error(`Unexpected status: ${response.status}`)
      }
    } catch (error: unknown) {
      updateAuthConfigResult('Auth API Endpoint', {
        status: 'error',
        error: errMsg(error),
        data: { hint: 'Check if /api/auth/[...all]/route.ts exists' }
      })
    }

    // Test 2: Check session status
    updateAuthConfigResult('Session Status', { status: 'testing' })
    try {
      if (session) {
        const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null
        const isExpired = expiresAt ? expiresAt < new Date() : false

        updateAuthConfigResult('Session Status', {
          status: isExpired ? 'warning' : 'success',
          message: isExpired ? 'Session expired' : `Active session for ${session.user?.email}`,
          data: {
            userId: session.user?.id,
            email: session.user?.email,
            expiresAt: expiresAt?.toISOString(),
            isExpired
          }
        })
      } else {
        updateAuthConfigResult('Session Status', {
          status: 'warning',
          message: 'No active session',
          data: { hint: 'Sign in at /sign-in to test authenticated features' }
        })
      }
    } catch (error: unknown) {
      updateAuthConfigResult('Session Status', {
        status: 'error',
        error: errMsg(error)
      })
    }

    // Test 3: Check environment variables
    updateAuthConfigResult('Environment Variables', { status: 'testing' })
    try {
      const checks: Record<string, string> = {
        DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Missing',
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? 'Set' : 'Missing',
        ARI_DB_MODE: process.env.ARI_DB_MODE || 'Not set (auto-detected)',
      }

      const missingCritical = !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET

      updateAuthConfigResult('Environment Variables', {
        status: missingCritical ? 'error' : 'success',
        message: missingCritical
          ? 'Critical environment variables missing'
          : 'All required env vars configured',
        data: checks
      })
    } catch (error: unknown) {
      updateAuthConfigResult('Environment Variables', {
        status: 'error',
        error: errMsg(error)
      })
    }

    // Test 4: Check auth configuration via API
    updateAuthConfigResult('Auth Configuration', { status: 'testing' })
    try {
      const response = await fetch(route('auth-config'))
      if (response.ok) {
        const config = await response.json()

        const issues = []
        if (!config.sslEnabled && config.isProduction) {
          issues.push('SSL validation disabled in production')
        }
        if (!config.hasProductionOrigin && config.isProduction) {
          issues.push('No production origin configured')
        }
        if (!config.rateLimitEnabled) {
          issues.push('Rate limiting not enabled')
        }
        if (!config.secretConfigured) {
          issues.push('BETTER_AUTH_SECRET not properly configured')
        }

        updateAuthConfigResult('Auth Configuration', {
          status: issues.length === 0 ? 'success' : (issues.some(i => i.includes('SSL') || i.includes('SECRET')) ? 'error' : 'warning'),
          message: issues.length === 0 ? 'Auth configuration is secure' : `${issues.length} issue(s) found`,
          data: {
            ...config,
            issues
          }
        })
      } else if (response.status === 404) {
        updateAuthConfigResult('Auth Configuration', {
          status: 'warning',
          message: 'Auth config endpoint not available',
          data: { hint: 'Create /api/debug/auth-config for detailed checks' }
        })
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error: unknown) {
      updateAuthConfigResult('Auth Configuration', {
        status: 'warning',
        message: 'Could not verify auth configuration',
        error: errMsg(error),
        data: { hint: 'Server-side auth config not exposed to client' }
      })
    }

    // Test 5: Authorization patterns — pick probes dynamically from the manifest:
    //   - first dynamic-segment GET route (tests ID-param protection)
    //   - first PUT/PATCH route (tests mutation protection)
    updateAuthConfigResult('Authorization Patterns', { status: 'testing' })
    try {
      const enabledRoutes: ManifestApiRoute[] = []
      for (const routes of ENABLED_MODULE_API_ROUTES.values()) enabledRoutes.push(...routes)

      const idParamRoute = enabledRoutes.find((r) => r.path.includes('[') && r.methods.includes('GET'))
      const mutationRoute = enabledRoutes.find((r) => r.methods.some(isMutationMethod))

      const probeIdSubstitution = (fullPath: string) => fullPath.replace(/\[[^\]]+\]/g, 'test-uuid-12345')

      const testRoutes: Array<{ path: string; method: string; name: string }> = []
      if (idParamRoute) {
        testRoutes.push({
          path: probeIdSubstitution(idParamRoute.fullPath),
          method: 'GET',
          name: `${MODULE_NAME_BY_ID.get(idParamRoute.moduleId) ?? idParamRoute.moduleId} by ID`,
        })
      }
      if (mutationRoute) {
        const mutationMethod = mutationRoute.methods.find(isMutationMethod) ?? 'PUT'
        testRoutes.push({
          path: probeIdSubstitution(mutationRoute.fullPath),
          method: mutationMethod,
          name: `${MODULE_NAME_BY_ID.get(mutationRoute.moduleId) ?? mutationRoute.moduleId} mutation`,
        })
      }

      if (testRoutes.length === 0) {
        updateAuthConfigResult('Authorization Patterns', {
          status: 'warning',
          message: 'No installed module exposes a route suitable for probing — skipped',
          data: { hint: 'Install a module with a dynamic-segment or PUT/PATCH route to enable this check' }
        })
      } else {
      const results = []
      for (const route of testRoutes) {
        try {
          const response = await fetch(route.path, {
            method: route.method,
            credentials: 'omit',
            redirect: 'manual', // Don't follow redirects - treat redirect as "secure"
            headers: { 'Content-Type': 'application/json' },
            body: route.method !== 'GET' ? JSON.stringify({}) : undefined
          })

          // Redirects (302/307/308) or opaque redirects mean auth is working (redirecting to sign-in)
          const isRedirect = response.type === 'opaqueredirect' ||
            response.status === 302 || response.status === 307 || response.status === 308

          results.push({
            name: route.name,
            path: route.path,
            secure: response.status === 401 || response.status === 404 || response.status === 400 || isRedirect,
            status: response.type === 'opaqueredirect' ? 'redirect' : response.status
          })
        } catch {
          results.push({
            name: route.name,
            path: route.path,
            secure: true, // Network errors are treated as secure (blocked)
            status: 0
          })
        }
      }

      const allSecure = results.every(r => r.secure)
      updateAuthConfigResult('Authorization Patterns', {
        status: allSecure ? 'success' : 'error',
        message: allSecure
          ? 'All tested routes properly require authentication'
          : 'Some routes may not be properly protected',
        data: { results }
      })
      }
    } catch (error: unknown) {
      updateAuthConfigResult('Authorization Patterns', {
        status: 'error',
        error: errMsg(error)
      })
    }

    // Test 6: Session management features
    updateAuthConfigResult('Session Management', { status: 'testing' })
    try {
      if (session) {
        // Try to list sessions
        const response = await fetch(route('auth-list-sessions'), {
          method: 'GET',
          credentials: 'include'
        })

        if (response.ok) {
          const sessions = await response.json()
          updateAuthConfigResult('Session Management', {
            status: 'success',
            message: `${sessions.length || 0} active session(s)`,
            data: {
              sessionCount: sessions.length || 0,
              canRevoke: true
            }
          })
        } else {
          updateAuthConfigResult('Session Management', {
            status: 'warning',
            message: 'Session list endpoint not accessible',
            data: { hint: 'Session management may not be fully configured' }
          })
        }
      } else {
        updateAuthConfigResult('Session Management', {
          status: 'warning',
          message: 'Not authenticated - cannot test session management',
          data: { hint: 'Sign in to test session management features' }
        })
      }
    } catch (error: unknown) {
      updateAuthConfigResult('Session Management', {
        status: 'warning',
        message: 'Could not verify session management',
        error: errMsg(error)
      })
    }

    setIsRunningAuthConfigTests(false)
    console.log('🔐 Auth configuration checks complete!')
  }

  const runTests = async () => {
    setIsRunning(true)
    console.log('🔍 Starting database tests...')

    // PHASE 1: Fast synchronous checks (run in parallel)
    const phase1Tests = [
      // Test 1: Environment Variables
      (async () => {
        updateTestResult('Environment Variables', { status: 'testing' })
        try {
          const databaseUrl = process.env.DATABASE_URL

          if (!databaseUrl) {
            throw new Error('DATABASE_URL not set')
          }

          updateTestResult('Environment Variables', {
            status: 'success',
            message: 'Environment variables are set',
            data: {
              DATABASE_URL: 'Set',
              ARI_DB_MODE: process.env.ARI_DB_MODE || 'Not set (auto-detected)',
            }
          })
          console.log('✅ Environment variables check passed')
        } catch (error: unknown) {
          updateTestResult('Environment Variables', {
            status: 'error',
            error: errMsg(error)
          })
          console.error('❌ Environment variables check failed:', error)
        }
      })(),

      // Test 2: Supabase Client
      (async () => {
        updateTestResult('Database Mode', { status: 'testing' })
        try {
          const res = await fetch(route('project-dir'))
          const data = await res.json()
          const mode = data.dbMode || 'unknown'
          updateTestResult('Database Mode', {
            status: 'success',
            message: `Mode: ${mode}`,
            data: { dbMode: mode, hasDatabaseUrl: data.hasDatabaseUrl }
          })
          console.log('✅ Database mode:', mode)
        } catch (error: unknown) {
          updateTestResult('Database Mode', {
            status: 'error',
            error: errMsg(error)
          })
          console.error('❌ Database mode check failed:', error)
        }
      })()
    ]

    await Promise.all(phase1Tests)

    // Note: Data tests use API routes (not the Supabase client directly),
    // so they work even if the legacy Supabase client is unavailable.

    // PHASE 2: Network connectivity tests (run in parallel)
    const phase2Tests = [
      // Test 3: Database Connectivity
      (async () => {
        updateTestResult('Database Connectivity', { status: 'testing' })
        try {
          console.log('🌐 Testing database connectivity...')

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)

          const response = await fetch(route('test-connection'), {
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          const result = await response.json()

          if (result.success) {
            updateTestResult('Database Connectivity', {
              status: 'success',
              message: 'Database is reachable',
              data: result
            })
            console.log('✅ Database connectivity test passed')
          } else {
            throw new Error(result.error || 'Connection test failed')
          }
        } catch (error: unknown) {
          updateTestResult('Database Connectivity', {
            status: 'error',
            error: errMsg(error),
            data: {
              hint: 'Check DATABASE_URL in .env.local'
            }
          })
          console.error('❌ Database connectivity test failed:', error)
        }
      })(),

      // Test 4: Connection Test (via health API)
      (async () => {
        updateTestResult('Connection Test', { status: 'testing' })
        try {
          console.log('🔌 Testing database connection via health API...')

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)

          const response = await fetch(route('health-database'), { signal: controller.signal })
          clearTimeout(timeoutId)

          const data = await response.json()

          if (response.ok && data.checks?.database?.status === 'ok') {
            updateTestResult('Connection Test', {
              status: 'success',
              message: 'Database connection verified via health check',
              data: {
                connected: true,
                status: response.status,
                database: data.checks.database
              }
            })
            console.log('✅ Connection test passed')
          } else {
            throw new Error(data.checks?.database?.error || `Health check returned ${response.status}`)
          }
        } catch (error: unknown) {
          updateTestResult('Connection Test', {
            status: 'error',
            error: errMsg(error),
            data: {
              hint: errName(error, 'AbortError')
                ? 'Connection timed out - check your network and database'
                : 'Check database connectivity via /api/health'
            }
          })
          console.error('❌ Connection test failed:', error)
        }
      })()
    ]

    await Promise.all(phase2Tests)

    // Test 4: Authentication Status - use session from global context
    updateTestResult('Authentication Status', { status: 'testing' })
    try {
      console.log('🔐 Starting authentication check...')

      // Check if session is still loading from Providers
      if (sessionLoading) {
        updateTestResult('Authentication Status', {
          status: 'testing',
          message: 'Waiting for session to initialize...',
          data: {
            note: 'Session is loading from Providers context'
          }
        })
        console.log('⏳ Waiting for session to initialize...')

        // Wait a bit longer for session to load
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Use session from global context (already loaded, no network call needed)
      if (!session) {
        // No session found - user is not authenticated
        updateTestResult('Authentication Status', {
          status: 'warning',
          message: 'Not authenticated - please sign in',
          data: {
            note: 'No user session found in global context',
            hint: 'Visit /sign-in to authenticate',
            user_from_context: user ? 'Present' : 'Missing'
          }
        })
        console.log('⚠️ Not authenticated - no session in context')
      } else {
        // Session exists - display session info from context
        const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null
        const now = new Date()
        const isExpired = expiresAt ? expiresAt < now : false

        updateTestResult('Authentication Status', {
          status: isExpired ? 'warning' : 'success',
          message: isExpired
            ? 'Session expired - refresh required'
            : `Authenticated as ${session.user.email}`,
          data: {
            user_id: session.user.id,
            email: session.user.email,
            expires_at: expiresAt?.toISOString() || 'Unknown',
            is_expired: isExpired,
            access_token: session.access_token ? 'Present (truncated)' : 'Missing',
            refresh_token: 'N/A (cookie-based auth)',
            note: 'Session retrieved from global context (instant, no network call)',
            user_from_context: user ? `Present (${user.email})` : 'Missing'
          }
        })
        console.log('✅ Session check complete (from context):', {
          email: session.user.email,
          expires: expiresAt?.toISOString(),
          expired: isExpired
        })
      }
    } catch (error: unknown) {
      updateTestResult('Authentication Status', {
        status: 'error',
        error: errMsg(error),
        data: {
          hint: 'Error accessing session from global context'
        }
      })
      console.error('❌ Auth check failed:', error)
      // Continue with other tests even if auth fails
    }

    // Test 5: Session Status (Better Auth)
    updateTestResult('Session Status', { status: 'testing' })
    try {
      console.log('🔑 Checking session status (Better Auth)...')

      // Session comes from Better Auth context (already checked above)
      if (!session) {
        updateTestResult('Session Status', {
          status: 'warning',
          message: 'No active Better Auth session',
          data: { hint: 'Sign in at /sign-in to create a session' }
        })
        console.log('⚠️ No session found')
      } else {
        updateTestResult('Session Status', {
          status: 'success',
          message: 'Active Better Auth session found',
          data: {
            access_token: session.access_token ? 'Present' : 'Missing',
            token: session.token ? 'Present' : 'Missing',
            expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : 'Unknown',
            user_id: session.user?.id || 'Unknown',
            note: 'Using Better Auth (not Supabase Auth)'
          }
        })
        console.log('✅ Session found for user:', session.user?.email)
      }
    } catch (error: unknown) {
      updateTestResult('Session Status', {
        status: 'error',
        error: errMsg(error)
      })
      console.error('❌ Session check failed:', error)
    }

    // PHASE 3: Data fetching tests via API routes (run in parallel).
    // One test per installed module with a GET API route. For each successful
    // fetch we compute RLS ownership in-place (instead of stashing the rows)
    // so phase3Summaries holds bounded metadata even for huge result sets.
    type Phase3Summary = {
      rowCount: number
      source: string
      hasUserScoping: boolean
      allOwnedByCurrentUser: boolean | null
    }
    const phase3Summaries = new Map<string, Phase3Summary>()

    const phase3Tests = DYNAMIC_MODULE_TESTS.map((test) => async () => {
      updateTestResult(test.name, { status: 'testing' })
      try {
        const response = await fetch(test.fullPath)
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || `HTTP ${response.status}`)
        }
        const data = await response.json()
        // Modules return either a bare array or { items: [...] } / { tasks: [...] } etc.
        const rows: any[] = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.items) ? (data as any).items
          : Object.values(data as Record<string, unknown>).find((v) => Array.isArray(v)) as any[] | undefined ?? []

        const sample = rows[0]
        const hasUserScoping = !!sample && typeof sample === 'object' && ('user_id' in sample || 'userId' in sample)
        const allOwnedByCurrentUser = hasUserScoping && user
          ? rows.every((r: any) => r.user_id === user.id || r.userId === user.id)
          : null

        phase3Summaries.set(test.moduleId, {
          rowCount: rows.length,
          source: test.fullPath,
          hasUserScoping,
          allOwnedByCurrentUser,
        })

        updateTestResult(test.name, {
          status: 'success',
          message: `Found ${rows.length} record(s) via API`,
          data: { count: rows.length, source: test.fullPath }
        })
      } catch (error: unknown) {
        updateTestResult(test.name, {
          status: errMsg(error).includes('401') || errMsg(error).includes('Unauthorized') ? 'warning' : 'error',
          error: errMsg(error),
          data: { hint: 'Tests the real API route with Better Auth + withRLS()', source: test.fullPath }
        })
      }
    })

    await Promise.all(phase3Tests.map((fn) => fn()))

    // RLS Policies — pick the first module summary that returned user-scoped
    // rows. Ownership was already verified during phase 3.
    updateTestResult('Test RLS Policies', { status: 'testing' })
    try {
      if (!user) {
        updateTestResult('Test RLS Policies', {
          status: 'warning',
          message: 'Cannot test RLS policies without authentication',
          data: { note: 'Sign in to test RLS policies' }
        })
      } else {
        let probe: (Phase3Summary & { moduleId: string }) | null = null
        for (const [moduleId, summary] of phase3Summaries) {
          if (summary.hasUserScoping && summary.rowCount > 0) {
            probe = { moduleId, ...summary }
            break
          }
        }

        if (!probe) {
          // No module returned user-scoped rows to probe (fresh install or
          // empty DB). Fall back to a direct RLS check against module_settings
          // via a dedicated debug endpoint, so the test still runs.
          try {
            // POST because the endpoint inserts/deletes a sentinel row —
            // it's not a safe/idempotent GET.
            const response = await fetch(route('debug-rls-test'), { method: 'POST' })
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            const rls = await response.json()

            if (rls.error || !rls.authenticated) {
              updateTestResult('Test RLS Policies', {
                status: 'error',
                message: rls.error || 'Not authenticated',
                data: rls
              })
            } else if (rls.success) {
              updateTestResult('Test RLS Policies', {
                status: 'success',
                message: `RLS working — verified via module_settings (positive + negative tests passed)`,
                data: {
                  note: 'Tested using a sentinel row on module_settings since no module had user-scoped data',
                  positiveTest: rls.positiveTest,
                  negativeTest: rls.negativeTest,
                  tableTested: rls.tableTested
                }
              })
            } else {
              updateTestResult('Test RLS Policies', {
                status: 'error',
                message: 'RLS ISSUE — sentinel-row RLS check failed',
                data: {
                  hint: rls.negativeTest?.passed === false
                    ? 'Negative test failed — a different user context saw rows it should not have'
                    : 'Positive test failed — current user context did not see their own inserted row',
                  positiveTest: rls.positiveTest,
                  negativeTest: rls.negativeTest
                }
              })
            }
          } catch (fallbackError: unknown) {
            updateTestResult('Test RLS Policies', {
              status: 'warning',
              message: 'No installed module returned user-scoped rows — fallback RLS check failed',
              data: {
                note: 'RLS test requires at least one module API to return rows containing user_id/userId, or a working /api/debug/rls-test endpoint',
                checkedModules: Array.from(phase3Summaries.keys()),
                fallbackError: errMsg(fallbackError)
              }
            })
          }
        } else {
          const allOwned = probe.allOwnedByCurrentUser === true
          updateTestResult('Test RLS Policies', {
            status: allOwned ? 'success' : 'error',
            message: allOwned
              ? `RLS working — all ${probe.rowCount} record(s) from ${probe.moduleId} belong to current user`
              : `RLS ISSUE — found ${probe.moduleId} records belonging to other users!`,
            data: {
              userId: user.id,
              probedModule: probe.moduleId,
              source: probe.source,
              rowCount: probe.rowCount,
              allOwnedByUser: allOwned,
              note: 'API routes use Drizzle ORM with withRLS() for user isolation'
            }
          })
        }
      }
    } catch (error: unknown) {
      updateTestResult('Test RLS Policies', {
        status: 'error',
        error: errMsg(error),
        data: { hint: 'Tests user isolation via withRLS()' }
      })
    }

    setIsRunning(false)
    console.log('🔍 Database tests complete!')
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-gray-400" />
      case 'testing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
    }
  }

  const getSecurityIcon = (status: SecurityTestResult['status']) => {
    switch (status) {
      case 'pending':
        return <Shield className="h-5 w-5 text-gray-400" />
      case 'testing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      case 'secure':
        return <ShieldCheck className="h-5 w-5 text-green-500" />
      case 'vulnerable':
        return <ShieldAlert className="h-5 w-5 text-red-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: TestResult['status']) => {
    const variants: Record<TestResult['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      testing: 'secondary',
      success: 'default',
      warning: 'secondary',
      error: 'destructive'
    }

    return (
      <Badge variant={variants[status]}>
        {status}
      </Badge>
    )
  }

  const getSecurityBadge = (status: SecurityTestResult['status']) => {
    const variants: Record<SecurityTestResult['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      testing: 'secondary',
      secure: 'default',
      vulnerable: 'destructive',
      error: 'secondary',
      warning: 'outline'
    }

    const labels: Record<SecurityTestResult['status'], string> = {
      pending: 'Pending',
      testing: 'Testing',
      secure: 'Secure',
      vulnerable: 'Vulnerable',
      error: 'Error',
      warning: 'Warning'
    }

    return (
      <Badge variant={variants[status]}>
        {labels[status]}
      </Badge>
    )
  }

  useEffect(() => {
    // Log initial page load
    console.log('🚀 Database Test Page loaded')
    console.log('Environment:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
      hasAnonKey: !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    })
  }, [])

  // Calculate database summary
  const databaseSummary = {
    total: testResults.length,
    success: testResults.filter(r => r.status === 'success').length,
    errors: testResults.filter(r => r.status === 'error').length,
    warnings: testResults.filter(r => r.status === 'warning').length,
    pending: testResults.filter(r => r.status === 'pending').length,
  }

  // Calculate security summary
  const securitySummary = {
    total: securityResults.length,
    secure: securityResults.filter(r => r.status === 'secure').length,
    vulnerable: securityResults.filter(r => r.status === 'vulnerable').length,
    errors: securityResults.filter(r => r.status === 'error').length,
  }

  // Calculate module summary
  const moduleSummary = {
    total: moduleResults.length,
    success: moduleResults.filter(r => r.status === 'success').length,
    errors: moduleResults.filter(r => r.status === 'error').length,
    warnings: moduleResults.filter(r => r.status === 'warning').length,
  }

  // Calculate backup summary
  const backupSummary = {
    total: backupResults.length,
    success: backupResults.filter(r => r.status === 'success').length,
    errors: backupResults.filter(r => r.status === 'error').length,
    warnings: backupResults.filter(r => r.status === 'warning').length,
  }

  // Calculate auth config summary
  const authConfigSummary = {
    total: authConfigResults.length,
    success: authConfigResults.filter(r => r.status === 'success').length,
    errors: authConfigResults.filter(r => r.status === 'error').length,
    warnings: authConfigResults.filter(r => r.status === 'warning').length,
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">System Testing</h1>
        <p className="text-muted-foreground mt-2">Comprehensive system testing and diagnostics</p>
      </div>

      {/* System Status */}
      <div className="mb-8 flex flex-wrap gap-4">
        {/* Database */}
        <div className="flex items-center gap-2.5 rounded-lg border px-4 py-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${
            healthChecks.database === 'loading' ? 'bg-gray-300 animate-pulse' :
            healthChecks.database === 'ok' ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className="text-sm font-medium">Database</span>
          <span className={`text-xs ${
            healthChecks.database === 'loading' ? 'text-gray-400' :
            healthChecks.database === 'ok' ? 'text-green-600' : 'text-red-600'
          }`}>
            {healthChecks.database === 'loading' ? 'Checking...' :
             healthChecks.database === 'ok' ? 'Connected' : 'Error'}
          </span>
        </div>

        {/* Domain */}
        <div className="flex items-center gap-2.5 rounded-lg border px-4 py-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${
            healthChecks.domain.status === 'loading' ? 'bg-gray-300 animate-pulse' : 'bg-green-500'
          }`} />
          <span className="text-sm font-medium">Domain</span>
          <span className="text-xs text-green-600">
            {healthChecks.domain.hostname || 'Checking...'}
          </span>
        </div>

        {/* Resend */}
        <div className="flex items-center gap-2.5 rounded-lg border px-4 py-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${
            healthChecks.resend === 'loading' ? 'bg-gray-300 animate-pulse' :
            healthChecks.resend === 'ok' ? 'bg-green-500' :
            healthChecks.resend === 'not_set' ? 'bg-gray-400' : 'bg-red-500'
          }`} />
          <span className="text-sm font-medium">Resend</span>
          <span className={`text-xs ${
            healthChecks.resend === 'loading' ? 'text-gray-400' :
            healthChecks.resend === 'ok' ? 'text-green-600' :
            healthChecks.resend === 'not_set' ? 'text-gray-400' : 'text-red-600'
          }`}>
            {healthChecks.resend === 'loading' ? 'Checking...' :
             healthChecks.resend === 'ok' ? 'Connected' :
             healthChecks.resend === 'not_set' ? 'Not configured' : 'Error'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="database" className="w-full">
        <TabsList className="grid w-full grid-cols-6 mb-8">
          <TabsTrigger value="database" className="flex items-center gap-2">
            <DatabaseIcon className="h-4 w-4" />
            Database
          </TabsTrigger>
          <TabsTrigger value="endpoints" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Endpoints
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="authconfig" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Auth Config
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            Backup
          </TabsTrigger>
        </TabsList>

        {/* Database Tests Tab */}
        <TabsContent value="database" className="space-y-6">
          <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Database Connection Test</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Run comprehensive tests to diagnose database connection issues
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3 mb-6">
                <Button
                  onClick={runTests}
                  disabled={isRunning}
                  size="lg"
                  className="w-full"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Tests...
                    </>
                  ) : (
                    'Run Database Tests'
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Open browser console for detailed logs
                </p>
              </div>

              {databaseSummary.pending < databaseSummary.total && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold">{databaseSummary.total}</div>
                    <p className="text-xs text-muted-foreground">Total Tests</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-green-500">{databaseSummary.success}</div>
                    <p className="text-xs text-muted-foreground">Passed</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-yellow-500">{databaseSummary.warnings}</div>
                    <p className="text-xs text-muted-foreground">Warnings</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-red-500">{databaseSummary.errors}</div>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {testResults.map((test) => (
                  <Card key={test.name} className="border">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          {getStatusIcon(test.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{test.name}</h3>
                              {getStatusBadge(test.status)}
                            </div>

                            {test.message && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {test.message}
                              </p>
                            )}

                            {test.error && (
                              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                                <p className="text-red-600 dark:text-red-400 font-medium">
                                  Error: {test.error}
                                </p>
                                {test.data && <DataToggle data={test.data} variant="error" />}
                              </div>
                            )}

                            {test.data && test.status === 'success' && (
                              <DataToggle data={test.data} variant="success" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        {/* Security Tests Tab */}
        <TabsContent value="security" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Shield className="h-6 w-6" />
              API Security Tests
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Verify that all API endpoints require proper authentication
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3 mb-6">
                <Button
                  onClick={runSecurityTests}
                  disabled={isRunningSecurityTests}
                  size="lg"
                  variant="outline"
                  className="w-full"
                >
                  {isRunningSecurityTests ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing Security...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Run Security Tests
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Tests unauthorized access to API endpoints
                </p>
              </div>

              {/* Security Summary */}
              {securityResults.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg border px-4 py-3">
                      <div className="text-2xl font-bold">{securitySummary.total}</div>
                      <p className="text-xs text-muted-foreground">Total Endpoints</p>
                    </div>
                    <div className="rounded-lg border px-4 py-3">
                      <div className="text-2xl font-bold text-green-500">{securitySummary.secure}</div>
                      <p className="text-xs text-muted-foreground">Secure</p>
                    </div>
                    <div className="rounded-lg border px-4 py-3">
                      <div className="text-2xl font-bold text-red-500">{securitySummary.vulnerable}</div>
                      <p className="text-xs text-muted-foreground">Vulnerable</p>
                    </div>
                    <div className="rounded-lg border px-4 py-3">
                      <div className="text-2xl font-bold text-yellow-500">{securitySummary.errors}</div>
                      <p className="text-xs text-muted-foreground">Errors</p>
                    </div>
                  </div>
                  {securitySummary.vulnerable > 0 && (
                    <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-900 text-sm">
                      <p className="text-red-600 dark:text-red-400 font-medium">
                        WARNING: {securitySummary.vulnerable} endpoint(s) may be publicly accessible!
                      </p>
                      <ul className="mt-2 space-y-1">
                        {securityResults
                          .filter(r => r.status === 'vulnerable')
                          .map((r, i) => (
                            <li key={i} className="text-xs font-mono text-red-600 dark:text-red-400">
                              <span className="inline-block min-w-[3rem]">{r.method}</span> {r.endpoint}
                              {r.responseStatus ? ` → HTTP ${r.responseStatus}` : ''}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Security Test Results */}
              <div className="space-y-2">
                {securityResults.map((result, index) => (
                  <Card key={index} className="border">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          {getSecurityIcon(result.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                {result.method}
                              </code>
                              <span className="text-sm font-medium">{result.endpoint}</span>
                              {getSecurityBadge(result.status)}
                            </div>

                            {result.message && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {result.message}
                              </p>
                            )}

                            {result.responseStatus && (
                              <p className="text-xs text-muted-foreground mt-1">
                                HTTP {result.responseStatus}
                              </p>
                            )}

                            {result.error && (
                              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-xs">
                                <p className="text-red-600 dark:text-red-400">
                                  {result.error}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Public Endpoint Security Tests */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Globe className="h-5 w-5 text-orange-500" />
              Public Endpoint Security Tests
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Verify that public endpoints properly enforce their configured security (signatures, API keys, rate limits)
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3 mb-6">
                <Button
                  onClick={runPublicSecurityTests}
                  disabled={isRunningPublicSecurityTests}
                  size="lg"
                  variant="outline"
                  className="w-full border-orange-500/50 hover:bg-orange-500/10"
                >
                  {isRunningPublicSecurityTests ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing Public Endpoints...
                    </>
                  ) : (
                    <>
                      <Globe className="mr-2 h-4 w-4" />
                      Run Public Endpoint Security Tests
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Tests that public endpoints reject requests without valid security headers (signatures, API keys)
                </p>
              </div>

              {/* Public Security Summary */}
              {publicSecurityResults.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold">{publicSecurityResults.length}</div>
                    <p className="text-xs text-muted-foreground">Total Tested</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-green-500">{publicSecurityResults.filter(r => r.status === 'secure').length}</div>
                    <p className="text-xs text-muted-foreground">Secured</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-yellow-500">{publicSecurityResults.filter(r => r.status === 'warning').length}</div>
                    <p className="text-xs text-muted-foreground">Warnings</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-red-500">{publicSecurityResults.filter(r => r.status === 'vulnerable').length}</div>
                    <p className="text-xs text-muted-foreground">Vulnerable</p>
                  </div>
                </div>
              )}

              {/* Public Security Test Results */}
              {publicSecurityResults.length > 0 && (
                <div className="space-y-2">
                  {publicSecurityResults.map((result, index) => (
                    <Card key={index} className={`border ${
                      result.status === 'vulnerable' ? 'border-red-500/50 bg-red-500/5' :
                      result.status === 'secure' ? 'border-green-500/30' :
                      result.status === 'warning' ? 'border-yellow-500/30' : ''
                    }`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            {result.status === 'secure' && <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />}
                            {result.status === 'vulnerable' && <XCircle className="h-5 w-5 text-red-500 mt-0.5" />}
                            {result.status === 'warning' && <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />}
                            {result.status === 'error' && <XCircle className="h-5 w-5 text-gray-500 mt-0.5" />}
                            {result.status === 'testing' && <Loader2 className="h-5 w-5 text-blue-500 mt-0.5 animate-spin" />}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant="outline" className="bg-blue-500/20 text-blue-500 border-blue-500/50 text-xs">
                                  <Globe className="h-3 w-3 mr-1" />
                                  Public
                                </Badge>
                                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                  {result.method}
                                </code>
                                <span className="text-sm font-medium">{result.endpoint}</span>
                              </div>

                              <div className="flex items-center gap-2 mt-1">
                                {result.securityType && (
                                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
                                    {result.securityType}
                                  </Badge>
                                )}
                                {result.responseStatus && (
                                  <span className="text-xs text-muted-foreground">
                                    HTTP {result.responseStatus}
                                  </span>
                                )}
                              </div>

                              {result.message && (
                                <p className={`text-xs mt-1 ${
                                  result.status === 'vulnerable' ? 'text-red-500' :
                                  result.status === 'secure' ? 'text-green-600 dark:text-green-400' :
                                  'text-muted-foreground'
                                }`}>
                                  {result.message}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {publicSecurityResults.length === 0 && !isRunningPublicSecurityTests && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Click the button above to test public endpoint security. This will verify that all public endpoints
                  properly reject requests that don&apos;t include valid security headers.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        {/* Auth Config Tests Tab */}
        <TabsContent value="authconfig" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Key className="h-6 w-6" />
              Auth Configuration Checks
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Verify Better Auth configuration, session management, and authorization patterns
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3 mb-6">
                <Button
                  onClick={runAuthConfigTests}
                  disabled={isRunningAuthConfigTests}
                  size="lg"
                  variant="outline"
                  className="w-full"
                >
                  {isRunningAuthConfigTests ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing Auth Config...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      Run Auth Config Tests
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Tests authentication configuration, session security, and authorization
                </p>
              </div>

              {/* Auth Config Summary */}
              {authConfigResults.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold">{authConfigSummary.total}</div>
                    <p className="text-xs text-muted-foreground">Total Checks</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-green-500">{authConfigSummary.success}</div>
                    <p className="text-xs text-muted-foreground">Passed</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-yellow-500">{authConfigSummary.warnings}</div>
                    <p className="text-xs text-muted-foreground">Warnings</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-red-500">{authConfigSummary.errors}</div>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>
              )}

              {/* Auth Config Test Results */}
              <div className="space-y-2">
                {authConfigResults.map((test) => (
                  <Card key={test.name} className="border">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          {getStatusIcon(test.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-medium">{test.name}</h3>
                              {getStatusBadge(test.status)}
                            </div>

                            {test.message && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {test.message}
                              </p>
                            )}

                            {test.error && (
                              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-xs">
                                <p className="text-red-600 dark:text-red-400 font-medium">
                                  Error: {test.error}
                                </p>
                                {test.data && <DataToggle data={test.data} variant="error" />}
                              </div>
                            )}

                            {test.data && test.status === 'success' && (
                              <DataToggle data={test.data} variant="success" />
                            )}

                            {test.data && test.status === 'warning' && (
                              <DataToggle data={test.data} variant="warning" />
                            )}

                            {test.data && test.status === 'error' && !test.error && (
                              <DataToggle data={test.data} variant="error" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        {/* Modules Tests Tab */}
        <TabsContent value="modules" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              📦 Module System Tests
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Diagnose module discovery, registry completeness, and route accessibility
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3 mb-6">
                <Button
                  onClick={runModuleTests}
                  disabled={isRunningModuleTests}
                  size="lg"
                  variant="outline"
                  className="w-full"
                >
                  {isRunningModuleTests ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing Modules...
                    </>
                  ) : (
                    <>
                      📦 Run Module Tests
                    </>
                  )}
                </Button>
              </div>

              {/* Module Summary */}
              {moduleResults.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold">{moduleSummary.total}</div>
                    <p className="text-xs text-muted-foreground">Total Tests</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-green-500">{moduleSummary.success}</div>
                    <p className="text-xs text-muted-foreground">Passed</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-yellow-500">{moduleSummary.warnings}</div>
                    <p className="text-xs text-muted-foreground">Warnings</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-red-500">{moduleSummary.errors}</div>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>
              )}

              {/* Module Test Results */}
              <div className="space-y-2">
                {moduleResults.map((test) => (
                  <Card key={test.name} className="border">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          {getStatusIcon(test.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-medium">{test.name}</h3>
                              {getStatusBadge(test.status)}
                            </div>

                            {test.message && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {test.message}
                              </p>
                            )}

                            {test.error && (
                              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-xs">
                                <p className="text-red-600 dark:text-red-400 font-medium">
                                  Error: {test.error}
                                </p>
                                {test.data && <DataToggle data={test.data} variant="error" />}
                              </div>
                            )}

                            {test.data && test.status === 'success' && (
                              <DataToggle data={test.data} variant="success" />
                            )}

                            {test.data && test.status === 'warning' && (
                              <DataToggle data={test.data} variant="warning" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        {/* Backup Tests Tab */}
        <TabsContent value="backup" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              💾 Backup System Tests
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Verify backup system integrity, table discovery, and export functionality
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3 mb-6">
                <Button
                  onClick={runBackupTests}
                  disabled={isRunningBackupTests}
                  size="lg"
                  variant="outline"
                  className="w-full"
                >
                  {isRunningBackupTests ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing Backup...
                    </>
                  ) : (
                    <>
                      💾 Run Backup Tests
                    </>
                  )}
                </Button>
              </div>

              {/* Backup Summary */}
              {backupResults.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold">{backupSummary.total}</div>
                    <p className="text-xs text-muted-foreground">Total Tests</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-green-500">{backupSummary.success}</div>
                    <p className="text-xs text-muted-foreground">Passed</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-yellow-500">{backupSummary.warnings}</div>
                    <p className="text-xs text-muted-foreground">Warnings</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <div className="text-2xl font-bold text-red-500">{backupSummary.errors}</div>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>
              )}

              {/* Backup Test Results */}
              <div className="space-y-2">
                {backupResults.map((test) => (
                  <Card key={test.name} className="border">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          {getStatusIcon(test.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-medium">{test.name}</h3>
                              {getStatusBadge(test.status)}
                            </div>

                            {test.message && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {test.message}
                              </p>
                            )}

                            {test.error && (
                              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-xs">
                                <p className="text-red-600 dark:text-red-400 font-medium">
                                  Error: {test.error}
                                </p>
                                {test.data && <DataToggle data={test.data} variant="error" />}
                              </div>
                            )}

                            {test.data && test.status === 'success' && (
                              <DataToggle data={test.data} variant="success" />
                            )}

                            {test.data && test.status === 'warning' && (
                              <DataToggle data={test.data} variant="warning" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">API Endpoints Overview</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                View all public and private API endpoints in the system with their security configurations
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <Button
                  onClick={runEndpointsTests}
                  disabled={isRunningEndpointsTests}
                  size="lg"
                  className="w-full"
                >
                  {isRunningEndpointsTests ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading Endpoints...
                    </>
                  ) : (
                    <>
                      <Globe className="mr-2 h-4 w-4" />
                      Load Endpoints Data
                    </>
                  )}
                </Button>

                {endpointsData && (
                  <div className="space-y-6">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold text-blue-500">{endpointsData.summary.totalCore}</div>
                          <p className="text-xs text-muted-foreground">Core API Routes</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold text-green-500">{endpointsData.summary.totalModule}</div>
                          <p className="text-xs text-muted-foreground">Module API Routes</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold text-orange-500">{endpointsData.summary.totalPublic}</div>
                          <p className="text-xs text-muted-foreground">Public Endpoints</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold">{endpointsData.summary.totalPrivate}</div>
                          <p className="text-xs text-muted-foreground">Total Private</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold">{endpointsData.summary.modulesWithPublicRoutes.length}</div>
                          <p className="text-xs text-muted-foreground">Modules w/ Public Routes</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Warnings */}
                    {endpointsData.warnings.length > 0 && (
                      <Card className="border-yellow-500/50 bg-yellow-500/10">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                            Warnings
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-1">
                            {endpointsData.warnings.map((warning, i) => (
                              <li key={i} className="text-sm text-yellow-900 dark:text-yellow-200">{warning}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Public Endpoints */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Globe className="h-5 w-5 text-orange-500" />
                          Public Endpoints
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Setup-only endpoints — public during first-run, protected after a user account exists
                        </p>
                      </CardHeader>
                      <CardContent>
                        {endpointsData.publicEndpoints.length === 0 ? (
                          <p className="text-muted-foreground">No public endpoints configured</p>
                        ) : (
                          <div className="space-y-3">
                            {endpointsData.publicEndpoints.map((endpoint, i) => (
                              <div key={i} className="flex items-start justify-between p-3 rounded-lg bg-muted/30 border border-orange-500/30">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="bg-blue-500/20 text-blue-500 border-blue-500/50">
                                      <Globe className="h-3 w-3 mr-1" />
                                      Public
                                    </Badge>
                                    <code className="text-sm font-mono">{endpoint.fullPath}</code>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Methods:</span>
                                    {endpoint.methods.map(method => (
                                      <Badge key={method} variant="secondary" className="text-xs">{method}</Badge>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Security:</span>
                                    <Badge variant="outline" className="bg-blue-500/20 text-blue-500 border-blue-500/50">
                                      {endpoint.securityType}
                                    </Badge>
                                    {endpoint.hasRateLimit && (
                                      <Badge variant="outline" className="bg-purple-500/20 text-purple-500 border-purple-500/50">
                                        Rate Limited
                                      </Badge>
                                    )}
                                    {endpoint.requiresAuthIfUsers && (
                                      <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50">
                                        Auth Required Post-Setup
                                      </Badge>
                                    )}
                                  </div>
                                  {endpoint.description && (
                                    <p className="text-xs text-muted-foreground">{endpoint.description}</p>
                                  )}
                                </div>
                                <Badge variant="outline">{endpoint.moduleId}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Core API Endpoints */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Lock className="h-5 w-5 text-blue-500" />
                          Core API Routes ({endpointsData.coreEndpoints.length})
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Routes under /app/api/ - require authentication
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {endpointsData.coreEndpoints.map((endpoint, i) => (
                            <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-blue-500/20">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-blue-500/20 text-blue-500 border-blue-500/50 text-xs">
                                  Core
                                </Badge>
                                <code className="text-xs font-mono">{endpoint.fullPath}</code>
                              </div>
                              <div className="flex items-center gap-1">
                                {endpoint.methods.map(method => (
                                  <Badge key={method} variant="secondary" className="text-xs">{method}</Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Module API Endpoints */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Lock className="h-5 w-5 text-green-500" />
                          Module API Routes ({endpointsData.moduleEndpoints.length})
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Routes from modules - require authentication
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {endpointsData.moduleEndpoints.map((endpoint, i) => (
                            <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-green-500/20">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50 text-xs">
                                  {endpoint.moduleId}
                                </Badge>
                                <code className="text-xs font-mono">{endpoint.fullPath}</code>
                              </div>
                              <div className="flex items-center gap-1">
                                {endpoint.methods.map(method => (
                                  <Badge key={method} variant="secondary" className="text-xs">{method}</Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="fixed bottom-4 left-4 text-xs text-muted-foreground/50">
        ARI {process.env.NEXT_PUBLIC_ARI_VERSION}
      </div>
    </div>
  )
}
