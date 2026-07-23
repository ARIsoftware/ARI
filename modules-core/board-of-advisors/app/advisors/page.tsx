'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'
import { AdvisorList } from '@/modules/board-of-advisors/components/advisor-list'

export default function BoardOfAdvisorsAdvisorsPage() {
  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-medium">Advisors</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Manage who sits at the table and the order in which they speak.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-accent" />
            Your advisors
          </CardTitle>
          <CardDescription>
            Each advisor answers every question, in this order. Drag to change who speaks first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdvisorList />
        </CardContent>
      </Card>
    </div>
  )
}
