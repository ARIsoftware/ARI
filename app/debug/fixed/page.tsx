'use client'

import { useState } from 'react'
import { createSupabaseClientSimple, createSupabaseClientMinimal } from '@/lib/supabase-client-fixed'
import { createSupabaseClient } from '@/lib/supabase-auth'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function FixedTestPage() {
  const [results, setResults] = useState<any>({})
  const [loading, setLoading] = useState(false)

  const runTests = async () => {
    setLoading(true)
    const testResults: any = {}

    // Test 1: Original client
    try {
      console.log('Testing original client...')
      const client = createSupabaseClient()

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 2000)
      )

      const queryPromise = client.from('tasks').select('count').limit(1)
      const result = await Promise.race([queryPromise, timeoutPromise]) as any

      testResults.original = { success: true, data: result }
    } catch (error: any) {
      testResults.original = { success: false, error: error.message }
    }

    // Test 2: Simple fixed client
    try {
      console.log('Testing simple fixed client...')
      const client = createSupabaseClientSimple()

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 2000)
      )

      const queryPromise = client.from('tasks').select('count').limit(1)
      const result = await Promise.race([queryPromise, timeoutPromise]) as any

      testResults.simpleFixed = { success: true, data: result }
    } catch (error: any) {
      testResults.simpleFixed = { success: false, error: error.message }
    }

    // Test 3: Minimal fixed client
    try {
      console.log('Testing minimal fixed client...')
      const client = createSupabaseClientMinimal()

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 2000)
      )

      const queryPromise = client.from('tasks').select('count').limit(1)
      const result = await Promise.race([queryPromise, timeoutPromise]) as any

      testResults.minimalFixed = { success: true, data: result }
    } catch (error: any) {
      testResults.minimalFixed = { success: false, error: error.message }
    }

    // Test 4: Direct fetch (for comparison)
    try {
      console.log('Testing direct fetch...')
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tasks?select=count&limit=1`,
        {
          headers: {
            'apikey': (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          }
        }
      )
      const data = await response.json()
      testResults.directFetch = { success: true, data, status: response.status }
    } catch (error: any) {
      testResults.directFetch = { success: false, error: error.message }
    }

    setResults(testResults)
    setLoading(false)
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Fixed Client Test</CardTitle>
          <p className="text-sm text-muted-foreground">
            Testing different Supabase client configurations
          </p>
        </CardHeader>
        <CardContent>
          <Button onClick={runTests} disabled={loading} className="mb-4">
            {loading ? 'Running Tests...' : 'Run Tests'}
          </Button>

          {Object.keys(results).length > 0 && (
            <div className="space-y-4">
              {Object.entries(results).map(([key, value]: [string, any]) => (
                <Card key={key} className={`border ${value.success ? 'border-green-500' : 'border-red-500'}`}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-2">
                      {key} - {value.success ? '✅ Success' : '❌ Failed'}
                    </h3>
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