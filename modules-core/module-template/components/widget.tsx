/**
 * Module Template Module - Dashboard Widget
 *
 * This widget appears on the main dashboard when the module is enabled.
 * It demonstrates:
 * - Client component usage ('use client')
 * - API calls with cookie-based auth (Better Auth)
 * - Loading states
 * - Error handling
 * - ARI card design patterns
 *
 * IMPORTANT: Dashboard widgets MUST be client components.
 *
 * Integration: This widget is registered in module.json under
 * "dashboard.widgetComponents": ["./components/widget.tsx"]
 */

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Package, Loader2, AlertCircle } from 'lucide-react'

interface WidgetStats {
  entryCount: number
  lastEntryMessage?: string
  lastEntryDate?: string
}

/**
 * ModuleTemplateWidget Component
 *
 * Exported as a named export (not default) because it's imported
 * by the dashboard via dynamic import.
 */
export function ModuleTemplateWidget() {
  const [stats, setStats] = useState<WidgetStats>({ entryCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setLoading(true)
      setError(false)

      // Auth is handled via cookies - no need to pass Authorization header
      const response = await fetch('/api/modules/module-template/data')

      if (!response.ok) {
        throw new Error('Failed to load stats')
      }

      const data = await response.json()
      const entries = data.entries || []

      // Calculate stats
      const widgetStats: WidgetStats = {
        entryCount: entries.length,
        lastEntryMessage: entries[0]?.message,
        lastEntryDate: entries[0]?.created_at
      }

      setStats(widgetStats)
    } catch (err) {
      console.error('Widget error:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Module Template</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Module Template</CardTitle>
          <AlertCircle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-xs text-red-600">
            Failed to load data
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadStats}
            className="w-full mt-2 text-xs"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Success state
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Module Template</CardTitle>
        <Package className="h-4 w-4 text-blue-600" />
      </CardHeader>
      <CardContent>
        {/* Main metric */}
        <div className="text-2xl font-medium">{stats.entryCount}</div>
        <p className="text-xs text-muted-foreground">
          {stats.entryCount === 1 ? 'entry' : 'entries'} created
        </p>

        {/* Last entry preview */}
        {stats.lastEntryMessage && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1">Latest entry:</p>
            <p className="text-sm font-medium line-clamp-2">
              {stats.lastEntryMessage}
            </p>
            {stats.lastEntryDate && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(stats.lastEntryDate).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Action button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 text-xs"
          onClick={() => window.location.href = '/module-template'}
        >
          <Package className="w-3 h-3 mr-1" />
          View Module
        </Button>
      </CardContent>
    </Card>
  )
}