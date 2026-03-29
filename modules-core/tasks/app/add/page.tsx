"use client"

import type React from "react"
import { useSupabase } from "@/components/providers"
import { DM_Sans } from "next/font/google"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { CalendarIcon, Plus, X, Pin, ArrowLeft, Loader2, Compass, Info } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useState, useEffect } from "react"
import { createTask } from "@/modules/tasks/lib/utils"
import { getGoals, type Goal } from "@/lib/goals"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { calculatePriorityScore, getTaskPriorityLevel } from "@/modules/tasks/lib/priority-utils"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

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

export default function AddTaskPage() {
  const { session, supabase, isLoading: sessionLoading } = useSupabase()
  const user = session?.user
  const { toast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState<Date>()
  const [northStars, setNorthStars] = useState<Goal[]>([])
  const [selectedNorthStars, setSelectedNorthStars] = useState<string[]>([])

  // Form state
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

  const axisDescriptions = {
    impact: "How much this task affects your goals and objectives",
    severity: "How critical or severe the problem/opportunity is",
    timeliness: "How urgent this task is based on deadlines",
    effort: "Amount of resources/time needed (lower is better)",
    strategic_fit: "How well this aligns with your strategic priorities"
  }

  // Load northstars/goals
  useEffect(() => {
    const loadNorthStars = async () => {
      try {
        const goals = await getGoals()
        setNorthStars(goals)
      } catch (error) {
        console.error("Failed to load NorthStar goals:", error)
      }
    }

    loadNorthStars()
  }, [])

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a task title.",
        variant: "destructive",
      })
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
        // Note: northstar_ids would need to be added to the database schema
        // northstar_ids: selectedNorthStars,
      }

      if (!user?.id) {
        toast({
          title: "Error",
          description: "You must be logged in to create tasks.",
          variant: "destructive",
        })
        return
      }

      const tokenFn = async () => session?.access_token || null
      await createTask(taskData, tokenFn)

      toast({
        title: "Success",
        description: "Task created successfully!",
      })

      // Redirect to tasks page
      router.push("/tasks")
    } catch (error) {
      console.error("Failed to create task:", error)
      toast({
        title: "Error",
        description: "Failed to create task. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
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
    setSelectedNorthStars([])
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-medium">Add New Task</h1>
                {user && <p className="text-sm text-muted-foreground mt-1">Create a new task for your todo list</p>}
              </div>
              <Button variant="outline" onClick={() => router.push("/tasks")} className="bg-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tasks
              </Button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="max-w-2xl">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Task Details
                  </CardTitle>
                  <CardDescription>Fill in the information below to create a new task.</CardDescription>
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

                  {/* Assignees */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Assignees</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add assignee name..."
                        value={newAssignee}
                        onChange={(e) => setNewAssignee(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addAssignee())}
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
                            <button
                              type="button"
                              onClick={() => removeAssignee(assignee)}
                              className="ml-1 hover:text-red-500"
                            >
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

                  {/* Subtasks */}
                  <div className="space-y-2">
                    <Label htmlFor="subtasks" className="text-sm font-medium">
                      Number of Subtasks
                    </Label>
                    <Input
                      id="subtasks"
                      type="number"
                      min="0"
                      value={formData.subtasks_total}
                      onChange={(e) => handleInputChange("subtasks_total", Number.parseInt(e.target.value) || 0)}
                      className="w-full"
                    />
                  </div>

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
                </CardContent>
              </Card>

              {/* NorthStar Alignment Section */}
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

              {/* Priority Score Section */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Priority Score
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold">
                        {calculatePriorityScore({
                          impact: formData.impact,
                          severity: formData.severity,
                          timeliness: formData.timeliness,
                          effort: formData.effort,
                          strategic_fit: formData.strategic_fit,
                        }).toFixed(1)}
                      </span>
                      <Badge variant={
                        getTaskPriorityLevel(calculatePriorityScore({
                          impact: formData.impact,
                          severity: formData.severity,
                          timeliness: formData.timeliness,
                          effort: formData.effort,
                          strategic_fit: formData.strategic_fit,
                        })) === 'critical' ? 'destructive' :
                        getTaskPriorityLevel(calculatePriorityScore({
                          impact: formData.impact,
                          severity: formData.severity,
                          timeliness: formData.timeliness,
                          effort: formData.effort,
                          strategic_fit: formData.strategic_fit,
                        })) === 'high' ? 'default' :
                        getTaskPriorityLevel(calculatePriorityScore({
                          impact: formData.impact,
                          severity: formData.severity,
                          timeliness: formData.timeliness,
                          effort: formData.effort,
                          strategic_fit: formData.strategic_fit,
                        })) === 'medium' ? 'secondary' :
                        'outline'
                      }>
                        {getTaskPriorityLevel(calculatePriorityScore({
                          impact: formData.impact,
                          severity: formData.severity,
                          timeliness: formData.timeliness,
                          effort: formData.effort,
                          strategic_fit: formData.strategic_fit,
                        }))}
                      </Badge>
                    </div>
                  </CardTitle>
                  <CardDescription>Higher score = higher priority</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
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

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <Button type="submit" disabled={loading || sessionLoading || !user} className="bg-black hover:bg-gray-800">
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
                      Reset Form
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
    </div>
  )
}
