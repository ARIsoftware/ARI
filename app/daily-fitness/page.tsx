"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Clock, Target, Dumbbell, CheckCircle2, Circle } from "lucide-react"
import { getFitnessTasks, updateFitnessTaskCompletion, type FitnessTask } from "@/lib/fitness"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export default function DailyFitnessPage() {
  const [tasks, setTasks] = useState<FitnessTask[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingTasks, setUpdatingTasks] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadTasks()
  }, [])

  const loadTasks = async () => {
    try {
      const fetchedTasks = await getFitnessTasks()
      setTasks(fetchedTasks)
    } catch (error) {
      console.error("Error loading fitness tasks:", error)
      toast({
        title: "Error",
        description: "Failed to load fitness tasks. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTaskToggle = async (taskId: string, completed: boolean) => {
    setUpdatingTasks((prev) => new Set(prev).add(taskId))

    try {
      await updateFitnessTaskCompletion(taskId, completed)
      setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, completed } : task)))

      toast({
        title: completed ? "Task Completed!" : "Task Unchecked",
        description: completed ? "Great job on completing your fitness task!" : "Task marked as incomplete.",
      })
    } catch (error) {
      console.error("Error updating task:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
    } finally {
      setUpdatingTasks((prev) => {
        const newSet = new Set(prev)
        newSet.delete(taskId)
        return newSet
      })
    }
  }

  const completedTasks = tasks.filter((task) => task.completed).length
  const totalTasks = tasks.length
  const completionPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const getPriorityColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case "beginner":
        return "bg-green-100 text-green-800"
      case "intermediate":
        return "bg-yellow-100 text-yellow-800"
      case "advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category?.toLowerCase()) {
      case "cardio":
        return <Target className="h-4 w-4" />
      case "strength":
        return <Dumbbell className="h-4 w-4" />
      default:
        return <Circle className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Daily Fitness</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Daily Fitness</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Daily Fitness</h1>
              <p className="text-muted-foreground">Track your daily fitness activities and stay motivated!</p>
            </div>
            <Link href="/add-fitness">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Fitness Task
              </Button>
            </Link>
          </div>

          {/* Progress Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Today's Progress
              </CardTitle>
              <CardDescription>
                {completedTasks} of {totalTasks} tasks completed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{Math.round(completionPercentage)}%</span>
                </div>
                <Progress value={completionPercentage} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Fitness Tasks */}
          <div className="space-y-4">
            {tasks.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Dumbbell className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No fitness tasks yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Start your fitness journey by adding your first task!
                  </p>
                  <Link href="/add-fitness">
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Your First Task
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task) => (
                <Card
                  key={task.id}
                  className={`transition-all ${task.completed ? "bg-green-50 border-green-200" : ""}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={(checked) => handleTaskToggle(task.id, checked as boolean)}
                        disabled={updatingTasks.has(task.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className={`font-semibold ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                            {task.title}
                          </h3>
                          <div className="flex items-center gap-2">
                            {task.difficulty && (
                              <Badge variant="secondary" className={getPriorityColor(task.difficulty)}>
                                {task.difficulty}
                              </Badge>
                            )}
                            {task.category && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                {getCategoryIcon(task.category)}
                                {task.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {task.description && (
                          <p className={`text-sm text-muted-foreground ${task.completed ? "line-through" : ""}`}>
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {task.duration && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {task.duration} min
                            </div>
                          )}
                          {task.equipment && task.equipment.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span>Equipment:</span>
                              <span>{task.equipment.join(", ")}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
