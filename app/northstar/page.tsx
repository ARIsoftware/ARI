"use client"

import type React from "react"
import { useSupabase } from "@/components/providers"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle2, TrendingUp, Target, Plus, X, Calendar } from "lucide-react"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { getGoals, createGoal, updateGoalProgress, type Goal } from "@/lib/goals"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})


const priorityColors = {
  high: "bg-red-100 text-red-700 border-red-300",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  low: "bg-green-100 text-green-700 border-green-300",
}

export default function NorthstarPage() {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const { toast } = useToast()
  const [goals, setGoals] = useState<Goal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newGoal, setNewGoal] = useState({
    title: "",
    description: "",
    category: "",
    priority: "medium" as "low" | "medium" | "high",
    deadline: "",
  })

  useEffect(() => {
    fetchGoals()
  }, [])

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

  const completedGoals = goals.filter(g => g.progress === 100).length
  const averageProgress = goals.length > 0 
    ? Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / goals.length)
    : 0
  const activeGoals = goals.filter(g => g.progress < 100).length


  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Northstar</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className={`flex flex-1 flex-col gap-8 p-6 ${dmSans.className}`}>
          {/* Header with Quote */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
              <Target className="w-8 h-8 text-blue-500" />
              Personal Northstar
            </h1>
            <p className="text-gray-600 italic max-w-2xl mx-auto">
              "Success is not final, failure is not fatal:<br />
              it is the courage to continue that counts."
            </p>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Your Goals</h2>
              <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Goal
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {goals.map((goal) => (
                <Card key={goal.id} className="relative">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{goal.title}</CardTitle>
                      <Badge 
                        variant="outline" 
                        className={priorityColors[goal.priority]}
                      >
                        {goal.priority}
                      </Badge>
                    </div>
                    <CardDescription>{goal.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span className="font-bold text-blue-600">{goal.progress}%</span>
                      </div>
                      <Progress value={goal.progress} className="h-2" />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <Badge variant="secondary">{goal.category}</Badge>
                      <span className="text-gray-500">
                        Due: {goal.deadline ? new Date(goal.deadline).toLocaleDateString() : "No deadline"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => updateGoalProgressHandler(goal.id, "increment")}
                      >
                        +10%
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => updateGoalProgressHandler(goal.id, "decrement")}
                      >
                        -10%
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
      </SidebarInset>
    </SidebarProvider>
  )
}