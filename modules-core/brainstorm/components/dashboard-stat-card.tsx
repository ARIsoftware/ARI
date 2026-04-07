'use client'

import { useBrainstormStats } from '@/modules/brainstorm/hooks/use-brainstorm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, Loader2, Network } from 'lucide-react'

export default function BrainstormDashboardStatCard() {
  const { data, isLoading } = useBrainstormStats()

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Brainstorm Ideas</CardTitle>
        <Network className="h-4 w-4 text-violet-600" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="text-2xl font-medium">{data?.total_ideas_created ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              ideas across {data?.total_boards ?? 0} {(data?.total_boards ?? 0) === 1 ? 'board' : 'boards'}
            </p>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full text-xs"
          onClick={() => { window.location.href = '/brainstorm' }}
        >
          <Eye className="mr-1 h-3 w-3" />
          View All
        </Button>
      </CardContent>
    </Card>
  )
}
