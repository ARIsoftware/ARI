'use client'

import { useEffect, useState } from 'react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'

/**
 * Page title with the standard ARI random-quote line (shown when the
 * Quotes module is enabled), shared by all Health Data pages. Page-level
 * controls (range picker, chart style) render top-right via `actions`.
 */
export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
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

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-4xl font-medium">{title}</h1>
        {quotesEnabled && randomQuote && (
          <p className="text-sm text-muted-foreground mt-1">{randomQuote.quote}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
