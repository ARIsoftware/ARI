'use client'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Plus,
  BarChart3,
  Activity,
  Info,
  Loader2,
} from 'lucide-react'
import { useDashboardData } from '@/modules/dashboard/hooks/use-dashboard'
import { useDragDropMode } from '@/components/drag-drop-mode-context'
import { RecentActivityFeed } from '../components/recent-activity-feed'
import { DashboardStatCards, DashboardWidgetArea } from '../components/dashboard-widgets'

export default function DashboardPage() {
  const {
    tasksEnabled,
    quote,
    recentActivity,
    isLoading,
    isDataLoading,
  } = useDashboardData()
  const { isDragMode } = useDragDropMode()

  // Show loading overlay while checking modules
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show alert if Tasks module is not enabled
  if (!tasksEnabled) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-blue-900 dark:text-blue-100 text-lg font-medium">
            Tasks Module Required
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300 mt-2">
            <p className="mb-4">
              The Dashboard requires the <strong>Tasks</strong> module to be enabled.
              The Tasks module provides the core task data that powers the dashboard analytics and overview.
            </p>
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/30"
              onClick={() => (window.location.href = '/settings')}
            >
              Go to Settings to Enable Tasks
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      {isDataLoading && (
        <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      <div className="flex flex-1 relative">
        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-6 p-6 pr-3">
          {/* Welcome Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-medium">Dashboard</h1>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                {quote ? (
                  <>
                    {quote.quote}
                    {quote.author && ` - ${quote.author}`}
                  </>
                ) : (
                  'Welcome to your personal dashboard'
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => (window.location.href = '/tasks')}>
                <Plus className="w-4 h-4 mr-2" />
                New Task
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => (window.location.href = '/tasks/radar')}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Priority Radar
              </Button>
            </div>
          </div>

          {/* Quick Stats Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              <h2 className="text-xl font-medium">Quick Overview</h2>
            </div>

            <DashboardStatCards />
          </div>

          {/* Blue separator between zones during drag mode */}
          {isDragMode && (
            <div className="border-t-2 border-dashed border-blue-400/50 my-2" />
          )}

          {/* Dynamic widget area from modules */}
          <DashboardWidgetArea />
        </div>

        {/* Right Sidebar - Recent Activity */}
        <div className="w-80 bg-background p-6 pl-3">
          <RecentActivityFeed activities={recentActivity} isLoading={isDataLoading} />
        </div>
      </div>
    </>
  )
}
