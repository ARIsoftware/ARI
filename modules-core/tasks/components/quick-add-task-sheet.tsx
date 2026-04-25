"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { CalendarIcon, Plus, X, Pin, Loader2, Info } from "lucide-react"
import { createTask } from "@/modules/tasks/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { calculatePriorityScore, getTaskPriorityLevel } from "@/modules/tasks/lib/priority-utils"

// Context for opening/closing the quick add sheet
interface QuickAddTaskContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const QuickAddTaskContext = createContext<QuickAddTaskContextType | null>(null)

export function useQuickAddTask() {
  const context = useContext(QuickAddTaskContext)
  if (!context) {
    throw new Error("useQuickAddTask must be used within QuickAddTaskProvider")
  }
  return context
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

const axisDescriptions: Record<string, string> = {
  impact: "How much this task affects your goals and objectives",
  severity: "How critical or severe the problem/opportunity is",
  timeliness: "How urgent this task is based on deadlines",
  effort: "Amount of resources/time needed (lower is better)",
  strategic_fit: "How well this aligns with your strategic priorities",
}

function QuickAddTaskForm({ onSuccess }: { onSuccess: () => void }) {
  const { session } = useAuth()
  const user = session?.user
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState<Date>()

  const [formData, setFormData] = useState({
    title: "",
    assignees: [] as string[],
    subtasks_total: 0,
    status: "Pending" as const,
    priority: "Medium" as const,
    pinned: false,
    completed: false,
    impact: 3,
    severity: 3,
    timeliness: 3,
    effort: 3,
    strategic_fit: 3,
  })

  const [newAssignee, setNewAssignee] = useState("")

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const addAssignee = () => {
    if (newAssignee.trim() && !formData.assignees.includes(newAssignee.trim())) {
      setFormData((prev) => ({
        ...prev,
        assignees: [...prev.assignees, newAssignee.trim()],
      }))
      setNewAssignee("")
    }
  }

  const removeAssignee = (assignee: string) => {
    setFormData((prev) => ({
      ...prev,
      assignees: prev.assignees.filter((a) => a !== assignee),
    }))
  }

  const resetForm = () => {
    setFormData({
      title: "",
      assignees: [],
      subtasks_total: 0,
      status: "Pending",
      priority: "Medium",
      pinned: false,
      completed: false,
      impact: 3,
      severity: 3,
      timeliness: 3,
      effort: 3,
      strategic_fit: 3,
    })
    setDate(undefined)
    setNewAssignee("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      toast({ title: "Error", description: "Please enter a task title.", variant: "destructive" })
      return
    }

    setLoading(true)

    try {
      const taskData = {
        title: formData.title.trim(),
        assignees: formData.assignees,
        due_date: date ? date.toISOString().split("T")[0] : null,
        subtasks_total: formData.subtasks_total,
        subtasks_completed: 0,
        status: formData.status,
        priority: formData.priority,
        pinned: formData.pinned,
        completed: formData.completed,
        impact: formData.impact,
        severity: formData.severity,
        timeliness: formData.timeliness,
        effort: formData.effort,
        strategic_fit: formData.strategic_fit,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (!user?.id) {
        toast({ title: "Error", description: "You must be logged in to create tasks.", variant: "destructive" })
        return
      }

      const tokenFn = async () => session?.access_token || null
      await createTask(taskData, tokenFn)

      toast({ title: "Success", description: "Task created successfully!" })

      // Invalidate tasks queries so lists refresh
      queryClient.invalidateQueries({ queryKey: ["tasks"] })

      resetForm()
      onSuccess()
    } catch (error) {
      console.error("Failed to create task:", error)
      toast({ title: "Error", description: "Failed to create task. Please try again.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const priorityScore = calculatePriorityScore({
    impact: formData.impact,
    severity: formData.severity,
    timeliness: formData.timeliness,
    effort: formData.effort,
    strategic_fit: formData.strategic_fit,
  })

  return (
    <form onSubmit={handleSubmit} className="space-y-5 px-1">
      {/* Task Title */}
      <div className="space-y-2">
        <Label htmlFor="quick-title" className="text-sm font-medium">Task Title *</Label>
        <Input
          id="quick-title"
          placeholder="Enter task title..."
          value={formData.title}
          onChange={(e) => handleInputChange("title", e.target.value)}
          autoFocus
        />
      </div>

      {/* Assignees */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Assignees</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Add assignee..."
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAssignee())}
            className="flex-1"
          />
          <Button type="button" onClick={addAssignee} variant="outline" size="icon">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {formData.assignees.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.assignees.map((assignee) => (
              <Badge key={assignee} variant="secondary" className="flex items-center gap-1">
                {assignee}
                <button type="button" onClick={() => removeAssignee(assignee)} className="ml-1 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
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

      {/* Status and Priority */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Status</Label>
          <Select value={formData.status} onValueChange={(value: any) => handleInputChange("status", value)}>
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
          <Select value={formData.priority} onValueChange={(value: any) => handleInputChange("priority", value)}>
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

      {/* Pin */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Pin this task</Label>
          <p className="text-xs text-muted-foreground">Appears in the &quot;Pinned&quot; filter</p>
        </div>
        <button type="button" onClick={() => handleInputChange("pinned", !formData.pinned)} className="transition-colors">
          <Pin
            className={`w-5 h-5 ${formData.pinned ? "text-[hsl(var(--primary))]" : "text-gray-300"}`}
            fill={formData.pinned ? "hsl(var(--primary))" : "none"}
          />
        </button>
      </div>

      {/* Priority Score */}
      <div className="space-y-4 border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Priority Score</Label>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{priorityScore.toFixed(1)}</span>
            <Badge variant={
              getTaskPriorityLevel(priorityScore) === 'critical' ? 'destructive' :
              getTaskPriorityLevel(priorityScore) === 'high' ? 'default' :
              getTaskPriorityLevel(priorityScore) === 'medium' ? 'secondary' : 'outline'
            }>
              {getTaskPriorityLevel(priorityScore)}
            </Badge>
          </div>
        </div>

        {(["impact", "severity", "timeliness", "effort", "strategic_fit"] as const).map((axis) => (
          <div key={axis} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-medium capitalize">{axis.replace("_", " ")}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">{axisDescriptions[axis]}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="text-xs font-medium w-6 text-right">{formData[axis]}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-6">Low</span>
              <Slider
                value={[formData[axis]]}
                onValueChange={(value) => handleInputChange(axis, value[0])}
                min={1}
                max={5}
                step={1}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground w-6">High</span>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-4">
        <Button type="submit" disabled={loading || !user} className="flex-1 bg-black hover:bg-gray-800">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Create Task
            </>
          )}
        </Button>
        <Button type="button" variant="outline" onClick={resetForm} disabled={loading}>
          Reset
        </Button>
      </div>
    </form>
  )
}

export function QuickAddTaskProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  // Keyboard shortcut: Cmd+Shift+N to open quick add task
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "L" && e.ctrlKey && e.shiftKey) {
        e.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleSuccess = useCallback(() => {
    setOpen(false)
  }, [])

  return (
    <QuickAddTaskContext.Provider value={{ open, setOpen }}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Quick Add Task
            </SheetTitle>
            <SheetDescription>
              Create a new task without leaving your current page.
            </SheetDescription>
          </SheetHeader>
          {open && <QuickAddTaskForm onSuccess={handleSuccess} />}
        </SheetContent>
      </Sheet>
    </QuickAddTaskContext.Provider>
  )
}
