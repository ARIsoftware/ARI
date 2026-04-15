'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface TestResult {
  name: string
  status: 'pending' | 'testing' | 'success' | 'error'
  message?: string
  latencyMs?: number
}

export default function SimpleTestPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(false)

  const update = (name: string, patch: Partial<TestResult>) => {
    setResults(prev => prev.map(r => r.name === name ? { ...r, ...patch } : r))
  }

  const runTests = async () => {
    setLoading(true)
    const tests: TestResult[] = [
      { name: 'Database Connection (PG Pool)', status: 'pending' },
      { name: 'Authentication', status: 'pending' },
      { name: 'Module Settings (Drizzle)', status: 'pending' },
    ]
    setResults(tests)

    // Test 1: Database health via PG pool
    update('Database Connection (PG Pool)', { status: 'testing' })
    try {
      const start = performance.now()
      const res = await fetch('/api/health')
      const latencyMs = Math.round(performance.now() - start)
      const data = await res.json()
      if (res.ok && data.checks?.database?.status === 'ok') {
        update('Database Connection (PG Pool)', { status: 'success', message: `Connected (${latencyMs}ms)`, latencyMs })
      } else {
        update('Database Connection (PG Pool)', { status: 'error', message: data.checks?.database?.message || `HTTP ${res.status}` })
      }
    } catch (err: any) {
      update('Database Connection (PG Pool)', { status: 'error', message: err.message })
    }

    // Test 2: Auth + Drizzle withRLS (user-preferences requires both)
    update('Authentication', { status: 'testing' })
    try {
      const start = performance.now()
      const res = await fetch('/api/user-preferences')
      const latencyMs = Math.round(performance.now() - start)
      if (res.status === 401) {
        update('Authentication', { status: 'error', message: 'Not authenticated' })
      } else if (res.ok) {
        update('Authentication', { status: 'success', message: `Session valid (${latencyMs}ms)`, latencyMs })
      } else {
        update('Authentication', { status: 'error', message: `HTTP ${res.status}` })
      }
    } catch (err: any) {
      update('Authentication', { status: 'error', message: err.message })
    }

    // Test 3: Module settings read (Drizzle withRLS)
    update('Module Settings (Drizzle)', { status: 'testing' })
    try {
      const start = performance.now()
      const res = await fetch('/api/modules/all')
      const latencyMs = Math.round(performance.now() - start)
      if (res.ok) {
        const data = await res.json()
        update('Module Settings (Drizzle)', { status: 'success', message: `${data.count} modules loaded (${latencyMs}ms)`, latencyMs })
      } else {
        update('Module Settings (Drizzle)', { status: 'error', message: `HTTP ${res.status}` })
      }
    } catch (err: any) {
      update('Module Settings (Drizzle)', { status: 'error', message: err.message })
    }

    setLoading(false)
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Quick DB Health Check</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tests the actual database path (Drizzle ORM via PG pool) used by the application.
          </p>
        </CardHeader>
        <CardContent>
          <Button onClick={runTests} disabled={loading} className="mb-4">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</> : 'Run Tests'}
          </Button>

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.name} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                  {r.status === 'testing' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {r.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {r.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                  {r.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                  <span className="font-medium text-sm">{r.name}</span>
                  {r.message && (
                    <span className={`text-xs ml-auto ${r.status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {r.message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
