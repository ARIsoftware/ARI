'use client'

import { useState, useEffect } from 'react'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, PolarRadiusAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Loader2 } from 'lucide-react'
import { useSupabase } from '@/components/providers'
import type { Task } from '@/modules/tasks/types'
import { transformTaskForRadar } from '../lib/priority-utils'
import { RadarTaskDots } from './radar-task-dots'

const chartConfig = {
  value: {
    label: 'Priority',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

function prepareRadarData(tasks: Task[]) {
  const axes = [
    { axis: 'Impact', key: 'impact' },
    { axis: 'Severity', key: 'severity' },
    { axis: 'Timeliness', key: 'timeliness' },
    { axis: 'Effort', key: 'effort' },
    { axis: 'Strategic Fit', key: 'strategic_fit' },
  ]

  const avgData = axes.map(({ axis, key }) => {
    const values = tasks.map((t) => {
      const value = (t[key as keyof Task] as number) || 3
      return key === 'effort' ? 6 - value : value
    })
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 3

    return {
      axis,
      value: (avg / 5) * 100,
    }
  })

  return avgData
}

export default function TasksDashboardRadarWidget() {
  const { session } = useSupabase()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.access_token) return

    const fetchTasks = async () => {
      try {
        const response = await fetch('/api/modules/tasks/priorities', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!response.ok) throw new Error('Failed to fetch tasks')
        setTasks(await response.json())
      } catch (error) {
        console.error('Error fetching tasks:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [session])

  const priorityTasks = tasks
    .filter((task) => !task.completed)
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
    .slice(0, 5)

  const radarData = prepareRadarData(priorityTasks)

  if (loading) {
    return (
      <Card>
        <CardHeader className="items-center">
          <CardTitle>Priority Radar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="items-center pb-2">
        <CardTitle>Priority Radar</CardTitle>
        <CardDescription>Top 5 priority tasks across all axes</CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        <div className="relative">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[350px] w-full p-4"
          >
            <RadarChart data={radarData} margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fontSize: 11, fill: '#666', textAnchor: 'middle' }}
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
                stroke="hsl(var(--chart-1))"
                fill="hsl(var(--chart-1))"
                fillOpacity={0.3}
                strokeWidth={2}
              />
            </RadarChart>
          </ChartContainer>

          <RadarTaskDots
            tasks={priorityTasks}
            hoveredTask={hoveredTask}
            onTaskHover={setHoveredTask}
            onTaskClick={() => (window.location.href = '/tasks/radar')}
            limit={5}
          />
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm pt-2">
        <div className="text-muted-foreground flex items-center gap-2 leading-none text-xs">
          Closer to center = higher priority
        </div>
        <div className="flex gap-4 mt-1">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs">Overdue</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span className="text-xs">Due Soon</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-xs">Not Urgent</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
