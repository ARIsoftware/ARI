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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Calendar, Plus, X, Star, Loader2 } from "lucide-react"
import { useState } from "react"
import { createFitnessTask } from "@/lib/fitness"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default function AddFitnessPage() {
  const { user } = useUser()
  const { toast } = useToast()
  const router = useRouter()
  
  const [title, setTitle] = useState("")
  const [assignees, setAssignees] = useState<string[]>([])
  const [newAssignee, setNewAssignee] = useState("")
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState<"Pending" | "In Progress" | "Completed">("Pending")
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">("Medium")
  const [starred, setStarred] = useState(false)
  const [subtasksTotal, setSubtasksTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const handleAddAssignee = () => {
    if (newAssignee.trim() && !assignees.includes(newAssignee.trim())) {
      setAssignees([...assignees, newAssignee.trim()])
      setNewAssignee("")
    }
  }

  const handleRemoveAssignee = (assigneeToRemove: string) => {
    setAssignees(assignees.filter(assignee => assignee !== assigneeToRemove))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Exercise title is required.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      await createFitnessTask({
        title: title.trim(),
        assignees: assignees.length > 0 ? assignees : [user?.firstName || "Me"],
        due_date: dueDate || null,
        subtasks_completed: 0,
        subtasks_total: subtasksTotal,
        status,
        priority,
        starred,
        completed: status === "Completed",
      })

      toast({
        title: "Success",
        description: "Exercise added successfully!",
      })

      router.push("/daily-fitness")
    } catch (error) {
      console.error("Failed to create fitness task:", error)
      toast({
        title: "Error",
        description: "Failed to add exercise. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
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
                  <BreadcrumbLink href="#">Fitness First</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/daily-fitness">Daily Fitness</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Add Exercise</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => router.push("/daily-fitness")}
                  className="bg-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">Add New Exercise</h1>
                  {user && (
                    <p className="text-sm text-muted-foreground mt-1">Create a new fitness exercise</p>
                  )}
                </div>
              </div>
            </div>

            {/* Form */}
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Exercise Details
                </CardTitle>
                <CardDescription>
                  Fill in the details for your new fitness exercise
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Exercise Title */}
                  <div className="space-y-2">
                    <label htmlFor="title" className="text-sm font-medium">
                      Exercise Title *
                    </label>
                    <Input
                      id="title"
                      placeholder="e.g., 100 pushups, 15 minute jog"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="bg-white"
                      required
                    />
                  </div>

                  {/* Assignees */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Assigned to</label>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Add person"
                        value={newAssignee}
                        onChange={(e) => setNewAssignee(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddAssignee())}
                        className="bg-white"
                      />
                      <Button type="button" onClick={handleAddAssignee} variant="outline" size="icon">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {assignees.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {assignees.map((assignee) => (
                          <div
                            key={assignee}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-sm"
                          >
                            <span>{assignee}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAssignee(assignee)}
                              className="text-gray-500 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Due Date */}
                  <div className="space-y-2">
                    <label htmlFor="dueDate" className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Due Date
                    </label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="bg-white"
                    />
                  </div>

                  {/* Total Reps/Sets */}
                  <div className="space-y-2">
                    <label htmlFor="subtasksTotal" className="text-sm font-medium">
                      Total Reps/Sets
                    </label>
                    <Input
                      id="subtasksTotal"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={subtasksTotal}
                      onChange={(e) => setSubtasksTotal(parseInt(e.target.value) || 0)}
                      className="bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Status */}
                    <div className="space-y-2">
                      <label htmlFor="status" className="text-sm font-medium">
                        Status
                      </label>
                      <select
                        id="status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as "Pending" | "In Progress" | "Completed")}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>

                    {/* Priority */}
                    <div className="space-y-2">
                      <label htmlFor="priority" className="text-sm font-medium">
                        Priority
                      </label>
                      <select
                        id="priority"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as "Low" | "Medium" | "High")}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                  </div>

                  {/* Star Toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStarred(!starred)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                        starred
                          ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Star className={`w-4 h-4 ${starred ? "fill-yellow-400 text-yellow-500" : ""}`} />
                      {starred ? "Remove from Today" : "Add to Today"}
                    </button>
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-center gap-3 pt-4">
                    <Button type="submit" disabled={loading} className="bg-black hover:bg-gray-800">
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Adding Exercise...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Add Exercise
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/daily-fitness")}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
