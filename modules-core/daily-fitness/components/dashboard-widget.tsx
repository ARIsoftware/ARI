'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Trophy, TrendingUp, CheckSquare, Loader2, Target } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

const DEFAULT_STATS: FitnessStats = {
  averageCompletionsPerDay: 0,
  mostCompletedTask: null,
  leastCompletedTask: null,
  totalCompletions: 0,
}

export default function FitnessDashboardWidget() {
  const { data: stats = DEFAULT_STATS, isLoading } = useQuery({
    queryKey: ['dashboard-fitness-stats'],
    queryFn: async (): Promise<FitnessStats> => {
      const res = await fetch('/api/fitness-stats')
      if (!res.ok) return DEFAULT_STATS
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4 col-span-2">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-medium">Fitness Performance</h2>
        </div>
        <div className="flex items-center justify-center h-[120px]">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 col-span-2">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-medium">Fitness Performance</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">
              {stats.averageCompletionsPerDay.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">fitness tasks completed per day</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Performer</CardTitle>
            <Trophy className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{stats.mostCompletedTask?.count || 0}</div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {stats.mostCompletedTask?.title || 'No tasks completed yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
            <TrendingUp className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{stats.leastCompletedTask?.count || 0}</div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {stats.leastCompletedTask?.title || 'No tasks to show'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Completions</CardTitle>
            <CheckSquare className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{stats.totalCompletions}</div>
            <p className="text-xs text-muted-foreground">all-time fitness task completions</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
