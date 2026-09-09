/**
 * Portfolio Module - Main Page
 *
 * Route: /portfolio
 *
 * Shows onboarding when settings.onboardingCompleted is false, otherwise the
 * full holdings view.
 */

'use client'

import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { usePortfolioSettings, useRandomQuote } from '../hooks/use-portfolio'
import { PortfolioOnboarding } from '../components/portfolio-onboarding'
import { PortfolioTable } from '../components/portfolio-table'

export default function PortfolioPage() {
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch: refetchSettings,
  } = usePortfolioSettings()
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')
  const { data: randomQuote } = useRandomQuote(quotesEnabled && !quotesLoading)

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading portfolio…</span>
      </div>
    )
  }

  // Don't fall through to onboarding on a failed settings fetch — that would
  // show the setup screen to an existing user.
  if (settingsError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Failed to load your portfolio settings.</p>
        <Button variant="outline" onClick={() => refetchSettings()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!settings?.onboardingCompleted) {
    return <PortfolioOnboarding />
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-4xl font-medium">Portfolio</h1>
        {quotesEnabled && randomQuote?.quote && (
          <p className="text-sm text-red-700 dark:text-red-400 mt-1">{randomQuote.quote}</p>
        )}
      </div>
      <PortfolioTable />
    </div>
  )
}
