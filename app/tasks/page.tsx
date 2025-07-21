"use client"

import type React from "react"
import { useUser } from "@clerk/nextjs"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Filter, List, Grid3X3, Calendar, Star, Bell, Plus, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { getTasks, toggleTaskCompletion, toggleTaskStar, reorderTasks, type Task } from "@/lib/tasks"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

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

export default function TasksPage() {
  const { user } = useUser()
  const { toast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState("All")
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filters = ["All", "Today", "In Progress", "Completed"]

  // Load tasks from Supabase and set up real-time subscription
  useEffect(() => {
    loadTasks()

    // Set up real-time subscription
    const channel = supabase
      .channel("ari-database-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ari-database",
        },
        (payload) => {
          console.log("Real-time update:", payload)

          if (payload.eventType === "INSERT") {
            setTasks((prev) => [payload.new as Task, ...prev])
          } else if (payload.eventType === "UPDATE") {
            setTasks((prev) => prev.map((task) => (task.id === payload.new.id ? (payload.new as Task) : task)))
          } else if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((task) => task.id !== payload.old.id))
          }
        },
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadTasks = async () => {
    try {
      setLoading(true)
      const data = await getTasks()
      setTasks(data)
    } catch (error) {
      console.error("Failed to load tasks:", error)
      toast({
        title: "Error",
        description: "Failed to load tasks. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredTasks = tasks.filter((task) => {
    const matchesFilter =
      activeFilter === "All" ||
      (activeFilter === "Today" && task.starred) ||
      (activeFilter !== "Today" && task.status === activeFilter)
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.assignees.some((assignee) => assignee.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesFilter && matchesSearch
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

    // Update local state immediately for better UX
    setTasks(newTasks)
    setDraggedTask(null)

    try {
      // Update order in database
      await reorderTasks(newTasks.map((task) => task.id))
    } catch (error) {
      console.error("Failed to reorder tasks:", error)
      // Revert local state on error
      setTasks(tasks)
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

  const handleToggleCompletion = async (taskId: string) => {
    try {
      const updatedTask = await toggleTaskCompletion(taskId)
      setTasks(tasks.map((task) => (task.id === taskId ? updatedTask : task)))
      toast({
        title: "Success",
        description: `Task ${updatedTask.completed ? "completed" : "reopened"} successfully.`,
      })
    } catch (error) {
      console.error("Failed to toggle task completion:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleToggleStar = async (taskId: string) => {
    try {
      const updatedTask = await toggleTaskStar(taskId)
      setTasks(tasks.map((task) => (task.id === taskId ? updatedTask : task)))
    } catch (error) {
      console.error("Failed to toggle task star:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
          <span className={`text-white font-medium ${dmSans.className}`}>ARI-2</span>
        </div>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <div className="flex items-center justify-center h-96">
              <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Loading tasks...</span>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI-2</span>
      </div>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Todo</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>All Tasks</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Todo List</h1>
                {user && (
                  <p className="text-sm text-muted-foreground mt-1">Welcome back, {user.firstName || "there"}!</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={loadTasks} disabled={loading} className="bg-white">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  Refresh
                </Button>
                <Button className="bg-black hover:bg-gray-800">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Task
                </Button>
              </div>
            </div>

            {/* Filters and Search */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1 p-1 bg-gray-200/75 rounded-lg">
                {filters.map((filter) => (
                  <Button
                    key={filter}
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveFilter(filter)}
                    className={`h-8 px-4 rounded-md transition-colors ${
                      activeFilter === filter ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {filter}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search tasks..."
                    className="pl-10 w-64 bg-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" className="bg-white">
                  <Filter className="w-4 h-4" />
                </Button>
                <div className="flex items-center rounded-lg border bg-white">
                  <Button variant="ghost" size="icon" className="rounded-r-none">
                    <List className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="rounded-l-none bg-gray-100">
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Task List */}
            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, task.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-start gap-4 p-4 border rounded-lg hover:shadow-sm transition-all cursor-move ${
                    task.starred ? "bg-[#214b88] text-white shadow-lg" : "bg-white border-gray-200"
                  } ${draggedTask === task.id ? "opacity-50" : ""}`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleCompletion(task.id)}
                    className="w-5 h-5 mt-1 rounded border-gray-300"
                  />

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3
                        className={`font-medium ${task.completed ? "line-through text-gray-500" : task.starred ? "text-white" : "text-gray-800"}`}
                      >
                        {task.title}
                      </h3>
                      <button
                        onClick={() => handleToggleStar(task.id)}
                        className={`transition-colors ${task.starred ? "text-white hover:text-yellow-400" : "text-gray-400 hover:text-yellow-500"}`}
                      >
                        <Star
                          className={`w-5 h-5 transition-colors ${task.starred ? "fill-yellow-400 text-yellow-500" : ""}`}
                        />
                      </button>
                    </div>

                    <div
                      className={`flex items-center flex-wrap gap-x-4 gap-y-2 text-sm ${task.starred ? "text-gray-300" : "text-gray-600"}`}
                    >
                      {/* Assignees */}
                      <div className="flex items-center gap-2">
                        {task.assignees.map((name) => (
                          <span
                            key={name}
                            className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.starred ? "bg-white/10 text-gray-200" : "bg-gray-100 text-gray-700"}`}
                          >
                            {name}
                          </span>
                        ))}
                      </div>

                      {/* Due Date */}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(task.due_date)}</span>
                      </div>

                      {/* Subtasks */}
                      <div className="flex items-center gap-1.5">
                        <Bell className="w-4 h-4" />
                        <span>
                          Subtasks: {task.subtasks_completed}/{task.subtasks_total}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status and Priority */}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="secondary"
                      className={`font-medium text-xs ${task.starred ? "bg-white/10 text-gray-200" : getStatusColor(task.status)}`}
                    >
                      {task.status}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={`font-medium text-xs ${task.starred ? "bg-white/10 text-gray-200" : getPriorityColor(task.priority)}`}
                    >
                      {task.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {filteredTasks.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-500">
                {searchQuery || activeFilter !== "All"
                  ? "No tasks found matching your criteria."
                  : "No tasks yet. Click 'Add Task' to get started!"}
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
