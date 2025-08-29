"use client"

import type React from "react"
import { useSupabase } from "@/components/providers"
import { DM_Sans } from "next/font/google"
import { TaskAnnouncement } from "@/components/task-announcement"
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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { CalendarIcon, Plus, X, Star, ArrowLeft, Loader2 } from "lucide-react"
import { useState } from "react"
import { createTask } from "@/lib/tasks"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

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
  const { session, supabase } = useSupabase()
  const user = session?.user
  const { toast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState<Date>()

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    assignees: [] as string[],
    subtasks_total: 0,
    status: "Pending" as const,
    priority: "Medium" as const,
    starred: false,
    completed: false,
  })

  const [newAssignee, setNewAssignee] = useState("")

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
        starred: formData.starred,
        completed: formData.completed,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (!user?.id) {
        toast({
          title: "Error",
          description: "You must be logged in to create tasks.",
          variant: "destructive",
        })
        return
      }

      await createTask(taskData)

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
      starred: false,
      completed: false,
    })
    setDate(undefined)
    setNewAssignee("")
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
                  <BreadcrumbLink href="/tasks">Todo</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Add Task</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

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

                  {/* Starred */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Star className="w-4 h-4" />
                        Mark as Important
                      </Label>
                      <p className="text-xs text-muted-foreground">Starred tasks will appear in the "Today" filter</p>
                    </div>
                    <Switch
                      checked={formData.starred}
                      onCheckedChange={(checked) => handleInputChange("starred", checked)}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <Button type="submit" disabled={loading} className="bg-black hover:bg-gray-800">
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
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
