"use client"

import type React from "react"
import { Fragment } from "react"
import { useAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Filter, List, Grid3X3, Calendar, Pin, ListChecks, ChevronDown, Plus, Trash2, Pencil, Columns, Table, BarChart3, LineChart, GripVertical, RotateCcw } from "lucide-react"
import { useState, useEffect, useMemo, useRef } from "react"
import { toggleTaskCompletion, toggleTaskPin, reorderTasks, updateTask, agentStatusDotClass, type Task } from "../lib/utils"
import { playTaskSound, primeTaskSoundUnlock } from "../lib/task-sounds"
import { TaskSoundToggle } from "../components/task-sound-toggle"
import { useTasks, useDeletedTasks, useDeleteTask, useSetTaskDeleted } from "../hooks/use-tasks"
import { TaskSubtasks } from "../components/task-subtasks"
import { useQueryClient } from "@tanstack/react-query"
import type { MajorProject } from "../types"
import { useModuleEnabled } from "@/lib/modules/module-hooks"
import { useToast } from "@/hooks/use-toast"
import { useRouter, useSearchParams } from "next/navigation"
import { schoolPride } from "@/lib/confetti"

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
  return isStarred ? "text-[hsl(var(--primary-foreground))]/75 dark:text-[hsl(var(--muted-foreground))]" : "text-muted-foreground"
}

const getProjectName = (projectId: string | null | undefined, projects: MajorProject[]): string | null => {
  if (!projectId) return null
  const project = projects.find(p => p.id === projectId)
  return project ? project.project_name : null
}

/**
 * AssignedAgentBadge — renders the assigned agent's pixel face if the Agents
 * module is enabled. Decoupled from the Agents module by design: only
 * fetches metadata + uses the SVG avatar endpoint, never imports any
 * Agents components. Renders nothing when the module is disabled or the
 * fetch fails (so this page works whether or not Agents is installed).
 */
function AssignedAgentBadge({ agentId }: { agentId: string }) {
  const { enabled: agentsEnabled } = useModuleEnabled('agents')
  const [agent, setAgent] = useState<{ name: string; status: string } | null>(null)
  useEffect(() => {
    if (!agentsEnabled) return
    let cancelled = false
    fetch(`/api/modules/agents/agents/${encodeURIComponent(agentId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data?.agent) setAgent({ name: data.agent.name, status: data.agent.status })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [agentId, agentsEnabled])
  if (!agentsEnabled || !agent) return null
  const dot = agentStatusDotClass(agent.status)
  return (
    <span
      title={`Assigned to ${agent.name}`}
      className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-muted/50 border border-border text-xs"
    >
      <span className="relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/modules/agents/agents/${encodeURIComponent(agentId)}/avatar`}
          alt=""
          aria-hidden
          width={20}
          height={20}
          style={{ width: 20, height: 20, imageRendering: 'pixelated', borderRadius: 4, display: 'block' }}
        />
        <span className={`absolute -bottom-0.5 -right-0.5 inline-block h-1.5 w-1.5 rounded-full ring-1 ring-background ${dot}`} />
      </span>
      <span className="font-medium">{agent.name}</span>
    </span>
  )
}

/**
 * "Subtasks: x/y" expander shared by the list and card views so the two
 * copies can't drift; aria-expanded conveys the state the chevron shows.
 */
function SubtaskToggle({
  task,
  expanded,
  onToggle,
  small = false,
}: {
  task: Task
  expanded: boolean
  onToggle: () => void
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`flex items-center gap-1.5 transition-colors ${task.pinned ? "hover:text-[hsl(var(--primary-foreground))] dark:hover:text-[hsl(var(--foreground))]" : "hover:text-foreground"}`}
    >
      <ListChecks className="w-4 h-4" />
      <span className={small ? "text-xs" : undefined}>
        Subtasks: {task.subtasks_completed}/{task.subtasks_total}
      </span>
      <ChevronDown
        className={`${small ? "w-3 h-3" : "w-3.5 h-3.5"} transition-transform ${expanded ? "" : "-rotate-90"}`}
      />
    </button>
  )
}

export default function TasksPage() {
  const { session } = useAuth()
  const user = session?.user
  const { toast } = useToast()
  const { enabled: majorProjectsEnabled } = useModuleEnabled('major-projects')
  const searchParams = useSearchParams()

  // TanStack Query for tasks - replaces local state + realtime subscription
  const queryClient = useQueryClient()
  const { data: tasks = [], isLoading: loading, refetch: refetchTasks } = useTasks()
  const deleteTaskMutation = useDeleteTask()
  const setTaskDeletedMutation = useSetTaskDeleted()

  const [activeFilter, setActiveFilter] = useState("All")
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  // Rows are draggable, but a drag only actually starts when the gesture began
  // on a grip handle. The handle's onMouseDown arms this ref; handleDragStart
  // cancels any drag that wasn't armed, and dragEnd/mouseUp disarms it. A ref
  // (not state) avoids a re-render race with the browser's dragstart.
  const dragFromHandleRef = useRef(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"list" | "card" | "kanban" | "table">("list")
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set())
  // Per-task override of subtask visibility. Unset = default, which is
  // visible whenever the task has subtasks.
  const [subtaskVisibility, setSubtaskVisibility] = useState<Record<string, boolean>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const [projects, setProjects] = useState<MajorProject[]>([])
  const router = useRouter()
  const projectFilter = searchParams.get('filter')

  const filters = ["All", "Pinned", "In Progress", "Completed", "Deleted"]

  // Soft-deleted tasks for the "Deleted" tab. Fetched only while that tab is
  // open; invalidating ['tasks'] refreshes this alongside the active list.
  const { data: deletedTasks = [], isLoading: deletedLoading } = useDeletedTasks(activeFilter === "Deleted")

  // Unlock audio on the first user gesture so hover sounds aren't blocked by the
  // browser autoplay policy on a fresh load.
  useEffect(() => {
    primeTaskSoundUnlock()
  }, [])

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

  // The "Deleted" tab draws from its own query (soft-deleted rows only). Search
  // and the project filter still apply; most-recently-deleted shows first.
  const filteredDeletedTasks = deletedTasks
    .filter((task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.assignees ?? []).some((assignee: string) => assignee.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesProject = !projectFilter || task.project_id === projectFilter
      return matchesSearch && matchesProject
    })
    // Most-recently-deleted first. deleted_at is stamped at delete time; fall
    // back to updated_at for any legacy row soft-deleted before the column.
    .sort((a, b) =>
      new Date(b.deleted_at ?? b.updated_at).getTime() - new Date(a.deleted_at ?? a.updated_at).getTime()
    )

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    // Ignore drags that didn't begin on the row's grip handle.
    if (!dragFromHandleRef.current) {
      e.preventDefault()
      return
    }
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

    // Optimistic cache update, then persist the new order to the server.
    setTasksCache(() => updatedTasks)
    setDraggedTask(null)

    try {
      if (user?.id) {
        await reorderTasks(updatedTasks.map((task) => task.id))
        invalidateTasks() // Sync with server
      }
    } catch (error) {
      console.error("Failed to reorder tasks:", error)
      invalidateTasks() // Revert to the server's order on failure
      toast({
        title: "Error",
        description: "Failed to reorder tasks. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDragEnd = () => {
    setDraggedTask(null)
    dragFromHandleRef.current = false
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
        await updateTask(taskId, updates)
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

      // Play the tactile sound on the click itself so it feels instant, even
      // when the completion write is deferred behind the fade animation below.
      playTaskSound(task.completed ? "uncomplete" : "complete")

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
            await toggleTaskCompletion(taskId)
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
          const updatedTask = await toggleTaskCompletion(taskId)
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

  const isSubtasksVisible = (task: Task) =>
    subtaskVisibility[task.id] ?? (task.subtasks_total ?? 0) > 0

  const toggleSubtasksExpanded = (task: Task) => {
    playTaskSound("tab")
    setSubtaskVisibility(prev => ({ ...prev, [task.id]: !isSubtasksVisible(task) }))
  }

  // Segmented switches — play the soft "tab" tick only on an actual change so
  // re-clicking the current tab/view stays silent.
  const changeFilter = (filter: string) => {
    if (filter !== activeFilter) playTaskSound("tab")
    setActiveFilter(filter)
  }

  const changeViewMode = (mode: "list" | "card" | "kanban" | "table") => {
    if (mode !== viewMode) playTaskSound("tab")
    setViewMode(mode)
  }

  const handleTogglePin = async (taskId: string) => {
    if (!user?.id) return

    playTaskSound("tap")
    try {
      await toggleTaskPin(taskId)
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

  // Trash on an active task → confirm, then soft delete (move to the Deleted
  // tab). taskToDelete.deleted stays false here, so the dialog + confirm handler
  // run the soft-delete branch.
  const handleDeleteTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      setTaskToDelete(task)
      setDeleteDialogOpen(true)
    }
  }

  // Red trash on an already-deleted task → confirm, then permanently remove it
  // from the database. taskToDelete.deleted is true, so confirm runs the hard
  // delete branch.
  const handlePermanentDelete = (task: Task) => {
    setTaskToDelete(task)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return
    // No authenticated user → do nothing (and don't claim success).
    if (!user?.id) {
      setDeleteDialogOpen(false)
      setTaskToDelete(null)
      return
    }

    const permanent = !!taskToDelete.deleted
    const target = taskToDelete

    try {
      playTaskSound("delete")
      // Both mutations own their optimistic cache updates + rollback-on-error.
      if (permanent) {
        await deleteTaskMutation.mutateAsync(target.id)
      } else {
        await setTaskDeletedMutation.mutateAsync({ id: target.id, deleted: true })
      }
      toast({
        title: "Success",
        description: permanent ? "Task permanently deleted." : "Task moved to Deleted.",
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

  // Restore a soft-deleted task back to the active list. The mutation owns the
  // optimistic removal + rollback; a completed task reappears under the
  // Completed tab, so the toast says where it went to avoid "did it work?".
  const restoreTask = async (task: Task) => {
    playTaskSound("tap")
    try {
      await setTaskDeletedMutation.mutateAsync({ id: task.id, deleted: false })
      toast({
        title: "Restored",
        description: task.completed
          ? `"${task.title}" was restored to the Completed tab.`
          : `"${task.title}" was restored.`,
      })
    } catch (error) {
      console.error("Failed to restore task:", error)
      toast({
        title: "Error",
        description: "Failed to restore task. Please try again.",
        variant: "destructive",
      })
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
                <TaskSoundToggle />
                <Button variant="outline" onClick={() => { playTaskSound("button"); router.push("/tasks/radar") }}>
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Priority Radar
                </Button>
                <Button variant="outline" onClick={() => { playTaskSound("button"); router.push("/tasks/analytics") }}>
                  <LineChart className="w-4 h-4 mr-2" />
                  Analytics
                </Button>
                <Button onClick={() => { playTaskSound("button"); router.push("/tasks/add") }}>
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
                    onClick={() => changeFilter(filter)}
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
                    onClick={() => changeViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`border-x ${viewMode === "card" ? "bg-muted" : ""}`}
                    onClick={() => changeViewMode("card")}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`border-x ${viewMode === "kanban" ? "bg-muted" : ""}`}
                    onClick={() => changeViewMode("kanban")}
                  >
                    <Columns className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-l-none ${viewMode === "table" ? "bg-muted" : ""}`}
                    onClick={() => changeViewMode("table")}
                  >
                    <Table className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Task List/Grid/Kanban/Table */}
            {activeFilter === "Deleted" ? (
              /* Deleted View — soft-deleted tasks; restore or delete forever */
              <div className="space-y-3">
                {filteredDeletedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-4 p-4 border rounded-lg bg-card border-border hover:shadow-sm transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">{task.title}</h3>
                      <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground mt-2">
                        {(task.assigned_agent_id || (task.assignees?.length ?? 0) > 0) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {task.assigned_agent_id && <AssignedAgentBadge agentId={task.assigned_agent_id} />}
                            {(task.assignees ?? []).map((name: string) => (
                              <span
                                key={name}
                                className="px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(task.due_date)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant="secondary"
                        className={`font-medium text-xs ${getStatusColor(task.status)}`}
                      >
                        {task.status}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`font-medium text-xs ${getPriorityColor(task.priority)}`}
                      >
                        {task.priority}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Restore task"
                        title="Restore task"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-muted"
                        onClick={(e) => {
                          e.stopPropagation()
                          restoreTask(task)
                        }}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete permanently"
                        title="Delete permanently"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePermanentDelete(task)
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {filteredDeletedTasks.length === 0 && !deletedLoading && (
                  <div className="text-center py-12 text-muted-foreground">
                    {searchQuery
                      ? "No deleted tasks match your search."
                      : "Nothing here. Deleted tasks are kept in this tab until you permanently delete them."}
                  </div>
                )}
              </div>
            ) : viewMode === "table" ? (
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
                            <div className="flex flex-wrap items-center gap-1.5">
                              {task.assigned_agent_id && <AssignedAgentBadge agentId={task.assigned_agent_id} />}
                              {task.assignees?.length > 0 ? (
                                (task.assignees ?? []).map((name: string) => (
                                  <span
                                    key={name}
                                    className="px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground"
                                  >
                                    {name}
                                  </span>
                                ))
                              ) : !task.assigned_agent_id ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : null}
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
                      onMouseEnter={() => playTaskSound("hover")}
                      className={`${
                        viewMode === "card"
                          ? "flex flex-col gap-3 p-4 border rounded-lg hover:shadow-md transition-all h-full"
                          : "flex items-start gap-4 p-4 border rounded-lg hover:shadow-sm transition-all"
                      } hover:scale-[1.01] ${
                        task.pinned ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg dark:bg-transparent dark:text-[hsl(var(--foreground))] dark:border-[hsl(var(--primary))] dark:shadow-none" : "bg-card border-border"
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
                            className={`font-medium ${task.completed ? "line-through text-muted-foreground" : task.pinned ? "text-[hsl(var(--primary-foreground))] dark:text-[hsl(var(--foreground))]" : "text-foreground"}`}
                          >
                            {task.title}
                          </h3>
                          <button
                            onClick={() => handleTogglePin(task.id)}
                            className="transition-colors"
                          >
                            <Pin
                              className={`w-5 h-5 ${task.pinned ? "text-[hsl(var(--primary-foreground))] dark:text-[hsl(var(--primary))]" : "text-muted-foreground hover:text-[hsl(var(--primary))]"}`}
                              fill={task.pinned ? "currentColor" : "none"}
                            />
                          </button>
                        </div>

                        <div
                          className={`flex items-center flex-wrap gap-x-4 gap-y-2 text-sm ${task.pinned ? "text-[hsl(var(--primary-foreground))]/75 dark:text-[hsl(var(--muted-foreground))]" : "text-muted-foreground"}`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            {task.assigned_agent_id && <AssignedAgentBadge agentId={task.assigned_agent_id} />}
                            {(task.assignees ?? []).map((name: string) => (
                              <span
                                key={name}
                                className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.pinned ? "bg-[hsl(var(--primary-foreground))]/15 text-[hsl(var(--primary-foreground))]/90 dark:bg-[hsl(var(--muted))] dark:text-[hsl(var(--muted-foreground))]" : "bg-muted text-muted-foreground"}`}
                              >
                                {name}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(task.due_date)}</span>
                          </div>

                          <SubtaskToggle
                            task={task}
                            expanded={isSubtasksVisible(task)}
                            onToggle={() => toggleSubtasksExpanded(task)}
                          />

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
                          className={`font-medium text-xs ${task.pinned ? "bg-[hsl(var(--primary-foreground))]/15 text-[hsl(var(--primary-foreground))]/90 dark:bg-[hsl(var(--muted))] dark:text-[hsl(var(--muted-foreground))]" : getStatusColor(task.status)}`}
                        >
                          {task.status}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`font-medium text-xs ${task.pinned ? "bg-[hsl(var(--primary-foreground))]/15 text-[hsl(var(--primary-foreground))]/90 dark:bg-[hsl(var(--muted))] dark:text-[hsl(var(--muted-foreground))]" : getPriorityColor(task.priority)}`}
                        >
                          {task.priority}
                        </Badge>
                        {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                          <Badge
                            variant="secondary"
                            className={`font-medium text-xs cursor-pointer ${task.pinned ? "bg-[hsl(var(--primary-foreground))]/15 text-[hsl(var(--primary-foreground))]/90 dark:bg-[hsl(var(--muted))] dark:text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--primary-foreground))]/25 dark:hover:bg-[hsl(var(--muted))]/80" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
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
                            className={`w-4 h-4 ${task.pinned ? "text-[hsl(var(--primary-foreground))] dark:text-[hsl(var(--primary))]" : "text-muted-foreground hover:text-[hsl(var(--primary))]"}`}
                            fill={task.pinned ? "currentColor" : "none"}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${task.pinned ? "text-[hsl(var(--primary-foreground))]/75 hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground))]/15 dark:text-[hsl(var(--muted-foreground))] dark:hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--muted))]" : "text-muted-foreground hover:text-primary hover:bg-muted"}`}
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
                          className={`h-8 w-8 ${task.pinned ? "text-[hsl(var(--primary-foreground))]/75 hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground))]/15 dark:text-[hsl(var(--muted-foreground))] dark:hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--muted))]" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTask(task.id)
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Drag to reorder"
                          title="Drag to reorder"
                          onMouseDown={() => { dragFromHandleRef.current = true }}
                          onMouseUp={() => { dragFromHandleRef.current = false }}
                          onClick={(e) => e.stopPropagation()}
                          className={`h-8 w-8 cursor-grab active:cursor-grabbing ${task.pinned ? "text-[hsl(var(--primary-foreground))]/75 hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground))]/15 dark:text-[hsl(var(--muted-foreground))] dark:hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--muted))]" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                        >
                          <GripVertical className="w-4 h-4" />
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
                              className={`w-4 h-4 ${task.pinned ? "text-[hsl(var(--primary-foreground))] dark:text-[hsl(var(--primary))]" : "text-muted-foreground hover:text-[hsl(var(--primary))]"}`}
                              fill={task.pinned ? "currentColor" : "none"}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${task.pinned ? "text-[hsl(var(--primary-foreground))]/75 hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground))]/15 dark:text-[hsl(var(--muted-foreground))] dark:hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--muted))]" : "text-muted-foreground hover:text-primary hover:bg-muted"}`}
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
                            className={`h-8 w-8 ${task.pinned ? "text-[hsl(var(--primary-foreground))]/75 hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground))]/15 dark:text-[hsl(var(--muted-foreground))] dark:hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--muted))]" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTask(task.id)
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Drag to reorder"
                            title="Drag to reorder"
                            onMouseDown={() => { dragFromHandleRef.current = true }}
                            onMouseUp={() => { dragFromHandleRef.current = false }}
                            onClick={(e) => e.stopPropagation()}
                            className={`h-8 w-8 cursor-grab active:cursor-grabbing ${task.pinned ? "text-[hsl(var(--primary-foreground))]/75 hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground))]/15 dark:text-[hsl(var(--muted-foreground))] dark:hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--muted))]" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                          >
                            <GripVertical className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex-1">
                        <h3
                          className={`font-medium text-base mb-3 line-clamp-2 ${task.completed ? "line-through text-muted-foreground" : task.pinned ? "text-[hsl(var(--primary-foreground))] dark:text-[hsl(var(--foreground))]" : "text-foreground"}`}
                        >
                          {task.title}
                        </h3>

                        <div className={`space-y-2 text-sm ${task.pinned ? "text-[hsl(var(--primary-foreground))]/75 dark:text-[hsl(var(--muted-foreground))]" : "text-muted-foreground"}`}>
                          {(task.assigned_agent_id || (task.assignees?.length ?? 0) > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {task.assigned_agent_id && <AssignedAgentBadge agentId={task.assigned_agent_id} />}
                              {(task.assignees ?? []).map((name: string) => (
                                <span
                                  key={name}
                                  className={`px-2 py-0.5 rounded-md text-xs font-medium ${task.pinned ? "bg-[hsl(var(--primary-foreground))]/15 text-[hsl(var(--primary-foreground))]/90 dark:bg-[hsl(var(--muted))] dark:text-[hsl(var(--muted-foreground))]" : "bg-muted text-muted-foreground"}`}
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

                          <SubtaskToggle
                            task={task}
                            expanded={isSubtasksVisible(task)}
                            onToggle={() => toggleSubtasksExpanded(task)}
                            small
                          />

                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs ${getTaskAgeColor(task.created_at, task.pinned)}`}>
                              {formatTaskAge(task.created_at)}
                            </span>
                          </div>
                        </div>

                        {isSubtasksVisible(task) && (
                          <TaskSubtasks taskId={task.id} pinned={task.pinned} cancelParentDrag />
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap mt-auto pt-2">
                        <Badge
                          variant="secondary"
                          className={`font-medium text-xs ${task.pinned ? "bg-[hsl(var(--primary-foreground))]/15 text-[hsl(var(--primary-foreground))]/90 dark:bg-[hsl(var(--muted))] dark:text-[hsl(var(--muted-foreground))]" : getStatusColor(task.status)}`}
                        >
                          {task.status}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`font-medium text-xs ${task.pinned ? "bg-[hsl(var(--primary-foreground))]/15 text-[hsl(var(--primary-foreground))]/90 dark:bg-[hsl(var(--muted))] dark:text-[hsl(var(--muted-foreground))]" : getPriorityColor(task.priority)}`}
                        >
                          {task.priority}
                        </Badge>
                        {majorProjectsEnabled && task.project_id && getProjectName(task.project_id, projects) && (
                          <Badge
                            variant="secondary"
                            className={`font-medium text-xs cursor-pointer ${task.pinned ? "bg-[hsl(var(--primary-foreground))]/15 text-[hsl(var(--primary-foreground))]/90 dark:bg-[hsl(var(--muted))] dark:text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--primary-foreground))]/25 dark:hover:bg-[hsl(var(--muted))]/80" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/tasks?filter=${task.project_id}`)
                            }}
                          >
                            {getProjectName(task.project_id, projects)}
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                </div>
                    {viewMode === "list" && isSubtasksVisible(task) && (
                      <TaskSubtasks taskId={task.id} variant="inline" />
                    )}
                  </Fragment>
                )
              })}
              </div>
            )}

      {activeFilter !== "Deleted" && filteredTasks.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          {searchQuery || activeFilter !== "All"
            ? "No tasks found matching your criteria."
            : "No tasks yet. Click 'Add Task' to get started!"}
        </div>
      )}

      {/* Delete Confirmation Dialog — soft delete (move to Deleted) for an active
          task, permanent delete for one that's already in the Deleted tab. */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{taskToDelete?.deleted ? "Delete Permanently" : "Move Task to Deleted"}</DialogTitle>
            <DialogDescription>
              {taskToDelete?.deleted
                ? `"${taskToDelete?.title}" will be permanently deleted from the database. This action cannot be undone.`
                : `"${taskToDelete?.title}" will be moved to the Deleted tab. You can restore it or permanently delete it from there.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteTask}>
              {taskToDelete?.deleted ? "Delete Permanently" : "Move to Deleted"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
