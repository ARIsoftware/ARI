"use client"

import { useState, useEffect } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
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
import { Loader2, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const chartConfig = {
  tasksCreated: {
    label: "Tasks Created",
    color: "#2e81ff",
  },
  tasksCompleted: {
    label: "Tasks Completed",
    color: "#e7efff",
  },
} satisfies ChartConfig

interface TaskAnalyticsData {
  date: string
  tasksCreated: number
  tasksCompleted: number
}

interface AnalyticsSummary {
  totalTasksCreated: number
  totalTasksCompleted: number
  avgTasksCreatedPerDay: number
  avgTasksCompletedPerDay: number
  days: number
}

interface TaskAnalyticsChartProps {
  token: string | null
}

export function TaskAnalyticsChart({ token }: TaskAnalyticsChartProps) {
  const [data, setData] = useState<TaskAnalyticsData[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    const fetchAnalytics = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/tasks/analytics?days=30', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error('Failed to fetch analytics data')
        }

        const result = await response.json()

        if (result.success) {
          // Format dates for display
          const formattedData = result.data.map((item: TaskAnalyticsData) => ({
            ...item,
            displayDate: new Date(item.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })
          }))

          setData(formattedData)
          setSummary(result.summary)
        } else {
          throw new Error(result.error || 'Failed to fetch data')
        }
      } catch (err) {
        console.error('Error fetching task analytics:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [token])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Task Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <div className="flex items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Loading analytics...</span>
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
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Task Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-center">
              <p className="text-muted-foreground">Failed to load analytics data</p>
              <p className="text-sm text-red-500 mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Task Activity
            </CardTitle>
          </div>
          {summary && (
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs">
                {summary.avgTasksCreatedPerDay} created/day
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {summary.avgTasksCompletedPerDay} completed/day
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[270px] w-full">
          <AreaChart
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
              dataKey="displayDate"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Area
              dataKey="tasksCreated"
              type="monotone"
              fill="var(--color-tasksCreated)"
              fillOpacity={0.4}
              stroke="var(--color-tasksCreated)"
              strokeWidth={2}
              stackId="a"
            />
            <Area
              dataKey="tasksCompleted"
              type="monotone"
              fill="var(--color-tasksCompleted)"
              fillOpacity={0.4}
              stroke="var(--color-tasksCompleted)"
              strokeWidth={2}
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>

        {summary && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{summary.totalTasksCreated}</div>
                <div className="text-muted-foreground">Total Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{summary.totalTasksCompleted}</div>
                <div className="text-muted-foreground">Total Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{summary.avgTasksCreatedPerDay}</div>
                <div className="text-muted-foreground">Avg Created/Day</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{summary.avgTasksCompletedPerDay}</div>
                <div className="text-muted-foreground">Avg Completed/Day</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}