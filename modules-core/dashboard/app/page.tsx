'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  CalendarDays,
  TrendingUp,
  Trophy,
  Target,
  Users,
  CheckSquare,
  Plus,
  Eye,
  BarChart3,
  Activity,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { useDashboardData } from '@/lib/hooks/use-dashboard'
import { TaskAnalyticsChart } from '@/modules/tasks/components/task-analytics-chart'
import { RecentActivityFeed } from '../components/recent-activity-feed'
import { useSupabase } from '@/components/providers'

export default function DashboardPage() {
  const { session } = useSupabase()
  const {
    tasksEnabled,
    contactsEnabled,
    fitnessEnabled,
    taskCount,
    contactCount,
    fitnessStats,
    quote,
    recentActivity,
    isLoading,
    isDataLoading,
  } = useDashboardData()

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
        <Alert variant="destructive" className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <AlertTitle className="text-orange-800 dark:text-orange-200 text-lg">
            Tasks Module Required
          </AlertTitle>
          <AlertDescription className="text-orange-700 dark:text-orange-300 mt-2">
            <p className="mb-4">
              The Dashboard requires the <strong>Tasks</strong> module to be enabled.
              The Tasks module provides the core task data that powers the dashboard analytics and overview.
            </p>
            <Button
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/30"
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
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 z-10 flex items-center justify-center">
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
              <p className="text-sm text-[#aa2020] mt-1">
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

          {/* Task Analytics Chart */}
          <TaskAnalyticsChart token={session?.access_token || null} />

          {/* Quick Stats Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              <h2 className="text-xl font-medium">Quick Overview</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Tasks */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium">{taskCount}</div>
                  <p className="text-xs text-muted-foreground">tasks in your system</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 text-xs"
                    onClick={() => (window.location.href = '/tasks')}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View All
                  </Button>
                </CardContent>
              </Card>

              {/* Total Contacts */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                  <Users className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium">
                    {contactsEnabled ? contactCount : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {contactsEnabled ? 'contacts in your network' : 'Contacts module not enabled'}
                  </p>
                  {contactsEnabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs"
                      onClick={() => (window.location.href = '/contacts')}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View All
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Fitness Performance */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Fitness Score</CardTitle>
                  <Trophy className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium">
                    {fitnessEnabled ? fitnessStats.totalCompletions : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fitnessEnabled ? 'total completions' : 'Fitness module not enabled'}
                  </p>
                  {fitnessEnabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs"
                      onClick={() => (window.location.href = '/daily-fitness')}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Fitness
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* System Status */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">System Status</CardTitle>
                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium">Online</div>
                  <p className="text-xs text-muted-foreground">all systems operational</p>
                  <Badge variant="secondary" className="mt-2 text-xs">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                    Healthy
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Fitness Stats Section - only show if fitness module enabled */}
          {fitnessEnabled && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-medium">Fitness Performance</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Average Completions Per Day */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-medium">
                      {fitnessStats.averageCompletionsPerDay.toFixed(1)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      fitness tasks completed per day
                    </p>
                  </CardContent>
                </Card>

                {/* Most Completed Task */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Top Performer</CardTitle>
                    <Trophy className="h-4 w-4 text-yellow-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-medium">
                      {fitnessStats.mostCompletedTask?.count || 0}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {fitnessStats.mostCompletedTask?.title || 'No tasks completed yet'}
                    </p>
                  </CardContent>
                </Card>

                {/* Least Completed Task */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
                    <TrendingUp className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-medium">
                      {fitnessStats.leastCompletedTask?.count || 0}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {fitnessStats.leastCompletedTask?.title || 'No tasks to show'}
                    </p>
                  </CardContent>
                </Card>

                {/* Total Completions */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Completions</CardTitle>
                    <CheckSquare className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-medium">{fitnessStats.totalCompletions}</div>
                    <p className="text-xs text-muted-foreground">
                      all-time fitness task completions
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Recent Activity */}
        <div className="w-80 bg-white dark:bg-gray-900 p-6 pl-3">
          <RecentActivityFeed activities={recentActivity} isLoading={isDataLoading} />
        </div>
      </div>
    </>
  )
}
