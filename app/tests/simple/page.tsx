'use client'

import { useState, useEffect } from 'react'
import { createSupabaseClient } from '@/lib/supabase-auth'

export default function SimpleTestPage() {
  const [status, setStatus] = useState('Testing...')
  const [details, setDetails] = useState<any>({})

  useEffect(() => {
    const runTest = async () => {
      const logs: string[] = []

      try {
        // Log environment
        logs.push(`URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
        logs.push(`Has Key: ${!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`)

        // Create client
        logs.push('Creating Supabase client...')
        const supabase = createSupabaseClient()
        logs.push('Client created')

        // Try a direct REST call first
        logs.push('Testing direct REST API...')
        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          }
        })
        logs.push(`REST API response: ${response.status} ${response.statusText}`)

        // Now try the SDK
        logs.push('Testing SDK query...')

        // Set a timeout for the SDK call
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SDK timeout after 5s')), 5000)
        )

        const queryPromise = supabase
          .from('tasks')
          .select('count')
          .limit(1)

        const result = await Promise.race([queryPromise, timeoutPromise]) as any

        logs.push(`SDK result: ${JSON.stringify(result)}`)

        setStatus('Test Complete')
        setDetails({ logs, result })

      } catch (error: any) {
        logs.push(`Error: ${error.message}`)
        setStatus('Test Failed')
        setDetails({ logs, error: error.message })
      }
    }

    runTest()
  }, [])

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Simple Supabase Test</h1>
      <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded">
        <p className="font-semibold mb-2">Status: {status}</p>
        {details.logs && (
          <div className="space-y-1">
            <p className="font-semibold">Logs:</p>
            {details.logs.map((log: string, i: number) => (
              <p key={i} className="text-sm font-mono">{log}</p>
            ))}
          </div>
        )}
        {details.error && (
          <p className="text-red-500 mt-2">Error: {details.error}</p>
        )}
        {details.result && (
          <pre className="mt-2 text-xs">
            {JSON.stringify(details.result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}