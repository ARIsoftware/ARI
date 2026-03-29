'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Eye, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

export default function ContactsDashboardStatCard() {
  const { data: contacts, isLoading } = useQuery({
    queryKey: ['dashboard-contacts'],
    queryFn: async () => {
      const res = await fetch('/api/modules/contacts')
      if (!res.ok) return []
      return res.json()
    },
  })

  const contactCount = contacts?.length ?? 0

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
        <Users className="h-4 w-4 text-purple-600" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="text-2xl font-medium">{contactCount}</div>
            <p className="text-xs text-muted-foreground">contacts in your network</p>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs"
          onClick={() => (window.location.href = '/contacts')}
        >
          <Eye className="w-3 h-3 mr-1" />
          View All
        </Button>
      </CardContent>
    </Card>
  )
}
