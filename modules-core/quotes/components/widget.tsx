/**
 * Quotes Module - Dashboard Widget
 *
 * This widget appears on the main dashboard when the module is enabled.
 * It displays quote statistics and a preview of a random quote.
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
import { useSupabase } from '@/components/providers'
import { Quote, Loader2, AlertCircle } from 'lucide-react'
import type { Quote as QuoteType } from '../types'

interface WidgetStats {
  quoteCount: number
  randomQuote?: QuoteType
}

/**
 * QuotesWidget Component
 *
 * Exported as a named export (not default) because it's imported
 * by the dashboard via dynamic import.
 */
export function QuotesWidget() {
  const { session } = useSupabase()
  const [stats, setStats] = useState<WidgetStats>({ quoteCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!session?.access_token) return

    loadStats()
  }, [session])

  const loadStats = async () => {
    try {
      setLoading(true)
      setError(false)

      // Fetch data from module API
      const response = await fetch('/api/modules/quotes/quotes', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load quotes')
      }

      const quotes: QuoteType[] = await response.json()

      // Calculate stats
      const widgetStats: WidgetStats = {
        quoteCount: quotes.length,
        randomQuote: quotes.length > 0 ? quotes[Math.floor(Math.random() * quotes.length)] : undefined
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
          <CardTitle className="text-sm font-medium">Quotes</CardTitle>
          <Quote className="h-4 w-4 text-muted-foreground" />
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
          <CardTitle className="text-sm font-medium">Quotes</CardTitle>
          <AlertCircle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-xs text-red-600">
            Failed to load quotes
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
        <CardTitle className="text-sm font-medium">Quotes</CardTitle>
        <Quote className="h-4 w-4 text-[#aa2020]" />
      </CardHeader>
      <CardContent>
        {/* Main metric */}
        <div className="text-2xl font-medium">{stats.quoteCount}</div>
        <p className="text-xs text-muted-foreground">
          {stats.quoteCount === 1 ? 'quote' : 'quotes'} saved
        </p>

        {/* Random quote preview */}
        {stats.randomQuote ? (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1">Daily inspiration:</p>
            <p className="text-sm font-medium line-clamp-3 italic">
              "{stats.randomQuote.quote}"
            </p>
            {stats.randomQuote.author && (
              <p className="text-xs text-muted-foreground mt-1">
                — {stats.randomQuote.author}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              No quotes yet. Add your first inspirational quote!
            </p>
          </div>
        )}

        {/* Action button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 text-xs"
          onClick={() => window.location.href = '/quotes'}
        >
          <Quote className="w-3 h-3 mr-1" />
          View All Quotes
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * DEVELOPER NOTES:
 *
 * 1. Widget Performance:
 *    - Lightweight widget showing quote count
 *    - Random quote selection for variety
 *    - No heavy computations
 *
 * 2. Error Handling:
 *    - Shows error states with retry
 *    - Gracefully handles empty states
 *    - Logs errors for debugging
 *
 * 3. Design Patterns:
 *    - Follows ARI's card design
 *    - Uses Shadcn/ui components
 *    - Consistent spacing and styling
 *    - Loading and error states
 *
 * 4. Integration:
 *    - Client component ('use client')
 *    - Named export (export function QuotesWidget)
 *    - Registered in module.json
 *    - Dynamically imported by dashboard
 *
 * 5. Data Fetching:
 *    - Authenticated API calls
 *    - Handles loading and error states
 *    - Random quote selection for inspiration
 */
