"use client"

import type React from "react"
import { useSupabase } from "@/components/providers"
import { TaskAnnouncement } from "@/components/task-announcement"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Carousel, CarouselContent, CarouselItem, CarouselApi } from "@/components/ui/carousel"
import { CheckCircle2, TrendingUp, Target, Plus, X, Calendar, Pencil } from "lucide-react"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { getGoals, createGoal, updateGoalProgress, updateGoal, type Goal } from "../lib/goals"
import { cn } from "@/lib/utils"

const priorityColors = {
  high: "bg-red-100 text-red-700 border-red-300",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  low: "bg-green-100 text-green-700 border-green-300",
}

interface Quote {
  id: string
  quote: string
  author?: string | null
}

interface NorthstarClientProps {
  initialQuote: Quote | null
}

export default function NorthstarClient({ initialQuote }: NorthstarClientProps) {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const { toast } = useToast()
  const [goals, setGoals] = useState<Goal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(0)
  const [newGoal, setNewGoal] = useState({
    title: "",
    description: "",
    category: "",
    priority: "medium" as "low" | "medium" | "high",
    deadline: "",
  })
  const [editGoalData, setEditGoalData] = useState({
    title: "",
    description: "",
    category: "",
    priority: "medium" as "low" | "medium" | "high",
    deadline: "",
  })

  useEffect(() => {
    fetchGoals()
  }, [])

  useEffect(() => {
    if (!api) {
      return
    }

    setCurrent(api.selectedScrollSnap())

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap())
    })
  }, [api])

  const fetchGoals = async () => {
    try {
      const data = await getGoals()
      setGoals(data)
    } catch (error) {
      console.error("Error fetching goals:", error)
      toast({
        title: "Error",
        description: "Failed to fetch goals",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddGoal = async () => {
    if (!newGoal.title || !newGoal.description) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    try {
      const createdGoal = await createGoal(newGoal)
      setGoals([...goals, createdGoal])
      setIsAddModalOpen(false)
      setNewGoal({
        title: "",
        description: "",
        category: "",
        priority: "medium",
        deadline: "",
      })
      toast({
        title: "Success",
        description: "Goal created successfully",
      })
    } catch (error) {
      console.error("Error creating goal:", error)
      toast({
        title: "Error",
        description: "Failed to create goal",
        variant: "destructive",
      })
    }
  }

  const updateGoalProgressHandler = async (goalId: string, action: "increment" | "decrement") => {
    const goal = goals.find(g => g.id === goalId)
    if (!goal) return

    const newProgress = action === "increment"
      ? Math.min(goal.progress + 10, 100)
      : Math.max(goal.progress - 10, 0)

    try {
      const updatedGoal = await updateGoalProgress(goalId, newProgress)
      setGoals(goals.map(g =>
        g.id === goalId ? updatedGoal : g
      ))
      toast({
        title: "Progress Updated",
        description: `Goal progress ${action === "increment" ? "increased" : "decreased"} by 10%`,
      })
    } catch (error) {
      console.error("Error updating goal progress:", error)
      toast({
        title: "Error",
        description: "Failed to update goal progress",
        variant: "destructive",
      })
    }
  }

  const openEditModal = (goal: Goal) => {
    setEditingGoal(goal)
    setEditGoalData({
      title: goal.title,
      description: goal.description,
      category: goal.category,
      priority: goal.priority,
      deadline: goal.deadline || "",
    })
    setIsEditModalOpen(true)
  }

  const handleEditGoal = async () => {
    if (!editingGoal || !editGoalData.title || !editGoalData.description) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    try {
      const updatedGoal = await updateGoal(editingGoal.id, {
        title: editGoalData.title,
        description: editGoalData.description,
        category: editGoalData.category,
        priority: editGoalData.priority,
        deadline: editGoalData.deadline || null,
      })
      setGoals(goals.map(g => g.id === editingGoal.id ? updatedGoal : g))
      setIsEditModalOpen(false)
      setEditingGoal(null)
      toast({
        title: "Success",
        description: "Goal updated successfully",
      })
    } catch (error) {
      console.error("Error updating goal:", error)
      toast({
        title: "Error",
        description: "Failed to update goal",
        variant: "destructive",
      })
    }
  }

  const completedGoals = goals.filter(g => g.progress === 100).length
  const averageProgress = goals.length > 0
    ? Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / goals.length)
    : 0
  const activeGoals = goals.filter(g => g.progress < 100).length


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
                <BreadcrumbItem>
                  <BreadcrumbPage>Northstar</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-medium">Northstar</h1>
                <p className="text-sm text-[#aa2020] mt-1">
                  {initialQuote ? (
                    <>
                      {initialQuote.quote}
                      {initialQuote.author && ` - ${initialQuote.author}`}
                    </>
                  ) : (
                    "Success is not final, failure is not fatal: It is the courage to continue that counts."
                  )}
                </p>
              </div>
              <Button onClick={() => setIsAddModalOpen(true)} className="bg-black hover:bg-gray-800">
                <Plus className="w-4 h-4 mr-2" />
                Add Goal
              </Button>
            </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed Goals
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {completedGoals}/{goals.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Average Progress
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{averageProgress}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Active Goals
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeGoals}</div>
              </CardContent>
            </Card>
          </div>

          {/* Goals Section */}
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Your Goals</h2>
            </div>

            {goals.length > 0 ? (
              <div className="space-y-6">
                {/* Carousel */}
                <Carousel
                  setApi={setApi}
                  className="w-full"
                  opts={{
                    align: "center",
                    loop: false,
                  }}
                >
                  <CarouselContent className="-ml-2 md:-ml-4">
                    {goals.map((goal) => (
                      <CarouselItem key={goal.id} className="pl-2 md:pl-4 basis-[95%] md:basis-[85%] lg:basis-[80%]">
                        <Card className="border-2">
                          <CardContent className="p-4 md:p-8 lg:p-12">
                            <div className="flex flex-col items-center justify-center min-h-[250px] md:min-h-[300px] space-y-4 md:space-y-6">
                              <div className="text-center space-y-3 md:space-y-4 w-full max-w-2xl">
                                <div className="flex items-center justify-center gap-4">
                                  <h3 className="text-4xl md:text-5xl lg:text-6xl font-bold">{current + 1}</h3>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <h4 className="text-xl md:text-2xl font-semibold">{goal.title}</h4>
                                    <Badge
                                      variant="outline"
                                      className={priorityColors[goal.priority]}
                                    >
                                      {goal.priority}
                                    </Badge>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={() => openEditModal(goal)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <p className="text-muted-foreground text-sm md:text-base lg:text-lg">{goal.description}</p>
                                </div>

                                <div className="space-y-2 md:space-y-3 pt-2 md:pt-4">
                                  <div className="flex justify-between text-sm">
                                    <span>Progress</span>
                                    <span className="font-bold text-blue-600 text-lg md:text-xl">{goal.progress}%</span>
                                  </div>
                                  <Progress value={goal.progress} className="h-2 md:h-3" />
                                </div>

                                <div className="flex items-center justify-center gap-2 md:gap-4 pt-2 flex-wrap">
                                  <Badge variant="secondary" className="text-xs md:text-sm">{goal.category}</Badge>
                                  <span className="text-gray-500 text-xs md:text-sm">
                                    Due: {goal.deadline ? new Date(goal.deadline).toLocaleDateString() : "No deadline"}
                                  </span>
                                </div>

                                <div className="flex gap-2 md:gap-3 justify-center pt-2 md:pt-4">
                                  <Button
                                    size="default"
                                    className="md:text-base"
                                    variant="outline"
                                    onClick={() => updateGoalProgressHandler(goal.id, "increment")}
                                  >
                                    +10%
                                  </Button>
                                  <Button
                                    size="default"
                                    className="md:text-base"
                                    variant="outline"
                                    onClick={() => updateGoalProgressHandler(goal.id, "decrement")}
                                  >
                                    -10%
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>

                {/* Navigation Dots */}
                <div className="flex justify-center gap-1 md:gap-2 flex-wrap">
                  {goals.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => api?.scrollTo(index)}
                      className={cn(
                        "w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-xl md:rounded-2xl border-2 text-base md:text-lg font-semibold transition-all",
                        current === index
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-400 border-gray-200 hover:border-gray-400"
                      )}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="p-12">
                  <div className="text-center text-muted-foreground">
                    <p>No goals yet. Click "Add Goal" to create your first goal.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Add Goal Modal */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="text-xl">Add New Goal</DialogTitle>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Goal Title</label>
                <Input
                  placeholder="Enter your goal title"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Describe your goal in detail"
                  value={newGoal.description}
                  onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                  className="min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select
                    value={newGoal.category}
                    onValueChange={(value) => setNewGoal({ ...newGoal, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Personal Growth">Personal Growth</SelectItem>
                      <SelectItem value="Health & Fitness">Health & Fitness</SelectItem>
                      <SelectItem value="Financial">Financial</SelectItem>
                      <SelectItem value="Learning">Learning</SelectItem>
                      <SelectItem value="Career">Career</SelectItem>
                      <SelectItem value="Relationships">Relationships</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    value={newGoal.priority}
                    onValueChange={(value) => setNewGoal({ ...newGoal, priority: value as "low" | "medium" | "high" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Medium" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Deadline</label>
                <Input
                  type="date"
                  value={newGoal.deadline}
                  onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddGoal}>
                Add Goal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Goal Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="text-xl">Edit Goal</DialogTitle>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Goal Title</label>
                <Input
                  placeholder="Enter your goal title"
                  value={editGoalData.title}
                  onChange={(e) => setEditGoalData({ ...editGoalData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Describe your goal in detail"
                  value={editGoalData.description}
                  onChange={(e) => setEditGoalData({ ...editGoalData, description: e.target.value })}
                  className="min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select
                    value={editGoalData.category}
                    onValueChange={(value) => setEditGoalData({ ...editGoalData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Personal Growth">Personal Growth</SelectItem>
                      <SelectItem value="Health & Fitness">Health & Fitness</SelectItem>
                      <SelectItem value="Financial">Financial</SelectItem>
                      <SelectItem value="Learning">Learning</SelectItem>
                      <SelectItem value="Career">Career</SelectItem>
                      <SelectItem value="Relationships">Relationships</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    value={editGoalData.priority}
                    onValueChange={(value) => setEditGoalData({ ...editGoalData, priority: value as "low" | "medium" | "high" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Medium" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Deadline</label>
                <Input
                  type="date"
                  value={editGoalData.deadline}
                  onChange={(e) => setEditGoalData({ ...editGoalData, deadline: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditGoal}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
