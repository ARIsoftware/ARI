/**
 * Module Template Module - Dashboard Widget
 *
 * This widget appears on the main dashboard when the module is enabled.
 * It demonstrates:
 * - Client component usage ('use client')
 * - TanStack Query for cached, shared data fetching
 * - Cookie-based auth (Better Auth) via the underlying hook
 * - Loading and error states
 * - ARI card design patterns
 *
 * IMPORTANT: Dashboard widgets MUST be client components.
 *
 * Integration: This widget is registered in module.json under
 * "dashboard.widgetComponents": ["./components/widget.tsx"]
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Package, Loader2, AlertCircle } from 'lucide-react'
import { useModuleTemplateEntries } from '../hooks/use-module-template'

/**
 * ModuleTemplateWidget Component
 *
 * Exported as a named export (not default) because it's imported
 * by the dashboard via dynamic import.
 *
 * Uses the shared `useModuleTemplateEntries` hook so this widget reads
 * from the same TanStack Query cache as the main page and any other
 * consumer — no duplicate network request, and mutations elsewhere
 * update the widget automatically.
 */
export function ModuleTemplateWidget() {
  const { data: entries = [], isLoading, isError, refetch } = useModuleTemplateEntries()

  const entryCount = entries.length
  const lastEntry = entries[0]

  // Loading state
  if (isLoading) {
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
  if (isError) {
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
            onClick={() => refetch()}
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
        <div className="text-2xl font-medium">{entryCount}</div>
        <p className="text-xs text-muted-foreground">
          {entryCount === 1 ? 'entry' : 'entries'} created
        </p>

        {/* Last entry preview */}
        {lastEntry?.message && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1">Latest entry:</p>
            <p className="text-sm font-medium line-clamp-2">
              {lastEntry.message}
            </p>
            {lastEntry.created_at && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(lastEntry.created_at).toLocaleDateString()}
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

/**
 * DEVELOPER NOTES:
 *
 * 1. Data Fetching (TanStack Query):
 *    - Import the module's shared query hook (e.g. `useModuleTemplateEntries`)
 *      from `../hooks/use-module-template` rather than calling `fetch` directly.
 *    - Widgets, main pages, and settings panels that share a query key share a
 *      single request and a single cache entry — no duplicate network calls.
 *    - Mutations elsewhere (create / update / delete) update the widget
 *      automatically via the hook's optimistic updates + cache invalidation.
 *    - Refetch on retry via `refetch()` from the hook rather than re-running
 *      local state logic.
 *
 * 2. Authentication:
 *    - Better Auth uses HTTP-only cookies — fetches inside the hook send them
 *      automatically. Never pass Authorization headers.
 *
 * 3. Widget Performance:
 *    - Keep widgets lightweight and derive stats from already-cached data.
 *    - TanStack Query handles stale-while-revalidate and window-focus refetch
 *      for you — do not add polling unless a feature genuinely requires it.
 *
 * 4. Error Handling:
 *    - Use `isError` / `refetch()` from the hook for the error UI.
 *    - Don't crash the dashboard — always render a fallback card.
 *
 * 5. Design Patterns:
 *    - Follow ARI's card design and use Shadcn/ui components.
 *    - Maintain consistent spacing and show loading states.
 *
 * 6. Integration:
 *    - Widget must be a client component ('use client').
 *    - Use a named export (export function WidgetName).
 *    - Register in module.json `dashboard.widgetComponents`.
 *    - Dashboard dynamically imports this component.
 */
