'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, Loader2, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface StudyItem {
  id: string
  title: string
  book: string
  chapter: number
  created_at: string
}

export default function BibleStudyDashboardWidget() {
  const { data: kidsData, isLoading: kidsLoading } = useQuery({
    queryKey: ['dashboard-bible-study-kids-widget'],
    queryFn: async () => {
      const res = await fetch('/api/modules/bible-study/kids-studies?limit=3')
      if (!res.ok) return { studies: [] }
      return res.json()
    },
  })

  const { data: personalData, isLoading: personalLoading } = useQuery({
    queryKey: ['dashboard-bible-study-personal-widget'],
    queryFn: async () => {
      const res = await fetch('/api/modules/bible-study/personal-studies?limit=3')
      if (!res.ok) return { studies: [] }
      return res.json()
    },
  })

  const isLoading = kidsLoading || personalLoading
  const allStudies: (StudyItem & { _type: string })[] = [
    ...(kidsData?.studies || []).map((s: StudyItem) => ({ ...s, _type: 'Kids' })),
    ...(personalData?.studies || []).map((s: StudyItem) => ({ ...s, _type: 'Personal' })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Recent Bible Studies
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/bible-study')}>
          View All <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : allStudies.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No studies yet</p>
        ) : (
          <div className="space-y-2">
            {allStudies.map((study) => (
              <div key={study.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{study.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {study.book} {study.chapter} &middot; {study._type} &middot; {new Date(study.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
