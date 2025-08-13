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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Filter, List, Grid3X3, Calendar, Star, Bell, Plus, Loader2, Trash2, Pencil, Columns } from "lucide-react"
import { useState, useEffect } from "react"
import { getTasks, toggleTaskCompletion, toggleTaskStar, reorderTasks, deleteTask, updateTask, type Task } from "@/lib/tasks"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { TaskAnnouncement } from "@/components/task-announcement"

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
  
  // Temporary: Log user ID to console for RLS migration
  useEffect(() => {
    if (user?.id) {
      console.log("🔑 Your Clerk User ID:", user.id)
      console.log("Copy this ID for your RLS migration!")
    }
  }, [user?.id])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState("All")
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"list" | "card" | "kanban">("list")
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const router = useRouter()

  const filters = ["All", "Today", "In Progress", "Completed"]

  // Load tasks from Supabase and set up real-time subscription
  useEffect(() => {
    if (user?.id) {
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
    }
  }, [user?.id])

  const loadTasks = async () => {
    if (!user?.id) {
      console.log("User not authenticated, skipping task load")
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const data = await getTasks(user.id)
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

  const filteredTasks = tasks
    .filter((task) => {
      // Hide completed tasks unless viewing "Completed" filter
      if (task.completed && activeFilter !== "Completed") return false
      
      const matchesFilter =
        activeFilter === "All" ||
        (activeFilter === "Today" && task.starred) ||
        (activeFilter !== "Today" && task.status === activeFilter)
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.assignees.some((assignee: string) => assignee.toLowerCase().includes(searchQuery.toLowerCase()))
      return matchesFilter && matchesSearch
    })
    .sort((a, b) => {
      // If both have same completion status, maintain their order
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

    // Update local state immediately for better UX
    setTasks(updatedTasks)
    setDraggedTask(null)

    try {
      // Update order in database
      if (user?.id) {
        await reorderTasks(updatedTasks.map((task) => task.id), user.id)
      }
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

  const handleKanbanDrop = async (e: React.DragEvent, columnType: string) => {
    e.preventDefault()
    
    if (!draggedTask) return

    const task = tasks.find((t) => t.id === draggedTask)
    if (!task) return

    let updates: Partial<Task> = {}

    if (columnType === "today") {
      updates.starred = true
    } else {
      updates.starred = false
      updates.priority = columnType.charAt(0).toUpperCase() + columnType.slice(1) as "High" | "Medium" | "Low"
    }

    try {
      if (user?.id) {
        await updateTask(draggedTask, updates, user.id)
        setTasks(tasks.map((t) => t.id === draggedTask ? { ...t, ...updates } : t))
      }
      toast({
        title: "Success",
        description: `Task moved to ${columnType === "today" ? "Today" : columnType + " priority"} column.`,
      })
    } catch (error) {
      console.error("Failed to update task:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
    }
    
    setDraggedTask(null)
  }

  const handleToggleCompletion = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      // If marking as complete and not in Completed filter, add fade animation
      if (!task.completed && activeFilter !== "Completed") {
        setFadingTasks(prev => new Set(prev).add(taskId))
        
        // Wait for animation to complete before updating
        setTimeout(async () => {
          if (user?.id) {
            const updatedTask = await toggleTaskCompletion(taskId, user.id)
            setTasks(tasks.map((t) => (t.id === taskId ? updatedTask : t)))
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
          const updatedTask = await toggleTaskCompletion(taskId, user.id)
          setTasks(tasks.map((t) => (t.id === taskId ? updatedTask : t)))
        }
        toast({
          title: "Success",
          description: `Task ${updatedTask.completed ? "completed" : "reopened"} successfully.`,
        })
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

  const handleToggleStar = async (taskId: string) => {
    if (!user?.id) return
    
    try {
      const updatedTask = await toggleTaskStar(taskId, user.id)
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
        await deleteTask(taskToDelete.id, user.id)
        setTasks(tasks.filter((task) => task.id !== taskToDelete.id))
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <div className="topbar h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
          <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
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
      <TaskAnnouncement />
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
                <h1 className="text-3xl font-medium">Todo List</h1>
                {user && (
                  <p className="text-sm text-muted-foreground mt-1">Welcome back, {user.firstName || "there"}!</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={loadTasks} disabled={loading} className="bg-white">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  Refresh
                </Button>
                <Button className="bg-black hover:bg-gray-800" onClick={() => router.push("/add-task")}>
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
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`rounded-r-none ${viewMode === "list" ? "bg-gray-100" : ""}`}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`border-x ${viewMode === "card" ? "bg-gray-100" : ""}`}
                    onClick={() => setViewMode("card")}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`rounded-l-none ${viewMode === "kanban" ? "bg-gray-100" : ""}`}
                    onClick={() => setViewMode("kanban")}
                  >
                    <Columns className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Task List/Grid/Kanban */}
            {viewMode === "kanban" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Today Column */}
                <div 
                  className="bg-gray-50 rounded-lg p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleKanbanDrop(e, "today")}
                >
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    Today
                  </h3>
                  <div className="space-y-2">
                    {filteredTasks.filter(task => task.starred && !task.completed).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 bg-white rounded-md shadow-sm hover:shadow-md transition-all cursor-move ${
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
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/edit-task/${task.id}`)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-red-600 hover:bg-red-50"
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
                  className="bg-gray-50 rounded-lg p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleKanbanDrop(e, "high")}
                >
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    High Priority
                  </h3>
                  <div className="space-y-2">
                    {filteredTasks.filter(task => !task.starred && task.priority === "High" && !task.completed).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 bg-white rounded-md shadow-sm hover:shadow-md transition-all cursor-move ${
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
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/edit-task/${task.id}`)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-red-600 hover:bg-red-50"
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
                  className="bg-gray-50 rounded-lg p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleKanbanDrop(e, "medium")}
                >
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    Medium Priority
                  </h3>
                  <div className="space-y-2">
                    {filteredTasks.filter(task => !task.starred && task.priority === "Medium" && !task.completed).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 bg-white rounded-md shadow-sm hover:shadow-md transition-all cursor-move ${
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
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/edit-task/${task.id}`)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-red-600 hover:bg-red-50"
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
                  className="bg-gray-50 rounded-lg p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleKanbanDrop(e, "low")}
                >
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-500" />
                    Low Priority
                  </h3>
                  <div className="space-y-2">
                    {filteredTasks.filter(task => !task.starred && task.priority === "Low" && !task.completed).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className={`p-3 bg-white rounded-md shadow-sm hover:shadow-md transition-all cursor-move ${
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
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/edit-task/${task.id}`)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-red-600 hover:bg-red-50"
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
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
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
                    task.starred ? "bg-[#214b88] text-white shadow-lg" : "bg-white border-gray-200"
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
                          <div className="flex items-center gap-2">
                            {task.assignees.map((name: string) => (
                              <span
                                key={name}
                                className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.starred ? "bg-white/10 text-gray-200" : "bg-gray-100 text-gray-700"}`}
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
                        </div>
                      </div>

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
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${task.starred ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/edit-task/${task.id}`)
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${task.starred ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-red-600 hover:bg-red-50"}`}
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
                          onClick={() => handleToggleStar(task.id)}
                          className={`transition-colors ${task.starred ? "text-white hover:text-yellow-400" : "text-gray-400 hover:text-yellow-500"}`}
                        >
                          <Star
                            className={`w-5 h-5 transition-colors ${task.starred ? "fill-yellow-400 text-yellow-500" : ""}`}
                          />
                        </button>
                      </div>

                      <div className="flex-1">
                        <h3
                          className={`font-medium text-base mb-3 line-clamp-2 ${task.completed ? "line-through text-gray-500" : task.starred ? "text-white" : "text-gray-800"}`}
                        >
                          {task.title}
                        </h3>

                        <div className={`space-y-2 text-sm ${task.starred ? "text-gray-300" : "text-gray-600"}`}>
                          {task.assignees.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {task.assignees.map((name: string) => (
                                <span
                                  key={name}
                                  className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.starred ? "bg-white/10 text-gray-200" : "bg-gray-100 text-gray-700"}`}
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
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                        <div className="flex items-center gap-2">
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
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${task.starred ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/edit-task/${task.id}`)
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${task.starred ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-red-600 hover:bg-red-50"}`}
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
              ))}
              </div>
            )}

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
