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
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchTasks = async () => {
      try {
        // Better Auth uses HTTP-only cookies — sent automatically with
        // same-origin fetch. Don't pass an Authorization header.
        const response = await fetch('/api/modules/tasks/priorities')
        if (!response.ok) throw new Error('Failed to fetch tasks')
        const json = await response.json()
        if (!cancelled) setTasks(json)
      } catch (error) {
        console.error('Error fetching tasks:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchTasks()
    return () => { cancelled = true }
  }, [])

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
        <CardDescription className="text-center">
          Task positions based on calculated priority scores
          <br />
          Showing 5 highest priority tasks — closer to center = higher priority
        </CardDescription>
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
                stroke="transparent"
                fill="transparent"
                fillOpacity={0}
                strokeWidth={0}
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
        <div className="flex gap-4">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs">Overdue</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span className="text-xs">Due Soon</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
