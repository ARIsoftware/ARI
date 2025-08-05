"use client"

import type React from "react"
import { use } from "react"
import { useUser } from "@clerk/nextjs"
import { DM_Sans } from "next/font/google"
import { AppSidebar } from "../../../components/app-sidebar"
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
import { CalendarIcon, Save, X, Star, ArrowLeft, Loader2, Pencil } from "lucide-react"
import { useState, useEffect } from "react"
import { getFitnessTasks, updateFitnessTask, type FitnessTask } from "@/lib/fitness"
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

export default function EditFitnessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useUser()
  const { toast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [date, setDate] = useState<Date>()
  const [task, setTask] = useState<FitnessTask | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    assignees: [] as string[],
    subtasks_total: 0,
    subtasks_completed: 0,
    status: "Pending" as const,
    priority: "Medium" as const,
    starred: false,
    completed: false,
  })

  const [newAssignee, setNewAssignee] = useState("")

  // Load task data
  useEffect(() => {
    const loadTask = async () => {
      try {
        const tasks = await getFitnessTasks()
        const foundTask = tasks.find((t) => t.id === id)
        
        if (!foundTask) {
          toast({
            title: "Error",
            description: "Exercise not found.",
            variant: "destructive",
          })
          router.push("/daily-fitness")
          return
        }

        setTask(foundTask)
        setFormData({
          title: foundTask.title,
          assignees: foundTask.assignees,
          subtasks_total: foundTask.subtasks_total,
          subtasks_completed: foundTask.subtasks_completed,
          status: foundTask.status,
          priority: foundTask.priority,
          starred: foundTask.starred,
          completed: foundTask.completed,
        })
        
        if (foundTask.due_date) {
          setDate(new Date(foundTask.due_date))
        }
      } catch (error) {
        console.error("Failed to load fitness task:", error)
        toast({
          title: "Error",
          description: "Failed to load exercise. Please try again.",
          variant: "destructive",
        })
        router.push("/daily-fitness")
      } finally {
        setInitialLoading(false)
      }
    }

    loadTask()
  }, [id, router, toast])

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
        description: "Please enter an exercise title.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const updates = {
        title: formData.title.trim(),
        assignees: formData.assignees,
        due_date: date ? date.toISOString().split("T")[0] : null,
        subtasks_total: formData.subtasks_total,
        subtasks_completed: formData.subtasks_completed,
        status: formData.status,
        priority: formData.priority,
        starred: formData.starred,
        completed: formData.completed,
      }

      await updateFitnessTask(id, updates)

      toast({
        title: "Success",
        description: "Exercise updated successfully!",
      })

      // Redirect to fitness page
      router.push("/daily-fitness")
    } catch (error) {
      console.error("Failed to update fitness task:", error)
      toast({
        title: "Error",
        description: "Failed to update exercise. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
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
                <span>Loading exercise...</span>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="topbar h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
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
                  <BreadcrumbLink href="/daily-fitness">Fitness First</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Edit Exercise</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-medium">Edit Exercise</h1>
                {user && <p className="text-sm text-muted-foreground mt-1">Update your exercise details</p>}
              </div>
              <Button variant="outline" onClick={() => router.push("/daily-fitness")} className="bg-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Fitness
              </Button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="max-w-2xl">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Pencil className="w-5 h-5" />
                    Exercise Details
                  </CardTitle>
                  <CardDescription>Update the information below to edit your exercise.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Exercise Title */}
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-sm font-medium">
                      Exercise Title *
                    </Label>
                    <Input
                      id="title"
                      placeholder="Enter exercise title..."
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
                        <Save className="w-4 h-4" />
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

                  {/* Reps */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="subtasks_completed" className="text-sm font-medium">
                        Reps Completed
                      </Label>
                      <Input
                        id="subtasks_completed"
                        type="number"
                        min="0"
                        max={formData.subtasks_total}
                        value={formData.subtasks_completed}
                        onChange={(e) => handleInputChange("subtasks_completed", Number.parseInt(e.target.value) || 0)}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subtasks_total" className="text-sm font-medium">
                        Total Reps
                      </Label>
                      <Input
                        id="subtasks_total"
                        type="number"
                        min="0"
                        value={formData.subtasks_total}
                        onChange={(e) => handleInputChange("subtasks_total", Number.parseInt(e.target.value) || 0)}
                        className="w-full"
                      />
                    </div>
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
                      <p className="text-xs text-muted-foreground">Starred exercises will appear in the "Today" filter</p>
                    </div>
                    <Switch
                      checked={formData.starred}
                      onCheckedChange={(checked) => handleInputChange("starred", checked)}
                    />
                  </div>

                  {/* Completed */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Mark as Completed</Label>
                      <p className="text-xs text-muted-foreground">Toggle to mark this exercise as done</p>
                    </div>
                    <Switch
                      checked={formData.completed}
                      onCheckedChange={(checked) => handleInputChange("completed", checked)}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
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
                    <Button type="button" variant="outline" onClick={() => router.push("/daily-fitness")} disabled={loading}>
                      Cancel
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