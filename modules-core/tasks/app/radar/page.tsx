"use client"

import { useEffect, useState } from "react"
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, PolarRadiusAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Task } from "@/modules/tasks/types"
import { transformTaskForRadar, getTaskPriorityLevel } from "@/modules/tasks/lib/priority-utils"
import { TaskPriorityModal } from "@/modules/tasks/components/task-priority-modal"
import { RadarTaskDots } from "@/modules/tasks/components/radar-task-dots"

const chartConfig = {
  value: {
    label: "Priority",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

// Transform tasks to radar chart data format
function prepareRadarData(tasks: Task[]) {
  // Define the 5 axes for the radar chart
  const axes = [
    { axis: "Impact", key: "impact" },
    { axis: "Severity", key: "severity" },
    { axis: "Timeliness", key: "timeliness" },
    { axis: "Effort", key: "effort" },
    { axis: "Strategic Fit", key: "strategic_fit" },
  ]
  
  // For visualization, we'll show average values across all tasks
  // and individual task dots on the chart
  const avgData = axes.map(({ axis, key }) => {
    const values = tasks.map(t => {
      const value = t[key as keyof Task] as number || 3
      // Invert effort for display (high effort = lower on chart)
      return key === 'effort' ? (6 - value) : value
    })
    const avg = values.length > 0 
      ? values.reduce((a, b) => a + b, 0) / values.length 
      : 3
    
    return {
      axis,
      value: (avg / 5) * 100, // Convert to percentage
    }
  })
  
  return avgData
}

export default function RadarPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"priority" | "pinned">("priority")
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    try {
      // Better Auth uses HTTP-only cookies — sent automatically with
      // same-origin fetch. No Authorization header needed.
      const response = await fetch('/api/modules/tasks/priorities')
      if (!response.ok) throw new Error('Failed to fetch tasks')
      const data = await response.json()
      setTasks(data)
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get top 5 incomplete tasks by priority score
  const priorityTasks = tasks
    .filter(task => !task.completed) // Always exclude completed tasks
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
    .slice(0, 5)

  // Get up to 5 pinned (incomplete) tasks, highest priority first
  const pinnedTasks = tasks
    .filter(task => task.pinned && !task.completed)
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
    .slice(0, 5)

  // Which set the radar + list currently display
  const displayTasks = viewMode === "pinned" ? pinnedTasks : priorityTasks

  const pageTitle = viewMode === "pinned"
    ? `Task Radar: ${pinnedTasks.length} Pinned Task${pinnedTasks.length === 1 ? "" : "s"}`
    : "Task Radar: Top 5 Priority Tasks"

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setIsModalOpen(true)
  }

  const handleTaskUpdate = async (taskId: string, axes: any) => {
    try {
      const response = await fetch('/api/modules/tasks/priorities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, axes })
      })
      
      if (!response.ok) throw new Error('Failed to update task')
      
      const updatedTask = await response.json()
      
      // Update local state
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t))
      setIsModalOpen(false)
      setSelectedTask(null)
    } catch (error) {
      console.error('Error updating task:', error)
    }
  }

  const radarData = prepareRadarData(displayTasks)
  const transformedDisplayTasks = displayTasks.map(transformTaskForRadar)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-medium">{pageTitle}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Visualize and prioritize tasks based on multiple factors
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={viewMode === "priority" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("priority")}
                >
                  Priority
                </Button>
                <Button
                  variant={viewMode === "pinned" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("pinned")}
                >
                  Pinned
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Radar Chart */}
              <Card className="lg:col-span-2">
                <CardContent className="pt-6 pb-0 overflow-visible">
                  <div className="relative overflow-visible">
                    <ChartContainer
                      config={chartConfig}
                      className="mx-auto aspect-square max-h-[calc(100vh-15rem)] w-full"
                    >
                      <RadarChart 
                        data={radarData}
                        margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
                      >
                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                        <PolarAngleAxis 
                          dataKey="axis" 
                          tick={{ fontSize: 12, fill: '#666', textAnchor: 'middle' }}
                          className="text-xs"
                        />
                        <PolarGrid radialLines={false} />
                        <PolarRadiusAxis 
                          angle={90} 
                          domain={[0, 100]} 
                          tickCount={6}
                          axisLine={false}
                          tick={false}
                        />
                        <Radar
                          dataKey="value"
                          stroke="transparent"
                          fill="transparent"
                          fillOpacity={0}
                          strokeWidth={0}
                        />
                      </RadarChart>
                    </ChartContainer>
                    
                    {/* Overlay task dots — the currently selected set (priority or pinned) */}
                    <RadarTaskDots
                      tasks={displayTasks}
                      hoveredTask={hoveredTask}
                      onTaskHover={setHoveredTask}
                      onTaskClick={handleTaskClick}
                      limit={5}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex-col gap-2 text-sm">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#b0413a' }} />
                      <span className="text-xs">Overdue</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#b07636' }} />
                      <span className="text-xs">Due Soon</span>
                    </div>
                  </div>
                </CardFooter>
              </Card>

              {/* Priority List */}
              <Card>
                <CardHeader>
                  <CardTitle>{viewMode === "pinned" ? "Pinned Tasks" : "Top 5 Priority Tasks"}</CardTitle>
                  <CardDescription>
                    {viewMode === "pinned"
                      ? "Your pinned tasks, highest priority first"
                      : "Top 5 priority tasks based on calculated scores"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {loading ? (
                      <p className="text-muted-foreground">Loading tasks...</p>
                    ) : transformedDisplayTasks.length === 0 ? (
                      <p className="text-muted-foreground">
                        {viewMode === "pinned" ? "No pinned tasks found" : "No incomplete tasks found"}
                      </p>
                    ) : (
                      transformedDisplayTasks.map((task, index) => {
                        const fullTask = tasks.find(t => t.id === task.id)
                        if (!fullTask) return null
                        
                        return (
                          <div
                            key={task.id}
                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => handleTaskClick(fullTask)}
                            onMouseEnter={() => setHoveredTask(task.id)}
                            onMouseLeave={() => setHoveredTask(null)}
                          >
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white"
                                style={{ backgroundColor: task.color }}
                              >
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm line-clamp-1">
                                  {task.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant={
                                    task.priorityLevel === 'critical' ? 'destructive' :
                                    task.priorityLevel === 'high' ? 'default' :
                                    task.priorityLevel === 'medium' ? 'secondary' :
                                    'outline'
                                  } className="text-xs">
                                    {task.priorityLevel}
                                  </Badge>
                                  {task.dueDate && (
                                    <span className="text-xs text-muted-foreground">
                                      Due: {new Date(task.dueDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Score: {typeof task.score === 'number' ? task.score.toFixed(1) : 'N/A'}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Legend and Info */}
            <Card>
              <CardHeader>
                <CardTitle>Understanding the Priority Radar</CardTitle>
                <CardDescription>
                  Task positions based on calculated priority scores. Showing the 5
                  highest priority tasks — closer to center = higher priority.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <h4 className="font-medium mb-1">Impact</h4>
                    <p className="text-sm text-muted-foreground">
                      How much this task affects your goals (1-5)
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Severity</h4>
                    <p className="text-sm text-muted-foreground">
                      How critical the issue is (1-5)
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Timeliness</h4>
                    <p className="text-sm text-muted-foreground">
                      How urgent the task is (1-5)
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Effort</h4>
                    <p className="text-sm text-muted-foreground">
                      Resources required (1-5, lower is better)
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Strategic Fit</h4>
                    <p className="text-sm text-muted-foreground">
                      Alignment with strategy (1-5)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

      {/* Task Priority Edit Modal */}
      {selectedTask && (
        <TaskPriorityModal
          task={selectedTask}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedTask(null)
          }}
          onUpdate={handleTaskUpdate}
        />
      )}
    </div>
  )
}