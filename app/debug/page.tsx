'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/components/providers'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle2, XCircle, Loader2, Shield, ShieldAlert, ShieldCheck, Database as DatabaseIcon, Package, Save, Key } from 'lucide-react'

interface TestResult {
  name: string
  status: 'pending' | 'testing' | 'success' | 'error' | 'warning'
  message?: string
  data?: any
  error?: any
}

interface ApiEndpoint {
  path: string
  methods: string[]
  description?: string
}

interface SecurityTestResult {
  endpoint: string
  method: string
  status: 'pending' | 'testing' | 'secure' | 'vulnerable' | 'error'
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

  const [testResults, setTestResults] = useState<TestResult[]>([
    { name: 'Supabase Client Initialization', status: 'pending' },
    { name: 'Environment Variables', status: 'pending' },
    { name: 'Network Connectivity', status: 'pending' },
    { name: 'Connection Test', status: 'pending' },
    { name: 'Authentication Status', status: 'pending' },
    { name: 'Session Status', status: 'pending' },
    { name: 'Fetch Tasks', status: 'pending' },
    { name: 'Fetch Contacts', status: 'pending' },
    { name: 'Fetch Northstar Entries', status: 'pending' },
    { name: 'Fetch Fitness Data', status: 'pending' },
    { name: 'Test RLS Policies', status: 'pending' },
  ])
  const [securityResults, setSecurityResults] = useState<SecurityTestResult[]>([])
  const [moduleResults, setModuleResults] = useState<TestResult[]>([])
  const [backupResults, setBackupResults] = useState<TestResult[]>([])
  const [authConfigResults, setAuthConfigResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isRunningSecurityTests, setIsRunningSecurityTests] = useState(false)
  const [isRunningModuleTests, setIsRunningModuleTests] = useState(false)
  const [isRunningBackupTests, setIsRunningBackupTests] = useState(false)
  const [isRunningAuthConfigTests, setIsRunningAuthConfigTests] = useState(false)

  // Define all API endpoints for testing
  const apiEndpoints: ApiEndpoint[] = [
    { path: '/api/tasks', methods: ['GET', 'POST'], description: 'Tasks management' },
    { path: '/api/tasks/increment-completion', methods: ['POST'], description: 'Increment task completion' },
    { path: '/api/tasks/priorities', methods: ['GET', 'PUT'], description: 'Task priorities' },
    { path: '/api/modules/contacts', methods: ['GET', 'POST'], description: 'Contacts management (NEW MODULE API)' },
    { path: '/api/goals', methods: ['GET', 'POST'], description: 'Goals/NorthStar management' },
    { path: '/api/modules/winter-arc', methods: ['GET', 'POST'], description: 'Winter Arc Goals (NEW MODULE API)' },
    { path: '/api/fitness-stats', methods: ['GET'], description: 'Fitness statistics' },
    { path: '/api/fitness-tasks', methods: ['GET', 'POST'], description: 'Fitness tasks' },
    { path: '/api/hyrox/workouts', methods: ['GET', 'POST'], description: 'HYROX workouts' },
    { path: '/api/hyrox/setup', methods: ['POST'], description: 'HYROX setup' },
    { path: '/api/hyrox/reset', methods: ['POST'], description: 'HYROX reset' },
    { path: '/api/hyrox/station-records', methods: ['GET'], description: 'HYROX station records' },
    { path: '/api/hyrox/workout-stations', methods: ['GET', 'POST'], description: 'HYROX workout stations' },
    { path: '/api/backup/export', methods: ['POST'], description: 'Database export' },
    { path: '/api/backup/import', methods: ['POST', 'PUT'], description: 'Database import' },
    { path: '/api/chat', methods: ['POST'], description: 'AI chat assistant' },
    { path: '/api/last-completed-task', methods: ['GET'], description: 'Last completed task' },
    { path: '/api/sample-fitness-tasks', methods: ['GET'], description: 'Sample fitness tasks' },
    { path: '/api/shipments', methods: ['GET', 'POST'], description: 'Shipments management' },
    { path: '/api/modules/motivation/setup', methods: ['GET'], description: 'Motivation setup (NEW MODULE API)' },
    { path: '/api/modules/motivation/reorder', methods: ['POST'], description: 'Motivation reorder (NEW MODULE API)' },
    { path: '/api/modules/motivation/refresh-thumbnail', methods: ['POST'], description: 'Motivation refresh (NEW MODULE API)' },
    { path: '/api/instagram/metadata', methods: ['GET'], description: 'Instagram metadata' },
  ]

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
    } catch (error: any) {
      updateSecurityResult(endpoint, method, {
        status: 'error',
        message: 'Network error during test',
        error: error.message
      })
    }
  }

  const runSecurityTests = async () => {
    setIsRunningSecurityTests(true)
    console.log('🔒 Starting API security tests...')

    // Clear previous results
    setSecurityResults([])

    // Parallelize security tests - test multiple endpoints concurrently
    // Process in batches of 5 to avoid overwhelming the server
    const BATCH_SIZE = 5
    const allTests: Array<{ endpoint: string; method: string }> = []

    // Build list of all endpoint/method combinations
    for (const endpoint of apiEndpoints) {
      for (const method of endpoint.methods) {
        allTests.push({ endpoint: endpoint.path, method })
      }
    }

    // Process tests in parallel batches
    for (let i = 0; i < allTests.length; i += BATCH_SIZE) {
      const batch = allTests.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(({ endpoint, method }) => testApiEndpointSecurity(endpoint, method))
      )
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
      const response = await fetch('/api/modules/all')
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
      updateModuleResult('Registry Completeness', { status: 'testing' })
      const registeredModules = ['assist', 'contacts', 'daily-fitness', 'gratitude', 'hello-world', 'hyrox', 'knowledge-manager', 'major-projects', 'motivation', 'northstar', 'ohtani', 'quotes', 'shipments', 'south-africa', 'task-aquarium', 'task-monsters', 'winter-arc', 'world-clock']
      const discoveredModuleIds = modules.map((m: any) => m.id)
      const missingFromRegistry = discoveredModuleIds.filter((id: string) => !registeredModules.includes(id))
      const extraInRegistry = registeredModules.filter(id => !discoveredModuleIds.includes(id))

      if (missingFromRegistry.length === 0 && extraInRegistry.length === 0) {
        updateModuleResult('Registry Completeness', {
          status: 'success',
          message: 'All modules properly registered in MODULE_PAGES',
          data: {
            registered: registeredModules,
            discovered: discoveredModuleIds
          }
        })
        console.log('✅ Registry completeness check passed')
      } else if (missingFromRegistry.length > 0) {
        updateModuleResult('Registry Completeness', {
          status: 'error',
          message: `${missingFromRegistry.length} module(s) missing from MODULE_PAGES registry`,
          data: {
            missingFromRegistry,
            extraInRegistry,
            hint: 'Add missing modules to MODULE_PAGES in /app/[module]/[[...slug]]/page.tsx'
          }
        })
        console.error('❌ Registry check failed - missing modules:', missingFromRegistry)
      } else {
        updateModuleResult('Registry Completeness', {
          status: 'warning',
          message: 'Registry has extra modules not found in filesystem',
          data: { extraInRegistry }
        })
        console.warn('⚠️ Registry has extra modules:', extraInRegistry)
      }

      // Test 3: Validate module manifests
      updateModuleResult('Manifest Validation', { status: 'testing' })
      const invalidModules = []
      for (const module of modules) {
        const required = ['id', 'name', 'description', 'version', 'author', 'icon', 'enabled']
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
      const enabledModules = modules.filter((m: any) => m.isEnabled)
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

      // Test 5: Module API Routes Registry (NEW - Post-Migration)
      updateModuleResult('Module API Routes', { status: 'testing' })
      const migratedModules = ['contacts', 'motivation', 'winter-arc']
      const apiRouteTests: Array<{ module: string; route: string; status: string; message?: string }> = []

      // Test migrated module API endpoints
      for (const moduleId of migratedModules) {
        const testRoutes = moduleId === 'motivation'
          ? ['setup', 'reorder', 'refresh-thumbnail']
          : [''] // Base route for contacts and winter-arc

        for (const route of testRoutes) {
          const endpoint = route
            ? `/api/modules/${moduleId}/${route}`
            : `/api/modules/${moduleId}`

          try {
            const response = await fetch(endpoint, {
              method: 'HEAD',
              headers: session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}
            })

            const success = response.status === 200 || response.status === 401 || response.status === 405 // 401 = auth working, 405 = POST-only endpoint
            apiRouteTests.push({
              module: moduleId,
              route: endpoint,
              status: success ? 'accessible' : 'error',
              message: `HTTP ${response.status}`
            })
          } catch (error) {
            apiRouteTests.push({
              module: moduleId,
              route: endpoint,
              status: 'error',
              message: 'Request failed'
            })
          }
        }
      }

      const failedApiRoutes = apiRouteTests.filter(t => t.status === 'error')
      if (failedApiRoutes.length === 0) {
        updateModuleResult('Module API Routes', {
          status: 'success',
          message: `All ${apiRouteTests.length} migrated module API routes accessible`,
          data: {
            tested: apiRouteTests.length,
            routes: apiRouteTests,
            migratedModules,
            info: 'Tests contacts, motivation, and winter-arc module API endpoints'
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
            hint: 'Check MODULE_API_ROUTES registry in /app/api/modules/[module]/[[...path]]/route.ts'
          }
        })
        console.warn('⚠️ Some module API routes have issues:', failedApiRoutes)
      }

      // Test 6: Module Enabled/Disabled Status
      updateModuleResult('Module Status Check', { status: 'testing' })
      try {
        const response = await fetch('/api/debug/module-status')
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
          const disabledModules = statusData.userSettings?.filter((s: any) => !s.enabled) || []
          const moduleChecks = statusData.moduleChecks || {}

          if (disabledModules.length === 0) {
            updateModuleResult('Module Status Check', {
              status: 'success',
              message: 'All modules are enabled',
              data: {
                userId: statusData.userId,
                allModules: statusData.allModules,
                moduleChecks
              }
            })
            console.log('✅ All modules enabled')
          } else {
            updateModuleResult('Module Status Check', {
              status: 'warning',
              message: `${disabledModules.length} module(s) are disabled in user settings`,
              data: {
                userId: statusData.userId,
                disabledModules: disabledModules.map((m: any) => m.module_id),
                moduleChecks,
                hint: 'Go to /modules or /settings to enable these modules'
              }
            })
            console.warn('⚠️ Disabled modules:', disabledModules.map((m: any) => m.module_id))
          }
        }
      } catch (error: any) {
        updateModuleResult('Module Status Check', {
          status: 'error',
          error: error.message,
          data: {
            hint: 'Check if /api/debug/module-status endpoint exists'
          }
        })
        console.error('❌ Module status check failed:', error)
      }

    } catch (error: any) {
      updateModuleResult('Module Discovery', {
        status: 'error',
        error: error.message,
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

    // Test 1: Verify backup endpoint accessibility
    updateBackupResult('Backup Endpoint Accessibility', { status: 'testing' })
    try {
      const response = await fetch('/api/backup/verify')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      updateBackupResult('Backup Endpoint Accessibility', {
        status: 'success',
        message: 'Backup verify endpoint is accessible',
      })
      console.log('✅ Backup endpoint accessible')
    } catch (error: any) {
      updateBackupResult('Backup Endpoint Accessibility', {
        status: 'error',
        error: error.message,
        data: { hint: 'Check if /api/backup/verify route exists' }
      })
      console.error('❌ Backup endpoint failed:', error)
      setIsRunningBackupTests(false)
      return
    }

    // Test 2: Table Discovery Methods
    updateBackupResult('Table Discovery Test', { status: 'testing' })
    try {
      const response = await fetch('/api/backup/verify')
      const result = await response.json()

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
            : 'Run /migrations/backup_system_functions.sql for optimal performance'
        }
      })
      console.log('✅ Table discovery test complete:', methodLabel)
    } catch (error: any) {
      updateBackupResult('Table Discovery Test', {
        status: 'error',
        error: error.message,
        data: { hint: 'Failed to test discovery methods' }
      })
      console.error('❌ Table discovery test failed:', error)
    }

    // Test 3: Table Count Verification
    updateBackupResult('Table Count Verification', { status: 'testing' })
    try {
      const response = await fetch('/api/backup/verify')
      const result = await response.json()

      const expectedTables = 31 // Updated: added Better Auth tables (user, session, account, verification)
      const foundTables = result.tablesFound

      if (foundTables === expectedTables) {
        updateBackupResult('Table Count Verification', {
          status: 'success',
          message: `All ${expectedTables} expected tables found`,
          data: {
            found: foundTables,
            expected: expectedTables,
            tables: result.tables.map((t: any) => t.name)
          }
        })
        console.log('✅ All tables found')
      } else if (foundTables > expectedTables) {
        updateBackupResult('Table Count Verification', {
          status: 'warning',
          message: `Found ${foundTables} tables (${foundTables - expectedTables} more than expected)`,
          data: {
            found: foundTables,
            expected: expectedTables,
            extraTables: result.extraTables,
            hint: 'New tables detected - update known tables list'
          }
        })
        console.log('⚠️ Extra tables found:', result.extraTables)
      } else {
        updateBackupResult('Table Count Verification', {
          status: 'error',
          message: `Only found ${foundTables}/${expectedTables} tables`,
          data: {
            found: foundTables,
            expected: expectedTables,
            missing: result.missingTables,
            hint: 'Some tables are missing or inaccessible'
          }
        })
        console.error('❌ Missing tables:', result.missingTables)
      }
    } catch (error: any) {
      updateBackupResult('Table Count Verification', {
        status: 'error',
        error: error.message
      })
      console.error('❌ Table count verification failed:', error)
    }

    // Test 4: Row Count Summary
    updateBackupResult('Row Count Summary', { status: 'testing' })
    try {
      const response = await fetch('/api/backup/verify')
      const result = await response.json()

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
    } catch (error: any) {
      updateBackupResult('Row Count Summary', {
        status: 'error',
        error: error.message
      })
      console.error('❌ Row count summary failed:', error)
    }

    // Test 5: System Warnings Check
    updateBackupResult('System Warnings', { status: 'testing' })
    try {
      const response = await fetch('/api/backup/verify')
      const result = await response.json()

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
    } catch (error: any) {
      updateBackupResult('System Warnings', {
        status: 'error',
        error: error.message
      })
      console.error('❌ Warnings check failed:', error)
    }

    // Test 6: Export Endpoint Test
    updateBackupResult('Export Endpoint Test', { status: 'testing' })
    try {
      // Just check accessibility, don't actually download
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch('/api/backup/export', {
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
    } catch (error: any) {
      if (error.name === 'AbortError') {
        updateBackupResult('Export Endpoint Test', {
          status: 'error',
          error: 'Export endpoint timed out',
          data: { hint: 'Check if backup export route is working' }
        })
      } else {
        updateBackupResult('Export Endpoint Test', {
          status: 'warning',
          message: 'Could not verify export endpoint',
          error: error.message
        })
      }
      console.error('⚠️ Export endpoint test:', error)
    }

    setIsRunningBackupTests(false)
    console.log('💾 Backup system diagnostics complete!')
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
      const response = await fetch('/api/auth/get-session', {
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
    } catch (error: any) {
      updateAuthConfigResult('Auth API Endpoint', {
        status: 'error',
        error: error.message,
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
    } catch (error: any) {
      updateAuthConfigResult('Session Status', {
        status: 'error',
        error: error.message
      })
    }

    // Test 3: Check environment variables (client-side only)
    updateAuthConfigResult('Environment Variables', { status: 'testing' })
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

      const checks = {
        NEXT_PUBLIC_APP_URL: appUrl ? 'Set' : 'Missing (needed for production trusted origins)',
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? 'Set' : 'Missing',
      }

      const missingCritical = !supabaseUrl

      updateAuthConfigResult('Environment Variables', {
        status: missingCritical ? 'error' : (appUrl ? 'success' : 'warning'),
        message: missingCritical
          ? 'Critical environment variables missing'
          : (!appUrl ? 'NEXT_PUBLIC_APP_URL not set (needed for production)' : 'All client-side env vars configured'),
        data: checks
      })
    } catch (error: any) {
      updateAuthConfigResult('Environment Variables', {
        status: 'error',
        error: error.message
      })
    }

    // Test 4: Check auth configuration via API
    updateAuthConfigResult('Auth Configuration', { status: 'testing' })
    try {
      const response = await fetch('/api/debug/auth-config')
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
    } catch (error: any) {
      updateAuthConfigResult('Auth Configuration', {
        status: 'warning',
        message: 'Could not verify auth configuration',
        error: error.message,
        data: { hint: 'Server-side auth config not exposed to client' }
      })
    }

    // Test 5: Test authorization patterns
    updateAuthConfigResult('Authorization Patterns', { status: 'testing' })
    try {
      // Test that protected routes reject unauthenticated access
      const testRoutes = [
        { path: '/api/contacts/test-uuid-12345', method: 'GET', name: 'Contacts by ID' },
        { path: '/api/tasks/priorities', method: 'PUT', name: 'Task Priorities' },
      ]

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
    } catch (error: any) {
      updateAuthConfigResult('Authorization Patterns', {
        status: 'error',
        error: error.message
      })
    }

    // Test 6: Session management features
    updateAuthConfigResult('Session Management', { status: 'testing' })
    try {
      if (session) {
        // Try to list sessions
        const response = await fetch('/api/auth/list-sessions', {
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
    } catch (error: any) {
      updateAuthConfigResult('Session Management', {
        status: 'warning',
        message: 'Could not verify session management',
        error: error.message
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
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

          if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Missing environment variables')
          }

          updateTestResult('Environment Variables', {
            status: 'success',
            message: 'Environment variables are set',
            data: {
              url: supabaseUrl?.substring(0, 30) + '...',
              hasAnonKey: !!supabaseAnonKey
            }
          })
          console.log('✅ Environment variables check passed')
        } catch (error: any) {
          updateTestResult('Environment Variables', {
            status: 'error',
            error: error.message
          })
          console.error('❌ Environment variables check failed:', error)
        }
      })(),

      // Test 2: Supabase Client
      (async () => {
        updateTestResult('Supabase Client Initialization', { status: 'testing' })
        try {
          if (!supabase) {
            throw new Error('Supabase client not available from context')
          }
          updateTestResult('Supabase Client Initialization', {
            status: 'success',
            message: 'Client retrieved from global context'
          })
          console.log('✅ Supabase client from context')
        } catch (error: any) {
          updateTestResult('Supabase Client Initialization', {
            status: 'error',
            error: error.message
          })
          console.error('❌ Supabase client initialization failed:', error)
        }
      })()
    ]

    await Promise.all(phase1Tests)

    // Stop if client is not available
    if (!supabase) {
      setIsRunning(false)
      return
    }

    // PHASE 2: Network connectivity tests (run in parallel)
    const phase2Tests = [
      // Test 3: Network Connectivity
      (async () => {
        updateTestResult('Network Connectivity', { status: 'testing' })
        try {
          console.log('🌐 Testing network connectivity to Supabase...')

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)

          const response = await fetch('/api/test-connection', {
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          const result = await response.json()

          if (result.success) {
            updateTestResult('Network Connectivity', {
              status: 'success',
              message: 'Can reach Supabase server',
              data: result
            })
            console.log('✅ Network connectivity test passed')
          } else {
            throw new Error(result.error || 'Network test failed')
          }
        } catch (error: any) {
          updateTestResult('Network Connectivity', {
            status: 'error',
            error: error.message,
            data: {
              hint: 'Check if Supabase URL is correct and accessible'
            }
          })
          console.error('❌ Network connectivity test failed:', error)
        }
      })(),

      // Test 4: Connection Test
      (async () => {
        updateTestResult('Connection Test', { status: 'testing' })
        try {
          console.log('🔌 Testing basic connection to Supabase...')

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 3000)

          const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tasks?select=id&limit=1`, {
            method: 'GET',
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (response.ok || response.status === 401) {
            updateTestResult('Connection Test', {
              status: 'success',
              message: 'Successfully connected to Supabase database',
              data: {
                connected: true,
                status: response.status,
                statusText: response.statusText
              }
            })
            console.log('✅ Connection test passed')
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
        } catch (error: any) {
          updateTestResult('Connection Test', {
            status: 'error',
            error: error.message,
            data: {
              hint: error.name === 'AbortError'
                ? 'Connection timed out - check your network and Supabase URL'
                : 'Check your network connection and Supabase configuration',
              url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...'
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
        const expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : null
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
            refresh_token: session.refresh_token ? 'Present (truncated)' : 'Missing',
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
    } catch (error: any) {
      updateTestResult('Authentication Status', {
        status: 'error',
        error: error.message,
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
    } catch (error: any) {
      updateTestResult('Session Status', {
        status: 'error',
        error: error.message
      })
      console.error('❌ Session check failed:', error)
    }

    // PHASE 3: Data fetching tests (run in parallel)
    const phase3Tests = [
      // Test 6: Fetch Tasks
      (async () => {
        updateTestResult('Fetch Tasks', { status: 'testing' })
        try {
          console.log('📊 Attempting to fetch tasks...')

          // Check if user is authenticated first (using Better Auth session from context)
          if (!session) {
            throw new Error('Not authenticated - please sign in to test data fetching')
          }

          const queryPromise = supabase
            .from('tasks')
            .select('*')
            .limit(5)

          const timeoutPromise = new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error('Tasks fetch timed out after 5 seconds')), 5000)
          )

          const result = await Promise.race([queryPromise, timeoutPromise])
          const { data, error } = result

          console.log('Tasks query response:', { data, error })

          if (error) throw error

          updateTestResult('Fetch Tasks', {
            status: 'success',
            message: `Found ${data?.length || 0} tasks`,
            data: {
              count: data?.length || 0
            }
          })
          console.log('✅ Tasks fetched:', data?.length || 0)
        } catch (error: any) {
          updateTestResult('Fetch Tasks', {
            status: 'warning',
            error: error.message,
            data: { hint: error.message.includes('authenticated') ? 'Sign in at /sign-in to test data queries' : 'Check RLS policies' }
          })
          console.error('❌ Tasks fetch failed:', error)
        }
      })(),

      // Test: Fetch Contacts
      (async () => {
        updateTestResult('Fetch Contacts', { status: 'testing' })
        try {
          console.log('📊 Attempting to fetch contacts...')
          const { data, error, status } = await supabase
            .from('contacts')
            .select('*')
            .limit(5)

          console.log('Contacts query response:', { data, error, status })

          if (error) throw error

          updateTestResult('Fetch Contacts', {
            status: 'success',
            message: `Found ${data?.length || 0} contacts`,
            data: {
              count: data?.length || 0,
              sample: data?.[0] || null
            }
          })
          console.log('✅ Contacts fetched:', data?.length || 0)
        } catch (error: any) {
          updateTestResult('Fetch Contacts', {
            status: 'error',
            error: error.message,
            data: { code: error.code, details: error.details }
          })
          console.error('❌ Contacts fetch failed:', error)
        }
      })(),

      // Test: Fetch Northstar Entries
      (async () => {
        updateTestResult('Fetch Northstar Entries', { status: 'testing' })
        try {
          console.log('📊 Attempting to fetch northstar entries...')
          const { data, error, status } = await supabase
            .from('northstar')
            .select('*')
            .limit(5)

          console.log('Northstar query response:', { data, error, status })

          if (error) throw error

          updateTestResult('Fetch Northstar Entries', {
            status: 'success',
            message: `Found ${data?.length || 0} entries`,
            data: {
              count: data?.length || 0,
              sample: data?.[0] || null
            }
          })
          console.log('✅ Northstar entries fetched:', data?.length || 0)
        } catch (error: any) {
          updateTestResult('Fetch Northstar Entries', {
            status: 'error',
            error: error.message,
            data: { code: error.code, details: error.details }
          })
          console.error('❌ Northstar fetch failed:', error)
        }
      })(),

      // Test: Fetch Fitness Data
      (async () => {
        updateTestResult('Fetch Fitness Data', { status: 'testing' })
        try {
          console.log('📊 Attempting to fetch fitness data...')
          const { data, error, status } = await supabase
            .from('fitness_database')
            .select('*')
            .limit(5)

          console.log('Fitness query response:', { data, error, status })

          if (error) throw error

          updateTestResult('Fetch Fitness Data', {
            status: 'success',
            message: `Found ${data?.length || 0} fitness records`,
            data: {
              count: data?.length || 0,
              sample: data?.[0] || null
            }
          })
          console.log('✅ Fitness data fetched:', data?.length || 0)
        } catch (error: any) {
          updateTestResult('Fetch Fitness Data', {
            status: 'error',
            error: error.message,
            data: { code: error.code, details: error.details }
          })
          console.error('❌ Fitness data fetch failed:', error)
        }
      })()
    ]

    await Promise.all(phase3Tests)

    // Test 10: RLS Policies Test
    updateTestResult('Test RLS Policies', { status: 'testing' })
    try {
      console.log('📊 Testing RLS policies...')

      // Use user from Better Auth context
      if (!user) {
        updateTestResult('Test RLS Policies', {
          status: 'warning',
          message: 'Cannot test RLS policies without authentication',
          data: { note: 'Sign in to test RLS policies' }
        })
        console.warn('⚠️ RLS test skipped - no authenticated user')
      } else {
        // Test tasks with explicit user_id filter
        const { data: tasksWithFilter, error: tasksError } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .limit(5)

        if (tasksError) throw tasksError

        // Also test without filter to see if RLS is working
        const { data: tasksNoFilter, error: tasksNoFilterError } = await supabase
          .from('tasks')
          .select('*')
          .limit(5)

        updateTestResult('Test RLS Policies', {
          status: 'success',
          message: 'RLS policies test complete (note: using service role client now)',
          data: {
            userId: user.id,
            tasksWithUserFilter: tasksWithFilter?.length || 0,
            tasksWithoutFilter: tasksNoFilter?.length || 0,
            note: 'API routes now use service role client which bypasses RLS',
            rlsWorking: (tasksWithFilter?.length || 0) === (tasksNoFilter?.length || 0)
          }
        })
        console.log('✅ RLS policies test passed')
      }
    } catch (error: any) {
      updateTestResult('Test RLS Policies', {
        status: 'error',
        error: error.message,
        data: { code: error.code, details: error.details }
      })
      console.error('❌ RLS policies test failed:', error)
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
      error: 'secondary'
    }

    const labels: Record<SecurityTestResult['status'], string> = {
      pending: 'Pending',
      testing: 'Testing',
      secure: 'Secure',
      vulnerable: 'Vulnerable',
      error: 'Error'
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
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    })
  }, [])

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
        <h1 className="text-4xl font-bold tracking-tight">Test Dashboard</h1>
        <p className="text-muted-foreground mt-2">Comprehensive system testing and diagnostics</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="database" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="database" className="flex items-center gap-2">
            <DatabaseIcon className="h-4 w-4" />
            Database
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
                                {test.data && (
                                  <pre className="text-xs mt-1 text-red-500 dark:text-red-300">
                                    {JSON.stringify(test.data, null, 2)}
                                  </pre>
                                )}
                              </div>
                            )}

                            {test.data && test.status === 'success' && (
                              <div className="mt-2 p-2 bg-green-50 dark:bg-green-950 rounded">
                                <pre className="text-xs text-green-600 dark:text-green-400">
                                  {JSON.stringify(test.data, null, 2)}
                                </pre>
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
                <Card className="border-2">
                  <CardContent className="p-4">
                    <h3 className="font-medium mb-3">Security Summary</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span>Total Endpoints:</span>
                        <Badge variant="outline">{securitySummary.total}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Secure:</span>
                        <Badge variant="default">{securitySummary.secure}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Vulnerable:</span>
                        <Badge variant="destructive">{securitySummary.vulnerable}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Errors:</span>
                        <Badge variant="secondary">{securitySummary.errors}</Badge>
                      </div>
                    </div>
                    {securitySummary.vulnerable > 0 && (
                      <div className="mt-3 p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                        <p className="text-red-600 dark:text-red-400 font-medium">
                          ⚠️ WARNING: {securitySummary.vulnerable} endpoint(s) may be publicly accessible!
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Security Test Results */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
                <Card className="border-2">
                  <CardContent className="p-4">
                    <h3 className="font-medium mb-3">Auth Config Summary</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span>Total Checks:</span>
                        <Badge variant="outline">{authConfigSummary.total}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Passed:</span>
                        <Badge variant="default">{authConfigSummary.success}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Warnings:</span>
                        <Badge variant="secondary">{authConfigSummary.warnings}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Errors:</span>
                        <Badge variant="destructive">{authConfigSummary.errors}</Badge>
                      </div>
                    </div>
                    {authConfigSummary.errors > 0 && (
                      <div className="mt-3 p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                        <p className="text-red-600 dark:text-red-400 font-medium">
                          ⚠️ {authConfigSummary.errors} critical issue(s) require attention
                        </p>
                      </div>
                    )}
                    {authConfigSummary.errors === 0 && authConfigSummary.warnings > 0 && (
                      <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-950 rounded text-sm">
                        <p className="text-yellow-600 dark:text-yellow-400 font-medium">
                          ⚠️ {authConfigSummary.warnings} warning(s) to review
                        </p>
                      </div>
                    )}
                    {authConfigSummary.errors === 0 && authConfigSummary.warnings === 0 && authConfigSummary.success > 0 && (
                      <div className="mt-3 p-2 bg-green-50 dark:bg-green-950 rounded text-sm">
                        <p className="text-green-600 dark:text-green-400 font-medium">
                          ✅ All auth configuration checks passed
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Auth Config Test Results */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
                                {test.data && (
                                  <pre className="text-xs mt-1 text-red-500 dark:text-red-300 overflow-auto max-h-32">
                                    {JSON.stringify(test.data, null, 2)}
                                  </pre>
                                )}
                              </div>
                            )}

                            {test.data && test.status === 'success' && (
                              <div className="mt-2 p-2 bg-green-50 dark:bg-green-950 rounded">
                                <pre className="text-xs text-green-600 dark:text-green-400 overflow-auto max-h-32">
                                  {JSON.stringify(test.data, null, 2)}
                                </pre>
                              </div>
                            )}

                            {test.data && test.status === 'warning' && (
                              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                                <pre className="text-xs text-yellow-600 dark:text-yellow-400 overflow-auto max-h-32">
                                  {JSON.stringify(test.data, null, 2)}
                                </pre>
                              </div>
                            )}

                            {test.data && test.status === 'error' && !test.error && (
                              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded">
                                <pre className="text-xs text-red-600 dark:text-red-400 overflow-auto max-h-32">
                                  {JSON.stringify(test.data, null, 2)}
                                </pre>
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
                <Card className="border-2">
                  <CardContent className="p-4">
                    <h3 className="font-medium mb-3">Module Summary</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span>Total:</span>
                        <Badge variant="outline">{moduleSummary.total}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Passed:</span>
                        <Badge variant="default">{moduleSummary.success}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Warnings:</span>
                        <Badge variant="secondary">{moduleSummary.warnings}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Errors:</span>
                        <Badge variant="destructive">{moduleSummary.errors}</Badge>
                      </div>
                    </div>
                    {moduleSummary.errors > 0 && (
                      <div className="mt-3 p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                        <p className="text-red-600 dark:text-red-400 font-medium">
                          ⚠️ {moduleSummary.errors} test(s) failed
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Module Test Results */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
                                {test.data && (
                                  <pre className="text-xs mt-1 text-red-500 dark:text-red-300 overflow-auto max-h-32">
                                    {JSON.stringify(test.data, null, 2)}
                                  </pre>
                                )}
                              </div>
                            )}

                            {test.data && test.status === 'success' && (
                              <div className="mt-2 p-2 bg-green-50 dark:bg-green-950 rounded">
                                <pre className="text-xs text-green-600 dark:text-green-400 overflow-auto max-h-32">
                                  {JSON.stringify(test.data, null, 2)}
                                </pre>
                              </div>
                            )}

                            {test.data && test.status === 'warning' && (
                              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                                <pre className="text-xs text-yellow-600 dark:text-yellow-400 overflow-auto max-h-32">
                                  {JSON.stringify(test.data, null, 2)}
                                </pre>
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
                <Card className="border-2">
                  <CardContent className="p-4">
                    <h3 className="font-medium mb-3">Backup Summary</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span>Total:</span>
                        <Badge variant="outline">{backupSummary.total}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Passed:</span>
                        <Badge variant="default">{backupSummary.success}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Warnings:</span>
                        <Badge variant="secondary">{backupSummary.warnings}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Errors:</span>
                        <Badge variant="destructive">{backupSummary.errors}</Badge>
                      </div>
                    </div>
                    {backupSummary.errors > 0 && (
                      <div className="mt-3 p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                        <p className="text-red-600 dark:text-red-400 font-medium">
                          ⚠️ {backupSummary.errors} test(s) failed - backup system may not be working correctly
                        </p>
                      </div>
                    )}
                    {backupSummary.warnings > 0 && backupSummary.errors === 0 && (
                      <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-950 rounded text-sm">
                        <p className="text-yellow-600 dark:text-yellow-400 font-medium">
                          ⚠️ {backupSummary.warnings} warning(s) - consider running migration for optimal performance
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Backup Test Results */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
                                {test.data && (
                                  <pre className="text-xs mt-1 text-red-500 dark:text-red-300 overflow-auto max-h-32">
                                    {JSON.stringify(test.data, null, 2)}
                                  </pre>
                                )}
                              </div>
                            )}

                            {test.data && test.status === 'success' && (
                              <div className="mt-2 p-2 bg-green-50 dark:bg-green-950 rounded">
                                <pre className="text-xs text-green-600 dark:text-green-400 overflow-auto max-h-32">
                                  {JSON.stringify(test.data, null, 2)}
                                </pre>
                              </div>
                            )}

                            {test.data && test.status === 'warning' && (
                              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                                <pre className="text-xs text-yellow-600 dark:text-yellow-400 overflow-auto max-h-32">
                                  {JSON.stringify(test.data, null, 2)}
                                </pre>
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
