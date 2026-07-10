'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import '../styles.css'
import { MorningBriefOnboarding } from '../components/onboarding'
import { BriefView } from '../components/brief-view'
import { MorningBriefAboutDialog } from '../components/about-dialog'
import { useBriefData } from '../hooks/use-brief-data'

export default function MorningBriefPage() {
  // Random quote under the page title when the Quotes module is enabled.
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')
  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)
  useEffect(() => {
    if (!quotesEnabled || quotesLoading) return
    let cancelled = false
    fetch('/api/modules/quotes/quotes')
      .then((res) => (res.ok ? res.json() : []))
      .then((quotes) => {
        if (!cancelled && Array.isArray(quotes) && quotes.length > 0) {
          setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)])
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [quotesEnabled, quotesLoading])

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
      {/* Screen-only page header + random quote */}
      <div className="mb-no-print px-6 pt-6">
        <div className="flex items-center gap-1">
          <h1 className="text-4xl font-medium">Morning Brief</h1>
          <MorningBriefAboutDialog />
        </div>
        {quotesEnabled && randomQuote && (
          <p className="mt-1 text-sm text-muted-foreground">{randomQuote.quote}</p>
        )}
      </div>

      <BriefView {...briefProps} onRefresh={refresh} isRefreshing={isRefreshing} />
    </div>
  )
}
