/**
 * Major Projects Module - Dashboard Widget
 *
 * This widget displays a summary of major projects on the main dashboard.
 * Shows total count, due soon count, and quick link to module page.
 *
 * Features:
 * - Real-time project count
 * - Due soon indicator (projects due within 7 days)
 * - Loading and error states
 * - Quick link to full module page
 * - Responsive design
 *
 * @module major-projects/components/widget
 * @version 1.0.0
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Briefcase, ArrowRight, Clock, Loader2, AlertCircle } from 'lucide-react'
import { useSupabase } from '@/components/providers'
import { getMajorProjects, getProjectStatistics } from '../lib/utils'
import type { MajorProject } from '../types'

/**
 * Dashboard Widget Component
 *
 * Displays project summary on dashboard:
 * - Total project count
 * - Due soon count (0-7 days)
 * - Quick navigation button
 *
 * State:
 * - projects: All user projects
 * - loading: Initial load state
 * - error: Error message if load fails
 *
 * @returns JSX.Element - Dashboard widget card
 */
export function MajorProjectsWidget() {
  const router = useRouter()
  const { session } = useSupabase()

  const [projects, setProjects] = useState<MajorProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * Load projects from API
   * Runs on mount and when session changes
   */
  useEffect(() => {
    async function loadProjects() {
      if (!session?.user?.id) {
        setLoading(false)
        return
      }

      try {
        const data = await getMajorProjects()
        setProjects(data)
        setError(null)
      } catch (err: any) {
        console.error('[MajorProjectsWidget] Error loading projects:', err)
        setError(err.message || 'Failed to load projects')
      } finally {
        setLoading(false)
      }
    }

    if (session) {
      loadProjects()
    }
  }, [session])

  /**
   * Calculate statistics for display
   */
  const stats = getProjectStatistics(projects)

  /**
   * Navigate to main module page
   */
  const handleViewAll = () => {
    router.push('/major-projects')
  }

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (loading) {
    return (
      <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <CardTitle className="text-lg font-bold">Major Projects</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // ============================================================================
  // ERROR STATE
  // ============================================================================

  if (error) {
    return (
      <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 border-red-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-red-600" />
              </div>
              <CardTitle className="text-lg font-bold">Major Projects</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="flex items-center gap-3 text-red-600 bg-red-50 rounded-lg p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">Error loading projects</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="w-full mt-4"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <Card className="shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      {/* Card Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center shadow-sm">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <CardTitle className="text-lg font-bold">Major Projects</CardTitle>
          </div>
        </div>
      </CardHeader>

      {/* Card Content */}
      <CardContent className="pb-6 space-y-4">
        {projects.length === 0 ? (
          // Empty state
          <div className="text-center py-6">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Briefcase className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">No projects yet</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleViewAll}
              className="font-medium"
            >
              <Briefcase className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </div>
        ) : (
          // Project statistics
          <>
            <div className="grid grid-cols-2 gap-4">
              {/* Total Projects */}
              <div className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Total
                </p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>

              {/* Due Soon */}
              <div className="bg-orange-50 rounded-xl p-4 hover:bg-orange-100 transition-colors">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Due Soon
                </p>
                <p className="text-2xl font-bold text-orange-700">{stats.dueSoon}</p>
              </div>
            </div>

            {/* Additional stats row */}
            <div className="grid grid-cols-2 gap-4">
              {/* On Track */}
              <div className="bg-green-50 rounded-xl p-3 hover:bg-green-100 transition-colors">
                <p className="text-xs font-medium text-green-700">On Track</p>
                <p className="text-lg font-bold text-green-700">{stats.onTrack}</p>
              </div>

              {/* Overdue */}
              <div className="bg-red-50 rounded-xl p-3 hover:bg-red-100 transition-colors">
                <p className="text-xs font-medium text-red-700">Overdue</p>
                <p className="text-lg font-bold text-red-700">{stats.overdue}</p>
              </div>
            </div>

            {/* View All Button */}
            <Button
              variant="outline"
              onClick={handleViewAll}
              className="w-full font-semibold hover:bg-gray-50 hover:shadow-md transition-all"
            >
              View All Projects
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Named export required for dynamic import by module system
export default MajorProjectsWidget

// ============================================================================
// DEVELOPER NOTES
// ============================================================================

/**
 * Module System Integration:
 *
 * This widget is registered in module.json under dashboard.widgetComponents
 * and is dynamically imported by the dashboard page.
 *
 * IMPORTANT: Must have a named export matching the component name
 * for dynamic imports to work correctly.
 */

/**
 * Why separate named and default exports?
 *
 * - Named export: For explicit imports elsewhere in the app
 * - Default export: For dynamic import by module system
 * - Both point to same component, just different export styles
 */

/**
 * Performance Notes:
 *
 * - Widget loads data independently from main page
 * - No shared state between widget and main page
 * - Each re-renders independently
 * - Consider adding a shared cache layer if performance becomes an issue
 */

/**
 * Error Handling Strategy:
 *
 * - Loading state: Shows spinner
 * - Error state: Shows error message with retry button
 * - Success state: Shows statistics
 *
 * Never crashes the entire dashboard if this widget fails.
 */

/**
 * Statistics Breakdown:
 *
 * - Total: All projects regardless of status
 * - Due Soon: Projects due within 0-7 days
 * - On Track: Projects due in 8+ days or no due date
 * - Overdue: Projects past their due date
 *
 * These match the status categories in the main page.
 */

/**
 * Related Files:
 * - ../lib/utils.ts - getProjectStatistics function
 * - ../types/index.ts - TypeScript types
 * - ../app/page.tsx - Main module page
 * - module.json - Widget registration
 */
