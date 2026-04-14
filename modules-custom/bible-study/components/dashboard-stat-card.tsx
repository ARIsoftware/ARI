'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, Eye, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

export default function BibleStudyDashboardStatCard() {
  const { data: kidsData, isLoading: kidsLoading } = useQuery({
    queryKey: ['dashboard-bible-study-kids'],
    queryFn: async () => {
      const res = await fetch('/api/modules/bible-study/kids-studies')
      if (!res.ok) return { count: 0 }
      return res.json()
    },
  })

  const { data: personalData, isLoading: personalLoading } = useQuery({
    queryKey: ['dashboard-bible-study-personal'],
    queryFn: async () => {
      const res = await fetch('/api/modules/bible-study/personal-studies')
      if (!res.ok) return { count: 0 }
      return res.json()
    },
  })

  const isLoading = kidsLoading || personalLoading
  const totalCount = (kidsData?.count ?? 0) + (personalData?.count ?? 0)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Bible Studies</CardTitle>
        <BookOpen className="h-4 w-4 text-amber-600" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="text-2xl font-medium">{totalCount}</div>
            <p className="text-xs text-muted-foreground">total studies</p>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs"
          onClick={() => (window.location.href = '/bible-study')}
        >
          <Eye className="w-3 h-3 mr-1" />
          View All
        </Button>
      </CardContent>
    </Card>
  )
}
