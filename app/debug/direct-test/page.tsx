'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function DirectTestPage() {
  const [results, setResults] = useState<any>({})
  const [loading, setLoading] = useState(false)

  const runDirectTests = async () => {
    setLoading(true)
    const testResults: any = {}

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('Starting direct API tests...')
    console.log('Supabase URL:', supabaseUrl)

    // Test 1: Direct REST API call to Supabase
    try {
      console.log('Test 1: Direct REST API call...')
      const response = await fetch(`${supabaseUrl}/rest/v1/tasks?limit=1`, {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey!,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      })

      testResults.directApi = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      }

      if (response.ok) {
        const data = await response.json()
        testResults.directApi.data = data
      } else {
        const text = await response.text()
        testResults.directApi.error = text
      }
    } catch (error: any) {
      console.error('Direct API error:', error)
      testResults.directApi = {
        error: error.message,
        type: error.name
      }
    }

    // Test 2: Auth endpoint
    try {
      console.log('Test 2: Auth endpoint...')
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey!,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        }
      })

      testResults.authEndpoint = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      }

      const text = await response.text()
      try {
        testResults.authEndpoint.data = JSON.parse(text)
      } catch {
        testResults.authEndpoint.text = text
      }
    } catch (error: any) {
      console.error('Auth endpoint error:', error)
      testResults.authEndpoint = {
        error: error.message,
        type: error.name
      }
    }

    // Test 3: Simple fetch with timeout
    try {
      console.log('Test 3: Fetch with timeout...')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey!,
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      testResults.fetchWithTimeout = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      }
    } catch (error: any) {
      console.error('Fetch with timeout error:', error)
      testResults.fetchWithTimeout = {
        error: error.message,
        aborted: error.name === 'AbortError'
      }
    }

    // Test 4: Check CORS headers
    try {
      console.log('Test 4: OPTIONS request for CORS...')
      const response = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
        method: 'OPTIONS',
        headers: {
          'Origin': window.location.origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'apikey,authorization'
        }
      })

      testResults.cors = {
        status: response.status,
        headers: {
          'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
          'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
          'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
        }
      }
    } catch (error: any) {
      console.error('CORS check error:', error)
      testResults.cors = {
        error: error.message
      }
    }

    console.log('All tests complete:', testResults)
    setResults(testResults)
    setLoading(false)
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Direct API Test</CardTitle>
          <p className="text-sm text-muted-foreground">
            Test Supabase connection using direct REST API calls
          </p>
        </CardHeader>
        <CardContent>
          <Button onClick={runDirectTests} disabled={loading}>
            {loading ? 'Running Tests...' : 'Run Direct API Tests'}
          </Button>

          {Object.keys(results).length > 0 && (
            <div className="mt-6 space-y-4">
              {Object.entries(results).map(([key, value]) => (
                <Card key={key} className="border">
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-2">{key}</h3>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}