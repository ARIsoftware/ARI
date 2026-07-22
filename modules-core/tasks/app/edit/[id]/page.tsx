"use client"

import type React from "react"
import { useAuth } from "@/components/providers"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CalendarIcon, Save, Pin, ArrowLeft, Loader2, Pencil, Info, Compass, Briefcase, ListChecks, CheckCircle2, RotateCcw } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getTasks, updateTask, recordTaskCompleted, toDueDateString } from "@/modules/tasks/lib/utils"
import { playTaskSound } from "@/modules/tasks/lib/task-sounds"
import { TaskSubtasks } from "@/modules/tasks/components/task-subtasks"
import { getGoals, type Goal } from "@/lib/goals"
import type { MajorProject } from "@/modules/tasks/types"
import { useModuleEnabled } from "@/lib/modules/module-hooks"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { calculatePriorityScore, getTaskPriorityLevel } from "@/modules/tasks/lib/priority-utils"
import { AssigneePicker } from "@/modules/tasks/components/assignee-picker"
import { useUnsavedChangesGuard } from "@/modules/tasks/hooks/use-unsaved-changes-guard"
import { UnsavedChangesDialog } from "@/modules/tasks/components/unsaved-changes-dialog"

type TaskEditFormValues = {
  title: string
  notes: string
  assignees: string[]
  assigned_agent_id: string | null
  status: "Pending" | "In Progress" | "Completed"
  priority: "Low" | "Medium" | "High"
  pinned: boolean
  completed: boolean
  impact: number
  severity: number
  timeliness: number
  effort: number
  strategic_fit: number
  project_id: string | null
}

// Stable serializer shared by the baseline capture (on load) and the per-render
// comparison, so "dirty" only reflects real edits to persisted fields.
function taskFormSnapshot(form: TaskEditFormValues, date: Date | undefined): string {
  return JSON.stringify({ ...form, due: toDueDateString(date) })
}

const priorityOptions = [
  { value: "Low", label: "Low Priority", color: "bg-gray-100 text-gray-600" },
  { value: "Medium", label: "Medium Priority", color: "bg-yellow-100 text-yellow-600" },
  { value: "High", label: "High Priority", color: "bg-red-100 text-red-600" },
]

const statusOptions = [
  { value: "Pending", label: "Pending", color: "bg-blue-100 text-blue-600" },
  { value: "In Progress", label: "In Progress", color: "bg-purple-100 text-purple-600" },
  { value: "Completed", label: "Completed", color: "bg-green-100 text-green-600" },
]

const axisDescriptions = {
  impact: "How much this task affects your goals and objectives",
  severity: "How critical or severe the problem/opportunity is",
  timeliness: "How urgent this task is based on deadlines",
  effort: "Amount of resources/time needed (lower is better)",
  strategic_fit: "How well this aligns with your strategic priorities"
}

export default function EditTaskPage() {
  // Get params from URL - works with both direct routing and catch-all module routing
  // For /tasks/edit/[id] the params are { id: '...' }
  // For catch-all /[module]/[[...slug]] the slug is ['edit', '...']
  const params = useParams()
  const id = params.id as string || (params.slug as string[])?.[1]

  const { session } = useAuth()
  const user = session?.user
  const { toast } = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { enabled: majorProjectsEnabled } = useModuleEnabled('major-projects')
  const { enabled: northstarEnabled } = useModuleEnabled('northstar')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [date, setDate] = useState<Date>()
  const [northStars, setNorthStars] = useState<Goal[]>([])
  const [selectedNorthStars, setSelectedNorthStars] = useState<string[]>([])
  const [projects, setProjects] = useState<MajorProject[]>([])
  // Set after a successful save so the follow-up navigation doesn't re-trip the
  // unsaved-changes guard.
  const [justSaved, setJustSaved] = useState(false)
  // Baseline snapshot of the loaded task; compared against the live form.
  const initialSnapshotRef = useRef<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    notes: "",
    assignees: [] as string[],
    assigned_agent_id: null as string | null,
    status: "Pending" as "Pending" | "In Progress" | "Completed",
    priority: "Medium" as "Low" | "Medium" | "High",
    pinned: false,
    completed: false,
    impact: 3,
    severity: 3,
    timeliness: 3,
    effort: 3,
    strategic_fit: 3,
    project_id: null as string | null,
  })

  // Load task data and northstars
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return // Wait for user to be loaded

      try {
        // Load task
        const tasks = await getTasks()
        let foundTask = tasks.find((t) => t.id === id)

        // getTasks() returns active tasks only; a soft-deleted task reached via
        // a direct/bookmarked link won't be there, so check the Deleted set too.
        if (!foundTask) {
          const res = await fetch('/api/modules/tasks?deleted=true')
          if (res.ok) {
            const deleted = (await res.json()) as typeof tasks
            foundTask = deleted.find((t) => t.id === id)
          }
        }

        if (!foundTask) {
          toast({
            title: "Error",
            description: "Task not found.",
            variant: "destructive",
          })
          router.push("/tasks")
          return
        }

        const loaded: TaskEditFormValues = {
          title: foundTask.title,
          notes: foundTask.notes ?? "",
          // Legacy tasks may hold several names. Keep them all — the picker
          // shows the first, but truncating here would silently delete the
          // rest on the next save even if the user never touched the field.
          assignees: foundTask.assignees ?? [],
          assigned_agent_id: foundTask.assigned_agent_id ?? null,
          status: foundTask.status,
          priority: foundTask.priority,
          pinned: foundTask.pinned,
          completed: foundTask.completed,
          impact: foundTask.impact || 3,
          severity: foundTask.severity || 3,
          timeliness: foundTask.timeliness || 3,
          effort: foundTask.effort || 3,
          strategic_fit: foundTask.strategic_fit || 3,
          project_id: foundTask.project_id || null,
        }

        const loadedDate = foundTask.due_date ? new Date(foundTask.due_date) : undefined

        setFormData(loaded)
        setDate(loadedDate)
        // Capture the baseline now, from the same values fed into state, so the
        // first post-load render isn't briefly flagged as dirty.
        initialSnapshotRef.current = taskFormSnapshot(loaded, loadedDate)

        // Load northstars/goals if northstar module is enabled
        if (northstarEnabled) {
          const goals = await getGoals()
          setNorthStars(goals)
        }

        // Load projects if major-projects module is enabled
        if (majorProjectsEnabled) {
          try {
            const res = await fetch('/api/modules/major-projects/data')
            const projectsData = res.ok ? await res.json() : []
            setProjects(projectsData)
          } catch (error) {
            console.error('Failed to load projects:', error)
          }
        }

        // If task has northstar_ids stored (you'll need to add this field to the database)
        // For now, we'll initialize as empty
        setSelectedNorthStars([])

      } catch (error) {
        console.error("Failed to load data:", error)
        toast({
          title: "Error",
          description: "Failed to load data. Please try again.",
          variant: "destructive",
        })
        router.push("/tasks")
      } finally {
        setInitialLoading(false)
      }
    }

    loadData()
  }, [id, router, toast, user?.id, majorProjectsEnabled, northstarEnabled])

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  // Persist the task without navigating. Returns true on success so both the
  // normal save buttons and the unsaved-changes guard can decide where to go.
  const persistTask = async (
    overrides: { completed?: boolean; status?: "Pending" | "In Progress" | "Completed" } = {},
  ): Promise<boolean> => {
    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a task title.",
        variant: "destructive",
      })
      return false
    }

    setLoading(true)

    try {
      const updates = {
        title: formData.title.trim(),
        notes: formData.notes.trim() || null,
        assignees: formData.assignees,
        assigned_agent_id: formData.assigned_agent_id,
        due_date: toDueDateString(date),
        status: formData.status,
        priority: formData.priority,
        pinned: formData.pinned,
        completed: formData.completed,
        impact: formData.impact,
        severity: formData.severity,
        timeliness: formData.timeliness,
        effort: formData.effort,
        strategic_fit: formData.strategic_fit,
        project_id: formData.project_id,
        // Note: northstar_ids would need to be added to the database schema
        // northstar_ids: selectedNorthStars,
        ...overrides,
      }

      await updateTask(id, updates)

      if (overrides.completed === true) {
        await recordTaskCompleted(id)
      }

      playTaskSound(
        overrides.completed === true
          ? "complete"
          : overrides.completed === false
            ? "uncomplete"
            : "edit"
      )

      await queryClient.invalidateQueries({ queryKey: ['tasks'] })

      toast({
        title: "Success",
        description: overrides.completed === true
          ? "Task completed!"
          : overrides.completed === false
            ? "Task reopened."
            : "Task updated successfully!",
      })

      setJustSaved(true)
      return true
    } catch (error) {
      console.error("Failed to update task:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
      return false
    } finally {
      setLoading(false)
    }
  }

  const saveTask = async (overrides: { completed?: boolean; status?: "Pending" | "In Progress" | "Completed" } = {}) => {
    const ok = await persistTask(overrides)
    if (ok) router.push("/tasks")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveTask()
  }

  const handleToggleComplete = async () => {
    await saveTask(
      formData.completed
        ? { completed: false, status: "Pending" }
        : { completed: true, status: "Completed" }
    )
  }

  const priorityScore = calculatePriorityScore({
    impact: formData.impact,
    severity: formData.severity,
    timeliness: formData.timeliness,
    effort: formData.effort,
    strategic_fit: formData.strategic_fit,
  })
  const priorityLevel = getTaskPriorityLevel(priorityScore)

  // Dirty tracking against the loaded baseline. Note: subtasks are managed by
  // <TaskSubtasks> and saved independently, so they're intentionally excluded.
  const currentSnapshot = taskFormSnapshot(formData, date)
  const hasUnsavedChanges =
    !justSaved &&
    initialSnapshotRef.current !== null &&
    currentSnapshot !== initialSnapshotRef.current

  const { pendingHref, isSaving, requestNavigation, closeDialog, discardAndLeave, saveAndLeave } =
    useUnsavedChangesGuard({ hasUnsavedChanges, onSave: () => persistTask() })

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading task...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-medium">Edit Task</h1>
                {user && <p className="text-sm text-muted-foreground mt-1">Update your task details</p>}
              </div>
              <Button variant="outline" onClick={() => requestNavigation("/tasks")} className="bg-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tasks
              </Button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="w-full">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Pencil className="w-5 h-5" />
                    Task Details
                  </CardTitle>
                  <CardDescription>Update the information below to edit your task.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Task Title */}
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-sm font-medium">
                      Task Title *
                    </Label>
                    <Input
                      id="title"
                      placeholder="Enter task title..."
                      value={formData.title}
                      onChange={(e) => handleInputChange("title", e.target.value)}
                      className="w-full"
                      required
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes" className="text-sm font-medium">
                      Notes
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="Add any notes or details..."
                      value={formData.notes}
                      onChange={(e) => handleInputChange("notes", e.target.value)}
                      maxLength={5000}
                      rows={4}
                      className="w-full"
                    />
                  </div>

                  {/* Assignee — one person or agent at a time */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Assignee</Label>
                    <AssigneePicker
                      value={{ assignees: formData.assignees, assigned_agent_id: formData.assigned_agent_id }}
                      onChange={(next) => setFormData((prev) => ({ ...prev, ...next }))}
                    />
                  </div>

                  {/* Due Date */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Due Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Subtasks */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <ListChecks className="w-4 h-4" />
                      Subtasks
                    </Label>
                    <TaskSubtasks taskId={id} />
                  </div>

                  {/* Project Selection - Only show if major-projects module is enabled */}
                  {majorProjectsEnabled && projects.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Briefcase className="w-4 h-4" />
                        Project
                      </Label>
                      <Select
                        value={formData.project_id || "none"}
                        onValueChange={(value) => handleInputChange("project_id", value === "none" ? null : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a project..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">No project</span>
                          </SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.project_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Status and Priority */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Status</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value: any) => handleInputChange("status", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${option.color.split(" ")[0]}`} />
                                {option.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Priority</Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(value: any) => handleInputChange("priority", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorityOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${option.color.split(" ")[0]}`} />
                                {option.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Pin this task */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Pin this task</Label>
                      <p className="text-xs text-muted-foreground">Pinned tasks will appear in the "Pinned" filter</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInputChange("pinned", !formData.pinned)}
                      className="transition-colors"
                    >
                      <Pin
                        className={`w-5 h-5 ${
                          formData.pinned ? "text-[hsl(var(--primary))]" : "text-gray-300"
                        }`}
                        fill={formData.pinned ? "hsl(var(--primary))" : "none"}
                      />
                    </button>
                  </div>

                  {/* Priority Score */}
                  <div className="flex items-center justify-between border-t pt-6">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Priority Score</Label>
                      <p className="text-xs text-muted-foreground">Higher score = higher priority</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold">{priorityScore.toFixed(1)}</span>
                      <Badge variant={
                        priorityLevel === 'critical' ? 'destructive' :
                        priorityLevel === 'high' ? 'default' :
                        priorityLevel === 'medium' ? 'secondary' :
                        'outline'
                      }>
                        {priorityLevel}
                      </Badge>
                    </div>
                  </div>
                  {/* Impact */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Impact</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">{axisDescriptions.impact}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{formData.impact}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-8">Low</span>
                      <Slider
                        value={[formData.impact]}
                        onValueChange={(value) => handleInputChange("impact", value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground w-8">High</span>
                    </div>
                  </div>

                  {/* Severity */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Severity</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">{axisDescriptions.severity}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{formData.severity}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-8">Low</span>
                      <Slider
                        value={[formData.severity]}
                        onValueChange={(value) => handleInputChange("severity", value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground w-8">High</span>
                    </div>
                  </div>

                  {/* Timeliness */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Timeliness</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">{axisDescriptions.timeliness}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{formData.timeliness}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-8">Low</span>
                      <Slider
                        value={[formData.timeliness]}
                        onValueChange={(value) => handleInputChange("timeliness", value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground w-8">High</span>
                    </div>
                  </div>

                  {/* Effort */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Effort</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">{axisDescriptions.effort}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{formData.effort}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-8">Low</span>
                      <Slider
                        value={[formData.effort]}
                        onValueChange={(value) => handleInputChange("effort", value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground w-8">High</span>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Note: Lower effort = higher priority
                    </p>
                  </div>

                  {/* Strategic Fit */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Strategic Fit</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">{axisDescriptions.strategic_fit}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{formData.strategic_fit}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-8">Low</span>
                      <Slider
                        value={[formData.strategic_fit]}
                        onValueChange={(value) => handleInputChange("strategic_fit", value[0])}
                        min={1}
                        max={5}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground w-8">High</span>
                    </div>
                  </div>

                  {/* Tip */}
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-700">
                      <strong>Tip:</strong> Tasks with high impact, severity, and timeliness but low effort 
                      will have higher priority scores and appear closer to the center of the radar chart.
                    </p>
                  </div>

                </CardContent>
              </Card>

              {/* NorthStar Alignment Section - only show if northstar module is enabled */}
              {northstarEnabled && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Compass className="w-5 h-5" />
                    NorthStar Alignment
                  </CardTitle>
                  <CardDescription>Select the NorthStar goals this task aligns with</CardDescription>
                </CardHeader>
                <CardContent>
                  {northStars.length > 0 ? (
                    <div className="space-y-3">
                      {northStars.map((northstar) => (
                        <div key={northstar.id} className="flex items-start space-x-3">
                          <Checkbox
                            id={northstar.id}
                            checked={selectedNorthStars.includes(northstar.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedNorthStars([...selectedNorthStars, northstar.id])
                              } else {
                                setSelectedNorthStars(selectedNorthStars.filter((id) => id !== northstar.id))
                              }
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <label
                              htmlFor={northstar.id}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {northstar.title}
                            </label>
                            <p className="text-xs text-muted-foreground mt-1">
                              {northstar.description}
                            </p>
                            {northstar.category && (
                              <Badge variant="outline" className="mt-1">
                                {northstar.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No NorthStar goals found. Create some goals in the NorthStar section first.
                    </p>
                  )}
                </CardContent>
              </Card>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <Button type="submit" disabled={loading} className="bg-black hover:bg-gray-800">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant={formData.completed ? "outline" : "destructive"}
                  onClick={handleToggleComplete}
                  disabled={loading}
                >
                  {formData.completed ? (
                    <>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reopen Task
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Mark as Complete
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => requestNavigation("/tasks")} disabled={loading}>
                  Cancel
                </Button>
              </div>
            </form>

            <UnsavedChangesDialog
              open={pendingHref !== null}
              onOpenChange={(open) => { if (!open) closeDialog() }}
              isSaving={isSaving}
              onDiscard={discardAndLeave}
              onSave={saveAndLeave}
            />
    </div>
  )
}