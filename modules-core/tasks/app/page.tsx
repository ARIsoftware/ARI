"use client"

import type React from "react"
import { Fragment } from "react"
import { useSupabase } from "@/components/providers"
import { DM_Sans } from "next/font/google"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Filter, List, Grid3X3, Calendar, Pin, Bell, Plus, Trash2, Pencil, Columns, Table } from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { toggleTaskCompletion, toggleTaskPin, reorderTasks, deleteTask, updateTask, type Task } from "../lib/utils"
import { useTasks } from "../hooks/use-tasks"
import { useQueryClient } from "@tanstack/react-query"
interface MajorProject { id: string; project_name: string; [key: string]: any }
import { useModuleEnabled } from "@/lib/modules/module-hooks"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter, useSearchParams } from "next/navigation"
import { schoolPride } from "@/lib/confetti"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const getStatusColor = (status: string) => {
  switch (status) {
    case "In Progress":
      return "bg-purple-100 text-purple-600"
    case "Pending":
      return "bg-blue-100 text-blue-600"
    case "Completed":
      return "bg-green-100 text-green-600"
    default:
      return "bg-gray-100 text-gray-600"
  }
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "High":
      return "bg-red-100 text-red-600"
    case "Medium":
      return "bg-yellow-100 text-yellow-600"
    case "Low":
      return "bg-gray-200 text-gray-600"
    default:
      return "bg-gray-100 text-gray-600"
  }
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "No due date"
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const calculateTaskAge = (createdAt: string) => {
  const createdDate = new Date(createdAt)
  const currentDate = new Date()
  const timeDiff = currentDate.getTime() - createdDate.getTime()
  const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24))
  return daysDiff
}

const formatTaskAge = (createdAt: string) => {
  const days = calculateTaskAge(createdAt)
  if (days === 0) return "Today"
  if (days === 1) return "1 day"
  return `${days} days`
}

const getTaskAgeColor = (createdAt: string, isStarred: boolean = false) => {
  const days = calculateTaskAge(createdAt)
  if (days > 4) {
    return "text-destructive"
  }
  return isStarred ? "text-gray-300" : "text-muted-foreground"
}

const getProjectName = (projectId: string | null | undefined, projects: MajorProject[]): string | null => {
  if (!projectId) return null
  const project = projects.find(p => p.id === projectId)
  return project ? project.project_name : null
}

export default function TasksPage() {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const { toast } = useToast()
  const { enabled: majorProjectsEnabled } = useModuleEnabled('major-projects')
  const searchParams = useSearchParams()

  // TanStack Query for tasks - replaces local state + realtime subscription
  const queryClient = useQueryClient()
  const { data: tasks = [], isLoading: loading, refetch: refetchTasks } = useTasks()

  const [activeFilter, setActiveFilter] = useState("All")
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"list" | "card" | "kanban" | "table">("list")
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const [projects, setProjects] = useState<MajorProject[]>([])
  const router = useRouter()
  const projectFilter = searchParams.get('filter')

  const filters = ["All", "Pinned", "In Progress", "Completed"]

  // Redirect to sign-in if user is not authenticated
  useEffect(() => {
    if (user === null) {
      router.push('/sign-in')
    }
  }, [user, router])

  // Load projects if major-projects module is enabled
  useEffect(() => {
    const loadProjects = async () => {
      if (majorProjectsEnabled) {
        try {
          const res = await fetch('/api/modules/major-projects/data')
          const projectsData = res.ok ? await res.json() : []
          setProjects(projectsData)
        } catch (error) {
          console.error('Failed to load projects:', error)
        }
      }
    }

    loadProjects()
  }, [majorProjectsEnabled])

  // Helper to update tasks cache optimistically
  const setTasksCache = (updater: (tasks: Task[]) => Task[]) => {
    queryClient.setQueryData<Task[]>(['tasks'], (old = []) => updater(old))
  }

  // Helper to invalidate and refetch tasks
  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }

  const filteredTasks = tasks
    .filter((task) => {
      // Hide completed tasks unless viewing "Completed" filter
      if (task.completed && activeFilter !== "Completed") return false

      const matchesFilter =
        activeFilter === "All" ||
        (activeFilter === "Pinned" && task.pinned) ||
        (activeFilter !== "Pinned" && task.status === activeFilter)
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.assignees.some((assignee: string) => assignee.toLowerCase().includes(searchQuery.toLowerCase()))

      // Filter by project if projectFilter is set
      const matchesProject = !projectFilter || task.project_id === projectFilter

      return matchesFilter && matchesSearch && matchesProject
    })
    .sort((a, b) => {
      // For completed tasks, sort by updated_at (most recent first)
      if (activeFilter === "Completed") {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }

      // Always show pinned tasks at the top
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1

      // Within same pinned status, maintain order_index
      return a.order_index - b.order_index
    })

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = async (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault()

    if (!draggedTask || draggedTask === targetTaskId) return

    const draggedIndex = tasks.findIndex((task) => task.id === draggedTask)
    const targetIndex = tasks.findIndex((task) => task.id === targetTaskId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newTasks = [...tasks]
    const [draggedItem] = newTasks.splice(draggedIndex, 1)
    newTasks.splice(targetIndex, 0, draggedItem)

    // Update order_index for all tasks based on new positions
    const updatedTasks = newTasks.map((task, index) => ({
      ...task,
      order_index: index
    }))

    // Update cache immediately for better UX (optimistic update)
    setTasksCache(() => updatedTasks)
    setDraggedTask(null)

    try {
      // Update order in database
      if (user?.id) {
        const tokenFn = async () => session?.access_token || null
        await reorderTasks(updatedTasks.map((task) => task.id), tokenFn)
        invalidateTasks() // Sync with server
      }
    } catch (error) {
      console.error("Failed to reorder tasks:", error)
      // Revert cache on error
      invalidateTasks()
      toast({
        title: "Error",
        description: "Failed to reorder tasks. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDragEnd = () => {
    setDraggedTask(null)
  }

  const handleKanbanDrop = async (e: React.DragEvent, columnType: string) => {
    e.preventDefault()

    if (!draggedTask) return

    const task = tasks.find((t) => t.id === draggedTask)
    if (!task) return

    let updates: Partial<Task> = {}

    if (columnType === "pinned") {
      updates.pinned = true
    } else {
      updates.pinned = false
      updates.priority = columnType.charAt(0).toUpperCase() + columnType.slice(1) as "High" | "Medium" | "Low"
    }

    // Optimistic update
    const taskId = draggedTask
    setTasksCache((old) => old.map((t) => t.id === taskId ? { ...t, ...updates } : t))
    setDraggedTask(null)

    try {
      if (user?.id) {
        const tokenFn = async () => session?.access_token || null
        await updateTask(taskId, updates, tokenFn)
        invalidateTasks() // Sync with server
      }
      toast({
        title: "Success",
        description: `Task moved to ${columnType === "pinned" ? "Pinned" : columnType + " priority"} column.`,
      })
    } catch (error) {
      console.error("Failed to update task:", error)
      invalidateTasks() // Revert on error
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleToggleCompletion = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      // If marking as complete and not in Completed filter, add fade animation
      if (!task.completed && activeFilter !== "Completed") {
        setFadingTasks(prev => new Set(prev).add(taskId))

        // Trigger confetti after 1 second
        setTimeout(() => {
          schoolPride()
        }, 1000)

        // Wait for animation to complete before updating
        setTimeout(async () => {
          if (user?.id) {
            const tokenFn = async () => session?.access_token || null
            await toggleTaskCompletion(taskId, tokenFn)
            invalidateTasks() // Sync with server
          }
          setFadingTasks(prev => {
            const newSet = new Set(prev)
            newSet.delete(taskId)
            return newSet
          })
          toast({
            title: "Success",
            description: "Task completed successfully.",
          })
        }, 300)
      } else {
        // If uncompleting or in Completed view, update immediately
        if (user?.id) {
          const tokenFn = async () => session?.access_token || null
          const updatedTask = await toggleTaskCompletion(taskId, tokenFn)
          invalidateTasks() // Sync with server

          // Trigger confetti only if completing (not uncompleting) - with 1 second delay
          if (updatedTask.completed) {
            setTimeout(() => {
              schoolPride()
            }, 1000)
          }

          toast({
            title: "Success",
            description: `Task ${updatedTask.completed ? "completed" : "reopened"} successfully.`,
          })
        }
      }
    } catch (error) {
      console.error("Failed to toggle task completion:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleTogglePin = async (taskId: string) => {
    if (!user?.id) return

    try {
      const tokenFn = async () => session?.access_token || null
      await toggleTaskPin(taskId, tokenFn)
      invalidateTasks() // Sync with server
    } catch (error) {
      console.error("Failed to toggle task pin:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      setTaskToDelete(task)
      setDeleteDialogOpen(true)
    }
  }

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return

    try {
      if (user?.id) {
        const tokenFn = async () => session?.access_token || null
        await deleteTask(taskToDelete.id, tokenFn)
        invalidateTasks() // Sync with server
      }
      toast({
        title: "Success",
        description: "Task deleted successfully.",
      })
    } catch (error) {
      console.error("Failed to delete task:", error)
      toast({
        title: "Error",
        description: "Failed to delete task. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeleteDialogOpen(false)
      setTaskToDelete(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
              {/* Header */}
              <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-medium">Todo List</h1>
                <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
                  {user ? `Welcome back, ${user.firstName || user.email || "there"}!` : '\u00A0'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => router.push("/tasks/radar")}>
                  Radar
                </Button>
                <Button onClick={() => router.push("/tasks/add")}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Task
                </Button>
              </div>
            </div>

            {/* Filters and Search */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                {filters.map((filter) => (
                  <Button
                    key={filter}
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveFilter(filter)}
                    className={`h-8 px-4 rounded-md transition-colors ${
                      activeFilter === filter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {filter}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search tasks..."
                    className="pl-10 w-64"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="w-4 h-4" />
                </Button>
                <div className="flex items-center rounded-lg border bg-card">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-r-none ${viewMode === "list" ? "bg-muted" : ""}`}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`border-x ${viewMode === "card" ? "bg-muted" : ""}`}
                    onClick={() => setViewMode("card")}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`border-x ${viewMode === "kanban" ? "bg-muted" : ""}`}
                    onClick={() => setViewMode("kanban")}
                  >
                    <Columns className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-l-none ${viewMode === "table" ? "bg-muted" : ""}`}
                    onClick={() => setViewMode("table")}
                  >
                    <Table className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Task List/Grid/Kanban/Table */}
            {viewMode === "table" ? (
              /* Table View */
              <div className="bg-card rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted border-b">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300"
                            onChange={(e) => {
                              if (e.target.checked) {
                                filteredTasks.forEach(task => {
                                  if (!task.completed) handleToggleCompletion(task.id)
                                })
                              }
                            }}
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Task
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Assignees
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Due Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Priority
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Project
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Progress
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Age
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {filteredTasks.map((task, index) => {
                        // Check if we need to add spacing (transition from pinned to non-pinned)
                        const prevTask = index > 0 ? filteredTasks[index - 1] : null
                        const needsSpacing = prevTask && prevTask.pinned && !task.pinned

                        return (
                          <>
                            {needsSpacing && (
                              <tr key={`spacer-${task.id}`} className="h-[30px]">
                                <td colSpan={7} className="bg-muted/30" />
                              </tr>
                            )}
                            <tr
                              key={task.id}
                              className={`hover:bg-muted transition-colors ${
                                task.pinned ? "bg-primary/5" : ""
                              } ${task.completed ? "opacity-60" : ""} ${
                                fadingTasks.has(task.id) ? "task-fade-out" : ""
                              }`}
                            >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={() => handleToggleCompletion(task.id)}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleTogglePin(task.id)}
                                className="transition-colors"
                              >
                                <Pin
                                  className={`w-4 h-4 ${task.pinned ? "text-[hsl(var(--primary))]" : "text-muted-foreground"}`}
                                  fill={task.pinned ? "hsl(var(--primary))" : "none"}
                                />
                              </button>
                              <span className={`font-medium text-sm ${
                                task.completed ? "line-through text-muted-foreground" : "text-foreground"
                              }`}>
                                {task.title.length > 25 ? task.title.substring(0, 25) + '...' : task.title}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {task.assignees.length > 0 ? (
                                task.assignees.map((name: string) => (
                                  <span
                                    key={name}
                                    className="px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground"
                                  >
                                    {name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Calendar className="w-4 h-4" />
                              <span>{formatDate(task.due_date)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className={`font-medium text-xs ${getStatusColor(task.status)}`}
                            >
                              {task.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className={`font-medium text-xs ${getPriorityColor(task.priority)}`}
                            >
                              {task.priority}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                              <Badge
                                variant="secondary"
                                className="font-medium text-xs cursor-pointer bg-blue-100 text-blue-700 hover:bg-blue-200"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/tasks?filter=${task.project_id}`)
                                }}
                              >
                                {getProjectName(task.project_id, projects)}
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2 max-w-[80px]">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all"
                                  style={{
                                    width: `${task.subtasks_total > 0 ? (task.subtasks_completed / task.subtasks_total) * 100 : 0}%`
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {task.subtasks_completed}/{task.subtasks_total}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-xs ${getTaskAgeColor(task.created_at, false)}`}>
                              {formatTaskAge(task.created_at)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleTogglePin(task.id)
                                }}
                              >
                                <Pin
                                  className={`w-4 h-4 ${task.pinned ? "text-[hsl(var(--primary))]" : "text-muted-foreground hover:text-[hsl(var(--primary))]"}`}
                                  fill={task.pinned ? "hsl(var(--primary))" : "none"}
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-muted"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/tasks/edit/${task.id}`)
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteTask(task.id)
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : viewMode === "kanban" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Pinned Column */}
                <div
                  className="bg-muted rounded-lg p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleKanbanDrop(e, "pinned")}
                >
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Pin className="w-4 h-4 text-[hsl(var(--primary))]" />
                    Pinned
                  </h3>
                  <div className="space-y-2">
                    {filteredTasks.filter(task => task.pinned && !task.completed).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 bg-card rounded-md shadow-sm hover:shadow-md transition-all cursor-move ${
                          draggedTask === task.id ? "opacity-50" : ""
                        } ${fadingTasks.has(task.id) ? "task-fade-out" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium flex-1 mr-2">{task.title}</h4>
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handleToggleCompletion(task.id)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={getTaskAgeColor(task.created_at, false)}>
                            {formatTaskAge(task.created_at)}
                          </span>
                        </div>
                        {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                          <Badge
                            variant="secondary"
                            className="font-medium text-xs cursor-pointer bg-blue-100 text-blue-700 hover:bg-blue-200 mt-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks?filter=${task.project_id}`)
                            }}
                          >
                            {getProjectName(task.project_id, projects)}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks/edit/${task.id}`)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTask(task.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* High Priority Column */}
                <div
                  className="bg-muted rounded-lg p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleKanbanDrop(e, "high")}
                >
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    High Priority
                  </h3>
                  <div className="space-y-2">
                    {filteredTasks.filter(task => !task.pinned && task.priority === "High" && !task.completed).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 bg-card rounded-md shadow-sm hover:shadow-md transition-all cursor-move ${
                          draggedTask === task.id ? "opacity-50" : ""
                        } ${fadingTasks.has(task.id) ? "task-fade-out" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium flex-1 mr-2">{task.title}</h4>
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handleToggleCompletion(task.id)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={getTaskAgeColor(task.created_at, false)}>
                            {formatTaskAge(task.created_at)}
                          </span>
                        </div>
                        {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                          <Badge
                            variant="secondary"
                            className="font-medium text-xs cursor-pointer bg-blue-100 text-blue-700 hover:bg-blue-200 mt-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks?filter=${task.project_id}`)
                            }}
                          >
                            {getProjectName(task.project_id, projects)}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks/edit/${task.id}`)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTask(task.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Medium Priority Column */}
                <div
                  className="bg-muted rounded-lg p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleKanbanDrop(e, "medium")}
                >
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    Medium Priority
                  </h3>
                  <div className="space-y-2">
                    {filteredTasks.filter(task => !task.pinned && task.priority === "Medium" && !task.completed).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 bg-card rounded-md shadow-sm hover:shadow-md transition-all cursor-move ${
                          draggedTask === task.id ? "opacity-50" : ""
                        } ${fadingTasks.has(task.id) ? "task-fade-out" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium flex-1 mr-2">{task.title}</h4>
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handleToggleCompletion(task.id)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={getTaskAgeColor(task.created_at, false)}>
                            {formatTaskAge(task.created_at)}
                          </span>
                        </div>
                        {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                          <Badge
                            variant="secondary"
                            className="font-medium text-xs cursor-pointer bg-blue-100 text-blue-700 hover:bg-blue-200 mt-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks?filter=${task.project_id}`)
                            }}
                          >
                            {getProjectName(task.project_id, projects)}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks/edit/${task.id}`)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTask(task.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Low Priority Column */}
                <div
                  className="bg-muted rounded-lg p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleKanbanDrop(e, "low")}
                >
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-500" />
                    Low Priority
                  </h3>
                  <div className="space-y-2">
                    {filteredTasks.filter(task => !task.pinned && task.priority === "Low" && !task.completed).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 bg-card rounded-md shadow-sm hover:shadow-md transition-all cursor-move ${
                          draggedTask === task.id ? "opacity-50" : ""
                        } ${fadingTasks.has(task.id) ? "task-fade-out" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium flex-1 mr-2">{task.title}</h4>
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handleToggleCompletion(task.id)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={getTaskAgeColor(task.created_at, false)}>
                            {formatTaskAge(task.created_at)}
                          </span>
                        </div>
                        {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                          <Badge
                            variant="secondary"
                            className="font-medium text-xs cursor-pointer bg-blue-100 text-blue-700 hover:bg-blue-200 mt-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks?filter=${task.project_id}`)
                            }}
                          >
                            {getProjectName(task.project_id, projects)}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks/edit/${task.id}`)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTask(task.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className={viewMode === "card" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-3"}>
              {filteredTasks.map((task, index) => {
                // Check if we need to add spacing (transition from pinned to non-pinned)
                const prevTask = index > 0 ? filteredTasks[index - 1] : null
                const needsSpacing = prevTask && prevTask.pinned && !task.pinned

                return (
                  <Fragment key={task.id}>
                    {needsSpacing && viewMode === "list" && (
                      <div className="h-[30px]" />
                    )}
                    {needsSpacing && viewMode === "card" && (
                      <div className="col-span-full h-[30px]" />
                    )}
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, task.id)}
                      onDragEnd={handleDragEnd}
                      className={`${
                        viewMode === "card"
                          ? "flex flex-col gap-3 p-4 border rounded-lg hover:shadow-md transition-all cursor-move h-full"
                          : "flex items-start gap-4 p-4 border rounded-lg hover:shadow-sm transition-all cursor-move"
                      } ${
                        task.pinned ? "bg-[#214b88] text-white shadow-lg" : "bg-card border-border"
                      } ${draggedTask === task.id ? "opacity-50" : ""} ${task.completed ? "taskdone" : ""} ${fadingTasks.has(task.id) ? "task-fade-out" : ""}`}
                    >
                  {viewMode === "list" ? (
                    <>
                      {/* List View */}
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleCompletion(task.id)}
                        className="w-5 h-5 mt-1 rounded border-gray-300"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3
                            className={`font-medium ${task.completed ? "line-through text-muted-foreground" : task.pinned ? "text-white" : "text-foreground"}`}
                          >
                            {task.title}
                          </h3>
                          <button
                            onClick={() => handleTogglePin(task.id)}
                            className="transition-colors"
                          >
                            <Pin
                              className={`w-5 h-5 ${task.pinned ? "text-white" : "text-muted-foreground hover:text-[hsl(var(--primary))]"}`}
                              fill={task.pinned ? "white" : "none"}
                            />
                          </button>
                        </div>

                        <div
                          className={`flex items-center flex-wrap gap-x-4 gap-y-2 text-sm ${task.pinned ? "text-gray-300" : "text-muted-foreground"}`}
                        >
                          <div className="flex items-center gap-2">
                            {task.assignees.map((name: string) => (
                              <span
                                key={name}
                                className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.pinned ? "bg-white/10 text-gray-200" : "bg-muted text-muted-foreground"}`}
                              >
                                {name}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(task.due_date)}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Bell className="w-4 h-4" />
                            <span>
                              Subtasks: {task.subtasks_completed}/{task.subtasks_total}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm ${getTaskAgeColor(task.created_at, task.pinned)}`}>
                              {formatTaskAge(task.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="secondary"
                          className={`font-medium text-xs ${task.pinned ? "bg-white/10 text-gray-200" : getStatusColor(task.status)}`}
                        >
                          {task.status}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`font-medium text-xs ${task.pinned ? "bg-white/10 text-gray-200" : getPriorityColor(task.priority)}`}
                        >
                          {task.priority}
                        </Badge>
                        {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                          <Badge
                            variant="secondary"
                            className={`font-medium text-xs cursor-pointer ${task.pinned ? "bg-white/10 text-gray-200 hover:bg-white/20" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks?filter=${task.project_id}`)
                            }}
                          >
                            {getProjectName(task.project_id, projects)}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTogglePin(task.id)
                          }}
                        >
                          <Pin
                            className={`w-4 h-4 ${task.pinned ? "text-white" : "text-muted-foreground hover:text-[hsl(var(--primary))]"}`}
                            fill={task.pinned ? "white" : "none"}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-primary hover:bg-muted"}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/tasks/edit/${task.id}`)
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTask(task.id)
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Card View */}
                      <div className="flex items-start justify-between">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => handleToggleCompletion(task.id)}
                          className="w-5 h-5 rounded border-gray-300"
                        />
                        <button
                          onClick={() => handleTogglePin(task.id)}
                          className="transition-colors"
                        >
                          <Pin
                            className={`w-5 h-5 ${task.pinned ? "text-white" : "text-muted-foreground hover:text-[hsl(var(--primary))]"}`}
                            fill={task.pinned ? "white" : "none"}
                          />
                        </button>
                      </div>

                      <div className="flex-1">
                        <h3
                          className={`font-medium text-base mb-3 line-clamp-2 ${task.completed ? "line-through text-muted-foreground" : task.pinned ? "text-white" : "text-foreground"}`}
                        >
                          {task.title}
                        </h3>

                        <div className={`space-y-2 text-sm ${task.pinned ? "text-gray-300" : "text-muted-foreground"}`}>
                          {task.assignees.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {task.assignees.map((name: string) => (
                                <span
                                  key={name}
                                  className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.pinned ? "bg-white/10 text-gray-200" : "bg-muted text-muted-foreground"}`}
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs">{formatDate(task.due_date)}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Bell className="w-4 h-4" />
                            <span className="text-xs">
                              Subtasks: {task.subtasks_completed}/{task.subtasks_total}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs ${getTaskAgeColor(task.created_at, task.pinned)}`}>
                              {formatTaskAge(task.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="secondary"
                            className={`font-medium text-xs ${task.pinned ? "bg-white/10 text-gray-200" : getStatusColor(task.status)}`}
                          >
                            {task.status}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={`font-medium text-xs ${task.pinned ? "bg-white/10 text-gray-200" : getPriorityColor(task.priority)}`}
                          >
                            {task.priority}
                          </Badge>
                          {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                            <Badge
                              variant="secondary"
                              className={`font-medium text-xs cursor-pointer ${task.pinned ? "bg-white/10 text-gray-200 hover:bg-white/20" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/tasks?filter=${task.project_id}`)
                              }}
                            >
                              {getProjectName(task.project_id, projects)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleTogglePin(task.id)
                            }}
                          >
                            <Pin
                              className={`w-4 h-4 ${task.pinned ? "text-white" : "text-muted-foreground hover:text-[hsl(var(--primary))]"}`}
                              fill={task.pinned ? "white" : "none"}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-primary hover:bg-muted"}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks/edit/${task.id}`)
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTask(task.id)
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                  </Fragment>
                )
              })}
              </div>
            )}

      {filteredTasks.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          {searchQuery || activeFilter !== "All"
            ? "No tasks found matching your criteria."
            : "No tasks yet. Click 'Add Task' to get started!"}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the task "{taskToDelete?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteTask}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
