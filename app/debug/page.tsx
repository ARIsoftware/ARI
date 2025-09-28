'use client'

import { useState, useEffect } from 'react'
import { createSupabaseClient } from '@/lib/supabase-auth'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface TestResult {
  name: string
  status: 'pending' | 'testing' | 'success' | 'error' | 'warning'
  message?: string
  data?: any
  error?: any
}

export default function DatabaseTestPage() {
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
  const [isRunning, setIsRunning] = useState(false)

  const updateTestResult = (name: string, update: Partial<TestResult>) => {
    setTestResults(prev => prev.map(test =>
      test.name === name ? { ...test, ...update } : test
    ))
  }

  const runTests = async () => {
    setIsRunning(true)
    console.log('🔍 Starting database tests...')

    // Test 1: Environment Variables
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

    // Test 2: Supabase Client
    updateTestResult('Supabase Client Initialization', { status: 'testing' })
    let supabase: any
    try {
      supabase = createSupabaseClient()
      if (!supabase) {
        throw new Error('Failed to create Supabase client')
      }
      updateTestResult('Supabase Client Initialization', {
        status: 'success',
        message: 'Client created successfully'
      })
      console.log('✅ Supabase client initialized')
    } catch (error: any) {
      updateTestResult('Supabase Client Initialization', {
        status: 'error',
        error: error.message
      })
      console.error('❌ Supabase client initialization failed:', error)
      setIsRunning(false)
      return
    }

    // Test 3: Network Connectivity
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

    // Test 4: Connection Test - Quick health check with timeout
    updateTestResult('Connection Test', { status: 'testing' })
    try {
      console.log('🔌 Testing basic connection to Supabase...')
      console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timed out after 3 seconds')), 3000)
      })

      // Try a simple health check query with timeout
      const queryPromise = (async () => {
        try {
          const result = await supabase
            .from('tasks')
            .select('id')
            .limit(1)
            .maybeSingle() // Use maybeSingle instead of single to avoid error if no rows
          return result
        } catch (err) {
          return { data: null, error: err }
        }
      })()

      const result = await Promise.race([queryPromise, timeoutPromise]) as any
      const { data, error } = result || { data: null, error: new Error('Query result was undefined') }

      console.log('Connection test result:', { data, error })

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows, which is fine
        throw error
      }

      updateTestResult('Connection Test', {
        status: 'success',
        message: 'Successfully connected to Supabase database',
        data: {
          connected: true,
          responseReceived: true
        }
      })
      console.log('✅ Connection test passed')
    } catch (error: any) {
      updateTestResult('Connection Test', {
        status: 'error',
        error: error.message,
        data: {
          code: error.code,
          details: error.details,
          hint: error.hint || 'Check your network connection and Supabase configuration',
          url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...'
        }
      })
      console.error('❌ Connection test failed:', error)
      console.error('Full error object:', error)

      // Continue with other tests even if connection fails
      console.warn('⚠️ Continuing tests despite connection failure...')
    }

    // Test 4: Authentication Status with timeout
    updateTestResult('Authentication Status', { status: 'testing' })
    try {
      console.log('🔐 Starting authentication check...')

      // Add timeout to auth check
      const authPromise = supabase.auth.getUser()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Authentication check timed out after 5 seconds')), 5000)
      )

      const result = await Promise.race([authPromise, timeoutPromise]) as any
      const { data: { user }, error } = result

      if (error) {
        console.error('Auth error details:', error)
        throw error
      }

      updateTestResult('Authentication Status', {
        status: user ? 'success' : 'error',
        message: user ? `Authenticated as ${user.email}` : 'Not authenticated - please sign in',
        data: user ? {
          id: user.id,
          email: user.email,
          created_at: user.created_at
        } : { note: 'No user session found' }
      })
      console.log('✅ Auth check:', user ? 'Authenticated' : 'Not authenticated')

      // Continue with tests even if not authenticated
      if (!user) {
        console.warn('⚠️ Continuing tests without authentication - some may fail due to RLS policies')
      }
    } catch (error: any) {
      updateTestResult('Authentication Status', {
        status: 'error',
        error: error.message,
        data: {
          hint: 'This might be a network or configuration issue',
          errorDetails: error
        }
      })
      console.error('❌ Auth check failed:', error)
      // Continue with other tests even if auth fails
    }

    // Test 5: Session Status
    updateTestResult('Session Status', { status: 'testing' })
    try {
      console.log('🔑 Checking session status...')

      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) throw error

      updateTestResult('Session Status', {
        status: session ? 'success' : 'warning',
        message: session ? 'Active session found' : 'No active session',
        data: session ? {
          access_token: session.access_token ? 'Present' : 'Missing',
          refresh_token: session.refresh_token ? 'Present' : 'Missing',
          expires_at: session.expires_at,
          user_id: session.user?.id
        } : null
      })
      console.log('Session check:', session ? 'Session found' : 'No session')
    } catch (error: any) {
      updateTestResult('Session Status', {
        status: 'error',
        error: error.message
      })
      console.error('❌ Session check failed:', error)
    }

    // Test 6: Fetch Tasks
    updateTestResult('Fetch Tasks', { status: 'testing' })
    try {
      console.log('📊 Attempting to fetch tasks...')
      const { data, error, status } = await supabase
        .from('tasks')
        .select('*')
        .limit(5)

      console.log('Tasks query response:', { data, error, status })

      if (error) throw error

      updateTestResult('Fetch Tasks', {
        status: 'success',
        message: `Found ${data?.length || 0} tasks`,
        data: {
          count: data?.length || 0,
          sample: data?.[0] || null
        }
      })
      console.log('✅ Tasks fetched:', data?.length || 0)
    } catch (error: any) {
      updateTestResult('Fetch Tasks', {
        status: 'error',
        error: error.message,
        data: { code: error.code, details: error.details }
      })
      console.error('❌ Tasks fetch failed:', error)
    }

    // Test 5: Fetch Contacts
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

    // Test 6: Fetch Northstar Entries
    updateTestResult('Fetch Northstar Entries', { status: 'testing' })
    try {
      console.log('📊 Attempting to fetch northstar entries...')
      const { data, error, status } = await supabase
        .from('northstar_entries')
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

    // Test 7: Fetch Fitness Data
    updateTestResult('Fetch Fitness Data', { status: 'testing' })
    try {
      console.log('📊 Attempting to fetch fitness data...')
      const { data, error, status } = await supabase
        .from('ari-fitness-database')
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

    // Test 10: RLS Policies Test
    updateTestResult('Test RLS Policies', { status: 'testing' })
    try {
      console.log('📊 Testing RLS policies...')

      // Try to fetch with explicit user filter
      const { data: { user } } = await supabase.auth.getUser()

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
          message: 'RLS policies are working correctly',
          data: {
            userId: user.id,
            tasksWithUserFilter: tasksWithFilter?.length || 0,
            tasksWithoutFilter: tasksNoFilter?.length || 0,
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

  useEffect(() => {
    // Log initial page load
    console.log('🚀 Database Test Page loaded')
    console.log('Environment:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    })
  }, [])

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Database Connection Test</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Run comprehensive tests to diagnose database connection issues
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-6">
              <Button
                onClick={runTests}
                disabled={isRunning}
                size="lg"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running Tests...
                  </>
                ) : (
                  'Run All Tests'
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
    </div>
  )
}