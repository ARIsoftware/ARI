"use client"

import type React from "react"
import { useSupabase } from "@/components/providers"
import { DM_Sans } from "next/font/google"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Filter, List, Grid3X3, Calendar, Pin, Bell, Plus, Loader2, Trash2, Pencil, Columns, Play, Activity } from "lucide-react"
import { useState, useEffect } from "react"
import { getFitnessTasks, toggleFitnessTaskCompletion, toggleFitnessTaskPin, reorderFitnessTasks, deleteFitnessTask, updateFitnessTask, type FitnessTask, addSampleFitnessTasks } from "@/modules-core/daily-fitness/lib/fitness"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { YouTubeModal } from "@/components/youtube-modal"
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

export default function DailyFitnessPage() {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const { toast } = useToast()
  const [tasks, setTasks] = useState<FitnessTask[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState("All")
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"list" | "card" | "kanban">("list")
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<FitnessTask | null>(null)
  const [videoModalOpen, setVideoModalOpen] = useState(false)
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string>("")
  const [selectedVideoTitle, setSelectedVideoTitle] = useState<string>("")
  const router = useRouter()

  const filters = ["All", "Pinned", "In Progress", "Completed"]

  // Load tasks from Supabase and set up real-time subscription
  useEffect(() => {
    if (user?.id) {
      loadTasks()

      // Set up real-time subscription
      const channel = supabase
        .channel("fitness_database-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "fitness_database",
          },
          (payload) => {
            console.log("Real-time update:", payload)

            if (payload.eventType === "INSERT") {
              setTasks((prev) => [payload.new as FitnessTask, ...prev])
            } else if (payload.eventType === "UPDATE") {
              setTasks((prev) => prev.map((task) => (task.id === payload.new.id ? (payload.new as FitnessTask) : task)))
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

      const tokenFn = async () => session?.access_token || null
      const data = await getFitnessTasks(tokenFn)

      // If no tasks exist, add sample tasks
      if (data.length === 0) {
        console.log("No tasks found, adding sample tasks...")
        await addSampleFitnessTasks(tokenFn)
        const newData = await getFitnessTasks(tokenFn)
        setTasks(newData)
      } else {
        setTasks(data)
      }
    } catch (error) {
      console.error("Failed to load fitness tasks:", error)
      toast({
        title: "Error",
        description: "Failed to load fitness tasks. Please try again.",
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
        (activeFilter === "Pinned" && task.pinned) ||
        (activeFilter !== "Pinned" && task.status === activeFilter)
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.assignees.some((assignee: string) => assignee.toLowerCase().includes(searchQuery.toLowerCase()))
      return matchesFilter && matchesSearch
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

    // Update local state immediately for better UX
    setTasks(updatedTasks)
    setDraggedTask(null)

    try {
      // Update order in database
      if (user?.id) {
        const tokenFn = async () => session?.access_token || null
        await reorderFitnessTasks(updatedTasks.map((task) => task.id), tokenFn)
      }
    } catch (error) {
      console.error("Failed to reorder fitness tasks:", error)
      // Revert local state on error
      setTasks(tasks)
      toast({
        title: "Error",
        description: "Failed to reorder fitness tasks. Please try again.",
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

    let updates: Partial<FitnessTask> = {}

    if (columnType === "pinned") {
      updates.pinned = true
    } else {
      updates.pinned = false
      updates.priority = columnType.charAt(0).toUpperCase() + columnType.slice(1) as "High" | "Medium" | "Low"
    }

    try {
      if (user?.id) {
        const tokenFn = async () => session?.access_token || null
        await updateFitnessTask(draggedTask, updates, tokenFn)
        setTasks(tasks.map((t) => t.id === draggedTask ? { ...t, ...updates } : t))
      }
      toast({
        title: "Success",
        description: `Exercise moved to ${columnType === "pinned" ? "Pinned" : columnType + " priority"} column.`,
      })
    } catch (error) {
      console.error("Failed to update fitness task:", error)
      toast({
        title: "Error",
        description: "Failed to update exercise. Please try again.",
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

        // Trigger confetti after 1 second
        setTimeout(() => {
          schoolPride()
        }, 1000)

        // Wait for animation to complete before updating
        setTimeout(async () => {
          if (user?.id) {
            const tokenFn = async () => session?.access_token || null
            const updatedTask = await toggleFitnessTaskCompletion(taskId, task.completed, tokenFn)
            setTasks(tasks.map((t) => (t.id === taskId ? updatedTask : t)))
          }
          setFadingTasks(prev => {
            const newSet = new Set(prev)
            newSet.delete(taskId)
            return newSet
          })
          toast({
            title: "Success",
            description: "Exercise completed successfully.",
          })
        }, 300)
      } else {
        // If uncompleting or in Completed view, update immediately
        if (user?.id) {
          const tokenFn = async () => session?.access_token || null
          const updatedTask = await toggleFitnessTaskCompletion(taskId, task.completed, tokenFn)
          setTasks(tasks.map((t) => (t.id === taskId ? updatedTask : t)))

          // Trigger confetti only if completing (not uncompleting) - with 1 second delay
          if (updatedTask.completed) {
            setTimeout(() => {
              schoolPride()
            }, 1000)
          }

          toast({
            title: "Success",
            description: `Exercise ${updatedTask.completed ? "completed" : "reopened"} successfully.`,
          })
        }
      }
    } catch (error) {
      console.error("Failed to toggle fitness task completion:", error)
      toast({
        title: "Error",
        description: "Failed to update fitness task. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleTogglePin = async (taskId: string) => {
    if (!user?.id) return

    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      const tokenFn = async () => session?.access_token || null
      const updatedTask = await toggleFitnessTaskPin(taskId, task.pinned, tokenFn)
      setTasks(tasks.map((task) => (task.id === taskId ? updatedTask : task)))
    } catch (error) {
      console.error("Failed to toggle fitness task pin:", error)
      toast({
        title: "Error",
        description: "Failed to update fitness task. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteFitnessTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      setTaskToDelete(task)
      setDeleteDialogOpen(true)
    }
  }

  const confirmDeleteFitnessTask = async () => {
    if (!taskToDelete) return

    try {
      if (user?.id) {
        const tokenFn = async () => session?.access_token || null
        await deleteFitnessTask(taskToDelete.id, tokenFn)
        setTasks(tasks.filter((task) => task.id !== taskToDelete.id))
      }
      toast({
        title: "Success",
        description: "Exercise deleted successfully.",
      })
    } catch (error) {
      console.error("Failed to delete fitness task:", error)
      toast({
        title: "Error",
        description: "Failed to delete exercise. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeleteDialogOpen(false)
      setTaskToDelete(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading fitness tasks...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium">Daily Fitness</h1>
          {user && (
            <p className="text-sm text-muted-foreground mt-1">Welcome back, {user.firstName || "there"}!</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadTasks} disabled={loading} className="bg-white">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).testExerciseReminder) {
                (window as any).testExerciseReminder()
              }
            }}
            className="bg-white"
            title="Test exercise reminder"
          >
            <Activity className="w-4 h-4 mr-2" />
            Test Reminder
          </Button>
          <Button className="bg-black hover:bg-gray-800" onClick={() => router.push("/add-fitness")}>
            <Plus className="w-4 h-4 mr-2" />
            Add Exercise
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
              placeholder="Search exercises..."
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
          {/* Pinned Column */}
          <div
            className="bg-gray-50 rounded-lg p-4"
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
                    {task.youtube_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-gray-400 hover:text-green-600 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedVideoUrl(task.youtube_url || "")
                          setSelectedVideoTitle(task.title)
                          setVideoModalOpen(true)
                        }}
                      >
                        <Play className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/edit-fitness/${task.id}`)
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
                        handleDeleteFitnessTask(task.id)
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
              {filteredTasks.filter(task => !task.pinned && task.priority === "High" && !task.completed).map((task) => (
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
                    {task.youtube_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-gray-400 hover:text-green-600 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedVideoUrl(task.youtube_url || "")
                          setSelectedVideoTitle(task.title)
                          setVideoModalOpen(true)
                        }}
                      >
                        <Play className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/edit-fitness/${task.id}`)
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
                        handleDeleteFitnessTask(task.id)
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
              {filteredTasks.filter(task => !task.pinned && task.priority === "Medium" && !task.completed).map((task) => (
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
                    {task.youtube_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-gray-400 hover:text-green-600 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedVideoUrl(task.youtube_url || "")
                          setSelectedVideoTitle(task.title)
                          setVideoModalOpen(true)
                        }}
                      >
                        <Play className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/edit-fitness/${task.id}`)
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
                        handleDeleteFitnessTask(task.id)
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
              {filteredTasks.filter(task => !task.pinned && task.priority === "Low" && !task.completed).map((task) => (
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
                    {task.youtube_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-gray-400 hover:text-green-600 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedVideoUrl(task.youtube_url || "")
                          setSelectedVideoTitle(task.title)
                          setVideoModalOpen(true)
                        }}
                      >
                        <Play className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/edit-fitness/${task.id}`)
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
                        handleDeleteFitnessTask(task.id)
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
            <>
              {needsSpacing && viewMode === "list" && (
                <div key={`spacer-${task.id}`} className="h-[30px]" />
              )}
              {needsSpacing && viewMode === "card" && (
                <div key={`spacer-${task.id}`} className="col-span-full h-[30px]" />
              )}
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
                  task.pinned ? "bg-[#214b88] text-white shadow-lg" : "bg-white border-gray-200"
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
                      className={`font-medium ${task.completed ? "line-through text-gray-500" : task.pinned ? "text-white" : "text-gray-800"}`}
                    >
                      {task.title}
                    </h3>
                    <button
                      onClick={() => handleTogglePin(task.id)}
                      className="transition-colors"
                    >
                      <Pin
                        className={`w-5 h-5 ${task.pinned ? "text-white" : "text-gray-400 hover:text-[hsl(var(--primary))]"}`}
                        fill={task.pinned ? "white" : "none"}
                      />
                    </button>
                  </div>

                  <div
                    className={`flex items-center flex-wrap gap-x-4 gap-y-2 text-sm ${task.pinned ? "text-gray-300" : "text-gray-600"}`}
                  >
                    <div className="flex items-center gap-2">
                      {task.assignees.map((name: string) => (
                        <span
                          key={name}
                          className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.pinned ? "bg-white/10 text-gray-200" : "bg-gray-100 text-gray-700"}`}
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
                        Reps: {task.subtasks_completed}/{task.subtasks_total}
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
                  {task.youtube_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedVideoUrl(task.youtube_url || "")
                        setSelectedVideoTitle(task.title)
                        setVideoModalOpen(true)
                      }}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/edit-fitness/${task.id}`)
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-red-600 hover:bg-red-50"}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteFitnessTask(task.id)
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
                      className={`w-5 h-5 ${task.pinned ? "text-white" : "text-gray-400 hover:text-[hsl(var(--primary))]"}`}
                      fill={task.pinned ? "white" : "none"}
                    />
                  </button>
                </div>

                <div className="flex-1">
                  <h3
                    className={`font-medium text-base mb-3 line-clamp-2 ${task.completed ? "line-through text-gray-500" : task.pinned ? "text-white" : "text-gray-800"}`}
                  >
                    {task.title}
                  </h3>

                  <div className={`space-y-2 text-sm ${task.pinned ? "text-gray-300" : "text-gray-600"}`}>
                    {task.assignees.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {task.assignees.map((name: string) => (
                          <span
                            key={name}
                            className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.pinned ? "bg-white/10 text-gray-200" : "bg-gray-100 text-gray-700"}`}
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
                        Reps: {task.subtasks_completed}/{task.subtasks_total}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                  <div className="flex items-center gap-2">
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
                  </div>
                  <div className="flex items-center gap-1">
                    {task.youtube_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedVideoUrl(task.youtube_url || "")
                          setSelectedVideoTitle(task.title)
                          setVideoModalOpen(true)
                        }}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/edit-fitness/${task.id}`)
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${task.pinned ? "text-gray-300 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-red-600 hover:bg-red-50"}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteFitnessTask(task.id)
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
            </>
          )
        })}
        </div>
      )}

      {filteredTasks.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          {searchQuery || activeFilter !== "All"
            ? "No exercises found matching your criteria."
            : "No exercises yet. Click 'Add Exercise' to get started!"}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Exercise</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the exercise "{taskToDelete?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteFitnessTask}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* YouTube Video Modal */}
      <YouTubeModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        videoUrl={selectedVideoUrl}
        title={selectedVideoTitle}
      />
    </div>
  )
}
