'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sunrise, Loader2, ArrowRight } from 'lucide-react'
import { useBriefData } from '@/modules/morning-brief/hooks/use-brief-data'
import { BriefView } from './brief-view'

/**
 * Dashboard widget for Morning Brief — renders the FULL brief (greeting,
 * priorities, schedule, weather) inline on the dashboard, reusing the same
 * <BriefView /> and data orchestration as the module page (embedded mode).
 */
export default function MorningBriefDashboardWidget() {
  const { ready, prerequisitesLoading, briefProps, refresh, isRefreshing } = useBriefData()

  if (prerequisitesLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // Not set up yet → compact prompt instead of the full brief. An AI provider is
  // the only requirement; a calendar is optional.
  if (!ready) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sunrise className="h-6 w-6 text-primary" />
          </span>
          <div>
            <p className="font-medium">Morning Brief</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose an AI provider to see your brief here.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/morning-brief/settings">
              Set up
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return <BriefView {...briefProps} embedded onRefresh={refresh} isRefreshing={isRefreshing} />
}
