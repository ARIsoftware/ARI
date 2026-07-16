'use client'

import { Loader2 } from 'lucide-react'
import '../styles.css'
import { MorningBriefOnboarding } from '../components/onboarding'
import { BriefView } from '../components/brief-view'
import { MorningBriefAboutDialog } from '../components/about-dialog'
import { useBriefData } from '../hooks/use-brief-data'

export default function MorningBriefPage() {
  const { ready, prerequisitesLoading, googleConnected, aiReady, briefProps, refresh, isRefreshing } =
    useBriefData()

  // Initial gate: wait for the two prerequisites to resolve before deciding.
  if (prerequisitesLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!ready) {
    return <MorningBriefOnboarding googleConnected={googleConnected} aiReady={aiReady} />
  }

  return (
    <div>
      {/* Screen-only page header. The random quote lives inside the letter
          (see BriefSheet's "Today's Quote" line). */}
      <div className="mb-no-print px-6 pt-6">
        <div className="flex items-center gap-1">
          <h1 className="text-4xl font-medium">Morning Brief</h1>
          <MorningBriefAboutDialog />
        </div>
      </div>

      <BriefView {...briefProps} onRefresh={refresh} isRefreshing={isRefreshing} />
    </div>
  )
}
