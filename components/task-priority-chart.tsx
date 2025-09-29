"use client"

import { useState, useEffect } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Loader2, BarChart3 } from "lucide-react"

const chartConfig = {
  count: {
    label: "Tasks",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

interface PriorityData {
  priority: string
  count: number
  fill: string
}

interface TaskPriorityChartProps {
  token: string | null
}

export function TaskPriorityChart({ token }: TaskPriorityChartProps) {
  const [data, setData] = useState<PriorityData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    const fetchTasks = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/tasks', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error('Failed to fetch tasks')
        }

        const tasks = await response.json()

        // Count tasks by priority
        const priorityCounts: Record<string, number> = {
          'Low': 0,
          'Medium': 0,
          'High': 0,
          'Urgent': 0
        }

        tasks.forEach((task: any) => {
          const priority = task.priority || 'Medium'
          if (priorityCounts.hasOwnProperty(priority)) {
            priorityCounts[priority]++
          }
        })

        // Convert to chart data with colors
        const chartData: PriorityData[] = [
          { priority: 'Low', count: priorityCounts.Low, fill: 'hsl(142, 76%, 36%)' },
          { priority: 'Medium', count: priorityCounts.Medium, fill: 'hsl(47, 96%, 53%)' },
          { priority: 'High', count: priorityCounts.High, fill: 'hsl(25, 95%, 53%)' },
          { priority: 'Urgent', count: priorityCounts.Urgent, fill: 'hsl(0, 84%, 60%)' }
        ]

        setData(chartData)
      } catch (err) {
        console.error('Error fetching task priorities:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [token])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            Task Priority Distribution
          </CardTitle>
          <CardDescription>Breakdown of tasks by priority level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px]">
            <div className="flex items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Loading priority data...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            Task Priority Distribution
          </CardTitle>
          <CardDescription>Breakdown of tasks by priority level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px]">
            <div className="text-center">
              <p className="text-muted-foreground">Failed to load priority data</p>
              <p className="text-sm text-red-500 mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-600" />
          Task Priority Distribution
        </CardTitle>
        <CardDescription>Breakdown of tasks by priority level</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart
            accessibilityLayer
            data={data}
            margin={{
              left: 12,
              right: 12,
              top: 12,
              bottom: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="priority"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <Bar
              dataKey="count"
              strokeWidth={2}
              radius={4}
              fill="var(--color-count)"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}