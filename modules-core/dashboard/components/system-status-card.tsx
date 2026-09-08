'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * System health at a glance — shared by the Boxy and Default dashboard
 * layouts. The status badge links to the full Health Check page.
 */
export function SystemStatusCard({ className = '' }: { className?: string }) {
  return (
    <Card className={`hover:shadow-md transition-shadow ${className}`.trim()}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">System Status</CardTitle>
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-medium">Online</div>
        <p className="text-xs text-muted-foreground">all systems operational</p>
        <Link href="/health" className="inline-block" title="Open Health Check">
          <Badge
            variant="secondary"
            className="mt-2 text-xs cursor-pointer transition-colors hover:bg-secondary/80"
          >
            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
            Healthy
          </Badge>
        </Link>
      </CardContent>
    </Card>
  )
}
