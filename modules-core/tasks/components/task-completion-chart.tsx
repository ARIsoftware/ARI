"use client"

import { useState, useEffect } from "react"
import { Pie, PieChart, Cell } from "recharts"
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Loader2, PieChart as PieChartIcon } from "lucide-react"

const chartConfig = {
  completed: {
    label: "Completed",
    color: "hsl(142, 76%, 36%)",
  },
  pending: {
    label: "Pending",
    color: "hsl(25, 95%, 53%)",
  },
} satisfies ChartConfig

interface CompletionData {
  status: string
  count: number
  fill: string
}

interface TaskCompletionChartProps {
  token: string | null
}

export function TaskCompletionChart({ token }: TaskCompletionChartProps) {
  const [data, setData] = useState<CompletionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    const fetchTasks = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/modules/tasks', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error('Failed to fetch tasks')
        }

        const tasks = await response.json()

        // Count completed vs pending tasks
        let completed = 0
        let pending = 0

        tasks.forEach((task: any) => {
          if (task.completed) {
            completed++
          } else {
            pending++
          }
        })

        const chartData: CompletionData[] = [
          { status: 'Completed', count: completed, fill: chartConfig.completed.color },
          { status: 'Pending', count: pending, fill: chartConfig.pending.color }
        ]

        setData(chartData)
      } catch (err) {
        console.error('Error fetching task completion data:', err)
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
            <PieChartIcon className="w-5 h-5 text-green-600" />
            Task Completion Status
          </CardTitle>
          <CardDescription>Overall completion rate across all tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px]">
            <div className="flex items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Loading completion data...</span>
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
            <PieChartIcon className="w-5 h-5 text-green-600" />
            Task Completion Status
          </CardTitle>
          <CardDescription>Overall completion rate across all tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px]">
            <div className="text-center">
              <p className="text-muted-foreground">Failed to load completion data</p>
              <p className="text-sm text-red-500 mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalTasks = data.reduce((sum, item) => sum + item.count, 0)
  const completionRate = totalTasks > 0 ? Math.round((data.find(d => d.status === 'Completed')?.count || 0) / totalTasks * 100) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="w-5 h-5 text-green-600" />
          Task Completion Status
        </CardTitle>
        <CardDescription>Overall completion rate: {completionRate}%</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={60}
              strokeWidth={5}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <ChartLegend
              content={<ChartLegendContent nameKey="status" />}
              className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
