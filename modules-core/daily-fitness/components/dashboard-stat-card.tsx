'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trophy, Eye, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

export default function FitnessDashboardStatCard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-fitness-stats'],
    queryFn: async (): Promise<FitnessStats> => {
      const res = await fetch('/api/fitness-stats')
      if (!res.ok) return { averageCompletionsPerDay: 0, mostCompletedTask: null, leastCompletedTask: null, totalCompletions: 0 }
      return res.json()
    },
  })

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Fitness Score</CardTitle>
        <Trophy className="h-4 w-4 text-yellow-600" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="text-2xl font-medium">{stats?.totalCompletions ?? 0}</div>
            <p className="text-xs text-muted-foreground">total completions</p>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs"
          onClick={() => (window.location.href = '/daily-fitness')}
        >
          <Eye className="w-3 h-3 mr-1" />
          View Fitness
        </Button>
      </CardContent>
    </Card>
  )
}
