'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckSquare, Eye, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

export default function TasksDashboardStatCard() {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['dashboard-tasks'],
    queryFn: async () => {
      const res = await fetch('/api/modules/tasks')
      if (!res.ok) throw new Error('Failed to fetch tasks')
      return res.json()
    },
  })

  const taskCount = tasks?.length ?? 0

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
        <CheckSquare className="h-4 w-4 text-blue-600" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="text-2xl font-medium">{taskCount}</div>
            <p className="text-xs text-muted-foreground">tasks in your system</p>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs"
          onClick={() => (window.location.href = '/tasks')}
        >
          <Eye className="w-3 h-3 mr-1" />
          View All
        </Button>
      </CardContent>
    </Card>
  )
}
