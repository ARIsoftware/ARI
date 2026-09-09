'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LineChart, Loader2, AlertCircle } from 'lucide-react'
import { usePortfolioSettings, usePortfolioTickers, useQuotes } from '../hooks/use-portfolio'
import {
  ChangeIcon,
  changeColorClass,
  formatChange,
  formatChangePercent,
  formatPrice,
} from '../lib/format'
import { computePortfolioValue, formatTotalValue } from '../lib/portfolio-value'
import type { TickerQuote } from '../types'

export default function PortfolioDashboardWidget() {
  const router = useRouter()
  const { data: settings, isLoading: settingsLoading } = usePortfolioSettings()
  const { data: tickers = [], isLoading: tickersLoading } = usePortfolioTickers()

  const symbols = useMemo(() => tickers.map((t) => t.symbol), [tickers])
  const quotesQuery = useQuotes(symbols, !tickersLoading && tickers.length > 0)
  const quotesBySymbol = useMemo(() => {
    const map = new Map<string, TickerQuote>()
    quotesQuery.data?.forEach((q) => map.set(q.symbol, q))
    return map
  }, [quotesQuery.data])

  const valueSummary = useMemo(
    () => computePortfolioValue(tickers, quotesBySymbol),
    [tickers, quotesBySymbol],
  )

  // Hide widget while loading anything, when disabled, or when there are no tickers.
  if (settingsLoading || tickersLoading) return null
  if (settings?.showDashboardWidget === false) return null
  if (tickers.length === 0) return null

  const previewTickers = tickers.slice(0, 5)
  const remaining = tickers.length - previewTickers.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <LineChart className="w-4 h-4" />
          Portfolio
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {tickers.length} {tickers.length === 1 ? 'ticker' : 'tickers'}
        </span>
      </CardHeader>
      <CardContent>
        {quotesQuery.isError && (
          <p className="inline-flex items-center gap-1.5 text-xs text-destructive mb-2">
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
            Prices could not be loaded.
          </p>
        )}
        {valueSummary.holdingsCount > 0 && valueSummary.totalValue != null && (
          <div className="mb-3 pb-3 border-b">
            <div className="text-2xl font-semibold tabular-nums">
              {formatTotalValue(valueSummary.totalValue, valueSummary.currency)}
            </div>
            {valueSummary.change != null && valueSummary.changePercent != null && (
              <div
                className={`inline-flex items-center gap-1 text-sm mt-0.5 ${changeColorClass(valueSummary.change)}`}
              >
                <ChangeIcon value={valueSummary.change} className="w-3.5 h-3.5" />
                <span>
                  {formatChange(valueSummary.change)} (
                  {formatChangePercent(valueSummary.changePercent)})
                </span>
                <span className="text-muted-foreground ml-1">today</span>
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          {previewTickers.map((ticker) => {
            const quote = quotesBySymbol.get(ticker.symbol)
            const loadingQuote = quotesQuery.isLoading && !quote
            return (
              <div
                key={ticker.id}
                className="flex items-center justify-between text-sm border-b last:border-b-0 pb-2 last:pb-0"
              >
                <span className="font-medium">{ticker.symbol}</span>
                <div className="flex items-center gap-2">
                  {loadingQuote ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : quote?.error ? (
                    <span className="inline-flex items-center text-red-500 gap-1 text-xs">
                      <AlertCircle className="w-3 h-3" />
                      Error
                    </span>
                  ) : (
                    <>
                      <span>{formatPrice(quote?.price ?? null, quote?.currency ?? null)}</span>
                      <span
                        className={`inline-flex items-center gap-0.5 text-xs ${changeColorClass(quote?.change_percent ?? null)}`}
                      >
                        <ChangeIcon value={quote?.change_percent ?? null} className="w-3 h-3" />
                        {formatChangePercent(quote?.change_percent ?? null)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {remaining > 0 && (
            <p className="text-xs text-muted-foreground pt-1">+ {remaining} more</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 text-xs"
          onClick={() => router.push('/portfolio')}
        >
          View portfolio
        </Button>
      </CardContent>
    </Card>
  )
}
