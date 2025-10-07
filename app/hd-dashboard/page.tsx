"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { AppSidebar } from "../../components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckSquare, Circle, AlertCircle, Clock, TrendingUp, Users, Target, Dumbbell, Trophy, Compass, Package } from "lucide-react"
import { getFitnessStats } from "@/lib/fitness-stats"
import { getContacts } from "@/lib/contacts"
import { getTasks } from "@/lib/tasks"
import { getNotepad } from "@/lib/notepad"
import { useSupabase } from "@/components/providers"

interface Task {
  id: string
  title: string
  status: string
  priority_score?: number
  due_date?: string
  impact?: number
  severity?: number
  timeliness?: number
  effort?: number
  strategic_fit?: number
}

interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
}

interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

export default function HDDashboardPage() {
  const { session } = useSupabase()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [fitnessStats, setFitnessStats] = useState<FitnessStats>({
    averageCompletionsPerDay: 0,
    mostCompletedTask: null,
    leastCompletedTask: null,
    totalCompletions: 0
  })
  const [notepadContent, setNotepadContent] = useState("")

  useEffect(() => {
    if (session) {
      loadAllData()
    }
  }, [session])

  const loadAllData = async () => {
    try {
      setLoading(true)
      const tokenFn = async () => session?.access_token || null

      const [tasksData, contactsData, statsData, notepadData] = await Promise.all([
        getTasks(tokenFn),
        getContacts(tokenFn),
        getFitnessStats(tokenFn),
        getNotepad()
      ])

      setTasks(tasksData)
      setContacts(contactsData)
      setFitnessStats(statsData)
      setNotepadContent(notepadData.content || "")
    } catch (error) {
      console.error("Failed to load dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!session || loading) {
    return (
      <div className="min-h-screen bg-white">
        <TaskAnnouncement />
        <SidebarProvider defaultOpen={false}>
          <AppSidebar />
          <SidebarInset>
            <div className="flex items-center justify-center h-96">
              <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">Loading HD Dashboard...</span>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    )
  }

  // Calculate task statistics
  const incompleteTasks = tasks.filter(t => t.status !== 'completed')
  const completedTasks = tasks.filter(t => t.status === 'completed')
  const overdueTasks = incompleteTasks.filter(t => t.due_date && new Date(t.due_date) < new Date())
  const todayTasks = incompleteTasks.filter(t => {
    if (!t.due_date) return false
    const today = new Date().toDateString()
    return new Date(t.due_date).toDateString() === today
  })
  const highPriorityTasks = incompleteTasks
    .filter(t => t.priority_score && t.priority_score > 0)
    .sort((a, b) => (a.priority_score || 0) - (b.priority_score || 0))
    .slice(0, 15)

  const getUrgencyColor = (task: Task) => {
    if (!task.due_date) return 'bg-gray-100 text-gray-600'
    const daysUntil = Math.ceil((new Date(task.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil < 0) return 'bg-red-100 text-red-700'
    if (daysUntil <= 1) return 'bg-orange-100 text-orange-700'
    if (daysUntil <= 3) return 'bg-yellow-100 text-yellow-700'
    return 'bg-green-100 text-green-700'
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-white">
      <TaskAnnouncement />
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-white px-3">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-sm">HD Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="p-2">
            {/* Top Stats Row - Ultra Compact */}
            <div className="grid grid-cols-8 gap-1 mb-2">
              <div className="border rounded p-1.5 bg-blue-50">
                <div className="flex items-center gap-1">
                  <CheckSquare className="w-3 h-3 text-blue-600" />
                  <span className="text-[10px] font-medium text-gray-600">Tasks</span>
                </div>
                <div className="text-lg font-bold text-blue-900">{tasks.length}</div>
                <div className="text-[9px] text-gray-500">{completedTasks.length} done</div>
              </div>

              <div className="border rounded p-1.5 bg-red-50">
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-red-600" />
                  <span className="text-[10px] font-medium text-gray-600">Overdue</span>
                </div>
                <div className="text-lg font-bold text-red-900">{overdueTasks.length}</div>
                <div className="text-[9px] text-gray-500">needs attention</div>
              </div>

              <div className="border rounded p-1.5 bg-orange-50">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-orange-600" />
                  <span className="text-[10px] font-medium text-gray-600">Today</span>
                </div>
                <div className="text-lg font-bold text-orange-900">{todayTasks.length}</div>
                <div className="text-[9px] text-gray-500">due today</div>
              </div>

              <div className="border rounded p-1.5 bg-purple-50">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-purple-600" />
                  <span className="text-[10px] font-medium text-gray-600">Contacts</span>
                </div>
                <div className="text-lg font-bold text-purple-900">{contacts.length}</div>
                <div className="text-[9px] text-gray-500">in network</div>
              </div>

              <div className="border rounded p-1.5 bg-green-50">
                <div className="flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-green-600" />
                  <span className="text-[10px] font-medium text-gray-600">Fitness</span>
                </div>
                <div className="text-lg font-bold text-green-900">{fitnessStats.totalCompletions}</div>
                <div className="text-[9px] text-gray-500">completions</div>
              </div>

              <div className="border rounded p-1.5 bg-yellow-50">
                <div className="flex items-center gap-1">
                  <Dumbbell className="w-3 h-3 text-yellow-600" />
                  <span className="text-[10px] font-medium text-gray-600">Avg/Day</span>
                </div>
                <div className="text-lg font-bold text-yellow-900">{fitnessStats.averageCompletionsPerDay.toFixed(1)}</div>
                <div className="text-[9px] text-gray-500">fitness avg</div>
              </div>

              <div className="border rounded p-1.5 bg-indigo-50">
                <div className="flex items-center gap-1">
                  <Target className="w-3 h-3 text-indigo-600" />
                  <span className="text-[10px] font-medium text-gray-600">Active</span>
                </div>
                <div className="text-lg font-bold text-indigo-900">{incompleteTasks.length}</div>
                <div className="text-[9px] text-gray-500">incomplete</div>
              </div>

              <div className="border rounded p-1.5 bg-emerald-50">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                  <span className="text-[10px] font-medium text-gray-600">Rate</span>
                </div>
                <div className="text-lg font-bold text-emerald-900">
                  {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
                </div>
                <div className="text-[9px] text-gray-500">completion</div>
              </div>
            </div>

            {/* Main Content Grid - 3 Columns */}
            <div className="grid grid-cols-3 gap-2">
              {/* Column 1: High Priority Tasks */}
              <div className="border rounded p-2">
                <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-red-600" />
                  Top Priority Tasks ({highPriorityTasks.length})
                </h3>
                <div className="space-y-0.5">
                  {highPriorityTasks.map((task, idx) => (
                    <div key={task.id} className="flex items-start gap-1.5 py-0.5 px-1 hover:bg-gray-50 rounded text-[11px] border-b border-gray-100">
                      <span className="text-[9px] text-gray-400 font-mono mt-0.5">{idx + 1}</span>
                      <Circle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{task.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {task.due_date && (
                            <Badge className={`text-[8px] px-1 py-0 h-3.5 ${getUrgencyColor(task)}`}>
                              {formatDate(task.due_date)}
                            </Badge>
                          )}
                          {task.priority_score && (
                            <span className="text-[9px] text-gray-500 font-mono">
                              P:{task.priority_score.toFixed(1)}
                            </span>
                          )}
                          {task.impact && (
                            <span className="text-[9px] text-blue-600">I:{task.impact}</span>
                          )}
                          {task.severity && (
                            <span className="text-[9px] text-red-600">S:{task.severity}</span>
                          )}
                          {task.effort && (
                            <span className="text-[9px] text-purple-600">E:{task.effort}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {highPriorityTasks.length === 0 && (
                    <div className="text-[10px] text-gray-400 text-center py-4">No priority tasks</div>
                  )}
                </div>
              </div>

              {/* Column 2: All Tasks Overview + Fitness */}
              <div className="space-y-2">
                {/* Overdue Tasks */}
                {overdueTasks.length > 0 && (
                  <div className="border rounded p-2 bg-red-50">
                    <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-red-900">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      Overdue ({overdueTasks.length})
                    </h3>
                    <div className="space-y-0.5">
                      {overdueTasks.slice(0, 8).map((task) => (
                        <div key={task.id} className="flex items-center gap-1.5 py-0.5 px-1 bg-white rounded text-[11px]">
                          <Circle className="w-2.5 h-2.5 flex-shrink-0 text-red-600" />
                          <div className="flex-1 min-w-0 truncate font-medium">{task.title}</div>
                          {task.due_date && (
                            <span className="text-[9px] text-red-600 flex-shrink-0">
                              {formatDate(task.due_date)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Today's Tasks */}
                {todayTasks.length > 0 && (
                  <div className="border rounded p-2 bg-orange-50">
                    <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-orange-900">
                      <Clock className="w-3.5 h-3.5 text-orange-600" />
                      Due Today ({todayTasks.length})
                    </h3>
                    <div className="space-y-0.5">
                      {todayTasks.slice(0, 6).map((task) => (
                        <div key={task.id} className="flex items-center gap-1.5 py-0.5 px-1 bg-white rounded text-[11px]">
                          <Circle className="w-2.5 h-2.5 flex-shrink-0 text-orange-600" />
                          <div className="flex-1 min-w-0 truncate font-medium">{task.title}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All Incomplete Tasks */}
                <div className="border rounded p-2">
                  <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                    Active Tasks ({incompleteTasks.length})
                  </h3>
                  <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                    {incompleteTasks.slice(0, 20).map((task) => (
                      <div key={task.id} className="flex items-center gap-1.5 py-0.5 px-1 hover:bg-gray-50 rounded text-[11px]">
                        <Circle className="w-2.5 h-2.5 flex-shrink-0 text-blue-600" />
                        <div className="flex-1 min-w-0 truncate">{task.title}</div>
                        {task.due_date && (
                          <Badge className={`text-[8px] px-1 py-0 h-3.5 ${getUrgencyColor(task)}`}>
                            {formatDate(task.due_date)}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fitness Stats */}
                <div className="border rounded p-2 bg-green-50">
                  <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-green-900">
                    <Dumbbell className="w-3.5 h-3.5 text-green-600" />
                    Fitness Performance
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-white rounded p-1.5">
                      <div className="text-[9px] text-gray-500">Total</div>
                      <div className="text-sm font-bold text-green-900">{fitnessStats.totalCompletions}</div>
                    </div>
                    <div className="bg-white rounded p-1.5">
                      <div className="text-[9px] text-gray-500">Daily Avg</div>
                      <div className="text-sm font-bold text-green-900">{fitnessStats.averageCompletionsPerDay.toFixed(1)}</div>
                    </div>
                  </div>
                  {fitnessStats.mostCompletedTask && (
                    <div className="mt-1.5 bg-white rounded p-1.5">
                      <div className="text-[9px] text-gray-500 mb-0.5">Top Exercise</div>
                      <div className="text-[11px] font-medium text-gray-900 truncate">
                        {fitnessStats.mostCompletedTask.title}
                      </div>
                      <div className="text-[9px] text-green-600">
                        {fitnessStats.mostCompletedTask.count} completions
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3: Contacts + Notepad */}
              <div className="space-y-2">
                {/* Contacts List */}
                <div className="border rounded p-2">
                  <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    Contacts ({contacts.length})
                  </h3>
                  <div className="space-y-0.5 max-h-[250px] overflow-y-auto">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="py-1 px-1.5 hover:bg-gray-50 rounded border-b border-gray-100">
                        <div className="text-[11px] font-medium text-gray-900">{contact.name}</div>
                        {contact.company && (
                          <div className="text-[9px] text-gray-500">{contact.company}</div>
                        )}
                        <div className="flex gap-2 mt-0.5">
                          {contact.email && (
                            <div className="text-[9px] text-blue-600 truncate">{contact.email}</div>
                          )}
                          {contact.phone && (
                            <div className="text-[9px] text-gray-500">{contact.phone}</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {contacts.length === 0 && (
                      <div className="text-[10px] text-gray-400 text-center py-4">No contacts</div>
                    )}
                  </div>
                </div>

                {/* Notepad Preview */}
                <div className="border rounded p-2 bg-yellow-50">
                  <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-yellow-900">
                    <Compass className="w-3.5 h-3.5 text-yellow-600" />
                    Notepad
                  </h3>
                  <div className="bg-white rounded p-2 text-[10px] text-gray-700 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono leading-tight">
                    {notepadContent || "No notes yet"}
                  </div>
                </div>

                {/* Task Completion Rate */}
                <div className="border rounded p-2 bg-blue-50">
                  <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-blue-900">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    Completion Rate
                  </h3>
                  <div className="bg-white rounded p-2">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[9px] text-gray-500">Progress</span>
                      <span className="text-lg font-bold text-blue-900">
                        {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0}%`
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-gray-500">
                      <span>{completedTasks.length} completed</span>
                      <span>{incompleteTasks.length} remaining</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Section: Recently Completed Tasks */}
            {completedTasks.length > 0 && (
              <div className="border rounded p-2 mt-2 bg-gray-50">
                <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-gray-900">
                  <CheckSquare className="w-3.5 h-3.5 text-gray-600" />
                  Recently Completed ({completedTasks.length})
                </h3>
                <div className="grid grid-cols-4 gap-1">
                  {completedTasks.slice(0, 16).map((task) => (
                    <div key={task.id} className="bg-white rounded px-2 py-1 text-[10px] text-gray-500 truncate border">
                      <CheckSquare className="w-2.5 h-2.5 inline mr-1 text-green-600" />
                      {task.title}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
