'use client'

import { Button } from '@/components/ui/button'
import { Plus, BarChart3, Activity } from 'lucide-react'
import { useDashboardData } from '@/modules/dashboard/hooks/use-dashboard'
import { useDragDropMode } from '@/components/drag-drop-mode-context'
import { TasksFeed } from './tasks-feed'
import { DashboardStatCards, DashboardWidgetArea } from './dashboard-widgets'

export function BoxyDashboardLayout() {
  const { tasksEnabled, quote } = useDashboardData()
  const { isDragMode } = useDragDropMode()

  // No loading gates — render the shell unconditionally. Modules-list and
  // recent-activity queries are TanStack-cached with long staleTime, so they
  // resolve from memory on every navigation after the first. The brief cold
  // load shows the page chrome and empty cards rather than a spinner soup.

  return (
    <>
      <div className="flex flex-col lg:flex-row flex-1 relative min-h-[calc(100svh-4rem)]">
        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-6 p-6">
          {/* Welcome Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
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
            {tasksEnabled && (
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
            )}
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
          {isDragMode && <div className="border-t-2 border-dashed border-blue-400/50 my-2" />}

          {/* Dynamic widget area from modules */}
          <DashboardWidgetArea />
        </div>

        {/* Right Sidebar - Tasks (stacks below main content on narrow screens) */}
        <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l">
          <TasksFeed enabled={tasksEnabled} />
        </div>
      </div>
    </>
  )
}
