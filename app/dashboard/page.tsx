"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { DM_Sans } from "next/font/google"
import { AppSidebar } from "../../components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarDays, TrendingUp, Trophy, Target, Users, CheckSquare, Loader2 } from "lucide-react"
import { getFitnessStats } from "@/lib/fitness-stats"
import { getContacts } from "@/lib/contacts"
import { getTasks } from "@/lib/tasks"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

export default function DashboardPage() {
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
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // Load fitness stats
      const stats = await getFitnessStats()
      setFitnessStats(stats)
      
      // Load contact count
      const contacts = await getContacts()
      setContactCount(contacts.length)
      
      // Load task count  
      const tasks = await getTasks()
      setTaskCount(tasks.length)
      
    } catch (error) {
      console.error("Failed to load dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <TaskAnnouncement />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <div className="flex items-center justify-center h-96">
              <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Loading dashboard...</span>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Welcome Header */}
            <div>
              <h1 className="text-3xl font-medium">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your productivity overview and fitness insights
              </p>
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

            {/* Quick Stats Section */}
            <div className="space-y-4">
              <h2 className="text-xl font-medium">Quick Overview</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Tasks */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-medium">{taskCount}</div>
                    <p className="text-xs text-muted-foreground">
                      tasks in your system
                    </p>
                  </CardContent>
                </Card>

                {/* Total Contacts */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-medium">{contactCount}</div>
                    <p className="text-xs text-muted-foreground">
                      contacts in your network
                    </p>
                  </CardContent>
                </Card>

                {/* System Status */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">System Status</CardTitle>
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-medium">Online</div>
                    <p className="text-xs text-muted-foreground">
                      all systems operational
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Recent Activity Placeholder */}
            <div className="space-y-4">
              <h2 className="text-xl font-medium">Recent Activity</h2>
              <Card>
                <CardHeader>
                  <CardTitle>Activity Feed</CardTitle>
                  <CardDescription>
                    Recent actions and updates across your tasks and contacts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Activity feed coming soon...</p>
                    <p className="text-sm mt-2">This will show your recent task completions and contact updates</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}