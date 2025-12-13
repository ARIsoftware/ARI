"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { SidebarInset } from "@/components/ui/sidebar"
import { TopBar } from "@/components/top-bar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalendarDays, TrendingUp, Trophy, Target, Users, CheckSquare, Plus, Eye, BarChart3, Activity } from "lucide-react"
import { getFitnessStats } from "@/lib/fitness-stats"
import { getContacts } from "@/modules-core/contacts/lib/contacts"
import { getTasks } from "@/lib/tasks"
import { useSupabase } from "@/components/providers"
import { TaskAnalyticsChart } from "@/components/task-analytics-chart"
import { RecentActivityFeed } from "@/components/recent-activity-feed"

interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

interface Quote {
  id: string
  quote: string
  author?: string | null
}

interface DashboardClientProps {
  initialQuote: Quote | null
}

export default function DashboardClient({ initialQuote }: DashboardClientProps) {
  const { session } = useSupabase()
  const [loading, setLoading] = useState(true)
  const [fitnessStats, setFitnessStats] = useState<FitnessStats>({
    averageCompletionsPerDay: 0,
    mostCompletedTask: null,
    leastCompletedTask: null,
    totalCompletions: 0
  })
  const [contactCount, setContactCount] = useState(0)
  const [taskCount, setTaskCount] = useState(0)

  useEffect(() => {
    if (session) {
      loadDashboardData()
    }
  }, [session])

  const loadDashboardData = async () => {
    try {
      setLoading(true)

      // Create token function for all API calls
      const tokenFn = async () => session?.access_token || null

      // Load all data in parallel
      const [stats, contacts, tasks] = await Promise.all([
        getFitnessStats(tokenFn),
        getContacts(tokenFn),
        getTasks(tokenFn)
      ])

      setFitnessStats(stats)
      setContactCount(contacts.length)
      setTaskCount(tasks.length)

    } catch (error) {
      console.error("Failed to load dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidebarInset>
        <TopBar>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </TopBar>

        <div className="flex flex-1">
          {/* Main Content */}
          <div className="flex-1 flex flex-col gap-6 p-6 pr-3">
            {/* Welcome Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-medium">Dashboard</h1>
                <p className="text-sm text-[#aa2020] mt-1">
                  {initialQuote ? (
                    <>
                      {initialQuote.quote}
                      {initialQuote.author && ` - ${initialQuote.author}`}
                    </>
                  ) : (
                    "Autumn Arc Fantastical"
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => window.location.href = '/tasks'}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Task
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.location.href = '/radar'}>
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
                    <p className="text-xs text-muted-foreground">
                      tasks in your system
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs"
                      onClick={() => window.location.href = '/tasks'}
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
                    <div className="text-2xl font-medium">{contactCount}</div>
                    <p className="text-xs text-muted-foreground">
                      contacts in your network
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs"
                      onClick={() => window.location.href = '/contacts'}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View All
                    </Button>
                  </CardContent>
                </Card>

                {/* Fitness Performance */}
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Fitness Score</CardTitle>
                    <Trophy className="h-4 w-4 text-yellow-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-medium">{fitnessStats.totalCompletions}</div>
                    <p className="text-xs text-muted-foreground">
                      total completions
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs"
                      onClick={() => window.location.href = '/daily-fitness'}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Fitness
                    </Button>
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
                    <p className="text-xs text-muted-foreground">
                      all systems operational
                    </p>
                    <Badge variant="secondary" className="mt-2 text-xs">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                      Healthy
                    </Badge>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Fitness Stats Section */}
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
                    <div className="text-2xl font-medium">{fitnessStats.averageCompletionsPerDay.toFixed(1)}</div>
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
                      {fitnessStats.mostCompletedTask?.title || "No tasks completed yet"}
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
                      {fitnessStats.leastCompletedTask?.title || "No tasks to show"}
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
          </div>

          {/* Right Sidebar - Recent Activity */}
          <div className="w-80 bg-white p-6 pl-3">
            <RecentActivityFeed token={session?.access_token || null} />
          </div>
        </div>
      </SidebarInset>
  )
}
