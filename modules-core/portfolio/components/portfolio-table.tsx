'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Loader2, Pencil, Plus, RefreshCw, Trash2, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  useAddTicker,
  useDeleteTicker,
  usePortfolioTickers,
  useQuotes,
  useUpdateTicker,
} from '../hooks/use-portfolio'
import { SYMBOL_REGEX, SYMBOL_ERROR, normalizeSymbol } from '../lib/validation'
import {
  ChangeIcon,
  changeColorClass,
  formatChange,
  formatChangePercent,
  formatPrice,
} from '../lib/format'
import type { PortfolioTicker, TickerQuote } from '../types'

export function PortfolioTable() {
  const { toast } = useToast()
  const {
    data: tickers = [],
    isLoading: tickersLoading,
    isError: tickersError,
    refetch: refetchTickers,
  } = usePortfolioTickers()
  const addTicker = useAddTicker()
  const deleteTicker = useDeleteTicker()
  const [editingTicker, setEditingTicker] = useState<PortfolioTicker | null>(null)
  const [deletingTicker, setDeletingTicker] = useState<PortfolioTicker | null>(null)

  const symbols = useMemo(() => tickers.map((t) => t.symbol), [tickers])
  const quotesQuery = useQuotes(symbols, !tickersLoading)
  const quotesBySymbol = useMemo(() => {
    const map = new Map<string, TickerQuote>()
    quotesQuery.data?.forEach((q) => map.set(q.symbol, q))
    return map
  }, [quotesQuery.data])

  const [newSymbol, setNewSymbol] = useState('')
  const [newShares, setNewShares] = useState('')
  const [newSymbolError, setNewSymbolError] = useState<string | null>(null)
  const [newSharesError, setNewSharesError] = useState<string | null>(null)

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = normalizeSymbol(newSymbol)
    if (!normalized) {
      setNewSymbolError('Symbol is required')
      return
    }
    if (!SYMBOL_REGEX.test(normalized)) {
      setNewSymbolError(SYMBOL_ERROR)
      return
    }
    if (tickers.some((t) => t.symbol === normalized)) {
      setNewSymbolError(`${normalized} is already in your portfolio`)
      return
    }

    let sharesValue: number | null = null
    const sharesTrimmed = newShares.trim()
    if (sharesTrimmed !== '') {
      const parsed = Number(sharesTrimmed)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setNewSharesError('Shares must be zero or a positive number')
        return
      }
      sharesValue = parsed
    }

    setNewSymbolError(null)
    setNewSharesError(null)
    setNewSymbol('')
    setNewShares('')
    addTicker.mutate(
      { symbol: normalized, shares: sharesValue },
      {
        onError: (err) => {
          setNewSymbol(normalized)
          if (sharesValue !== null) setNewShares(sharesTrimmed)
          toast({
            variant: 'destructive',
            title: 'Failed to add ticker',
            description: err instanceof Error ? err.message : 'Please try again',
          })
        },
      },
    )
  }

  const handleDeleteConfirmed = () => {
    if (!deletingTicker) return
    const { id, symbol } = deletingTicker
    setDeletingTicker(null)
    deleteTicker.mutate(id, {
      onError: (err) => {
        toast({
          variant: 'destructive',
          title: `Failed to remove ${symbol}`,
          description: err instanceof Error ? err.message : 'Please try again',
        })
      },
    })
  }

  const lastFetched = quotesQuery.dataUpdatedAt
    ? new Date(quotesQuery.dataUpdatedAt).toLocaleTimeString()
    : null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add a ticker</CardTitle>
          <CardDescription>
            Enter a stock ticker symbol (e.g. AAPL, MSFT, BRK-B). Max 10 characters. Shares are
            optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-1">
            <div className="flex gap-2">
              <Input
                value={newSymbol}
                maxLength={10}
                placeholder="e.g. AAPL"
                aria-label="Ticker symbol"
                autoCapitalize="characters"
                onChange={(e) => {
                  setNewSymbol(e.target.value)
                  if (newSymbolError) setNewSymbolError(null)
                }}
                disabled={addTicker.isPending}
                className={`flex-1 basis-0 ${newSymbolError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={newShares}
                placeholder="Shares (optional)"
                aria-label="Number of shares (optional)"
                onChange={(e) => {
                  setNewShares(e.target.value)
                  if (newSharesError) setNewSharesError(null)
                }}
                disabled={addTicker.isPending}
                className={`flex-1 basis-0 ${newSharesError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              />
              <Button type="submit" disabled={addTicker.isPending || !newSymbol.trim()}>
                {addTicker.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </>
                )}
              </Button>
            </div>
            {newSymbolError && <p className="text-xs text-red-500">{newSymbolError}</p>}
            {newSharesError && <p className="text-xs text-red-500">{newSharesError}</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Holdings</CardTitle>
            <CardDescription>
              {lastFetched ? (
                <>
                  Last updated {lastFetched}
                  {quotesQuery.data?.some((q) => q.cached) ? ' (cached)' : ''}
                </>
              ) : (
                'Live prices from Yahoo Finance, cached for 2 minutes.'
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => quotesQuery.refetch()}
            disabled={quotesQuery.isFetching || symbols.length === 0}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${quotesQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {tickersError ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <span className="inline-flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4" aria-hidden="true" />
                Failed to load your tickers.
              </span>
              <Button variant="outline" size="sm" onClick={() => refetchTickers()}>
                Try again
              </Button>
            </div>
          ) : tickersLoading ? (
            <div className="flex items-center justify-center py-12" role="status">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Loading tickers…</span>
            </div>
          ) : tickers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No tickers yet. Add one above to start tracking prices.</p>
            </div>
          ) : (
            <>
              {quotesQuery.isError && (
                <div className="flex items-center justify-between gap-3 mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4" aria-hidden="true" />
                    Prices could not be loaded.
                  </span>
                  <Button variant="outline" size="sm" onClick={() => quotesQuery.refetch()}>
                    Retry
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Exchange</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Change %</TableHead>
                    <TableHead className="text-right">Prev close</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickers.map((ticker) => {
                    const quote = quotesBySymbol.get(ticker.symbol)
                    const isLoadingQuote = quotesQuery.isLoading && !quote
                    return (
                      <TableRow key={ticker.id}>
                        <TableCell className="font-medium">{ticker.symbol}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {quote?.exchange || (isLoadingQuote ? '…' : '—')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ticker.shares != null && ticker.shares !== ''
                            ? Number(ticker.shares).toLocaleString(undefined, {
                                maximumFractionDigits: 8,
                              })
                            : '0'}
                        </TableCell>
                        <TableCell className="text-right">
                          {isLoadingQuote ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />
                          ) : quote?.error ? (
                            <span className="inline-flex items-center text-red-500 gap-1 text-sm">
                              <AlertCircle className="w-3.5 h-3.5" />
                              {quote.error}
                            </span>
                          ) : (
                            formatPrice(quote?.price ?? null, quote?.currency ?? null)
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right ${changeColorClass(quote?.change ?? null)}`}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            <ChangeIcon value={quote?.change ?? null} />
                            {formatChange(quote?.change ?? null)}
                          </span>
                        </TableCell>
                        <TableCell
                          className={`text-right ${changeColorClass(quote?.change_percent ?? null)}`}
                        >
                          {formatChangePercent(quote?.change_percent ?? null)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatPrice(quote?.prev_close ?? null, quote?.currency ?? null)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingTicker(ticker)}
                              aria-label={`Edit ${ticker.symbol}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingTicker(ticker)}
                              disabled={deleteTicker.isPending}
                              aria-label={`Remove ${ticker.symbol}`}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <EditTickerDialog
        ticker={editingTicker}
        onClose={() => setEditingTicker(null)}
        otherSymbols={tickers.filter((t) => t.id !== editingTicker?.id).map((t) => t.symbol)}
      />

      <AlertDialog
        open={deletingTicker !== null}
        onOpenChange={(o) => !o && setDeletingTicker(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deletingTicker?.symbol}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deletingTicker?.symbol} and its share count from your portfolio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirmed}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EditTickerDialog({
  ticker,
  onClose,
  otherSymbols,
}: {
  ticker: PortfolioTicker | null
  onClose: () => void
  otherSymbols: string[]
}) {
  return (
    <Dialog open={ticker !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit ticker</DialogTitle>
          <DialogDescription>Update the symbol or number of shares.</DialogDescription>
        </DialogHeader>
        {ticker && (
          // Keyed by ticker so the form remounts with fresh state per edit —
          // no populate-on-open effect needed.
          <EditTickerForm
            key={ticker.id}
            ticker={ticker}
            onClose={onClose}
            otherSymbols={otherSymbols}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditTickerForm({
  ticker,
  onClose,
  otherSymbols,
}: {
  ticker: PortfolioTicker
  onClose: () => void
  otherSymbols: string[]
}) {
  const { toast } = useToast()
  const updateTicker = useUpdateTicker()
  const [symbol, setSymbol] = useState(ticker.symbol)
  const [shares, setShares] = useState(ticker.shares ?? '')
  const [symbolError, setSymbolError] = useState<string | null>(null)
  const [sharesError, setSharesError] = useState<string | null>(null)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    const normalized = normalizeSymbol(symbol)
    if (!normalized) {
      setSymbolError('Symbol is required')
      return
    }
    if (!SYMBOL_REGEX.test(normalized)) {
      setSymbolError(SYMBOL_ERROR)
      return
    }
    if (otherSymbols.includes(normalized)) {
      setSymbolError(`${normalized} is already in your portfolio`)
      return
    }

    let sharesValue: number | null = null
    const sharesTrimmed = shares.trim()
    if (sharesTrimmed !== '') {
      const parsed = Number(sharesTrimmed)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setSharesError('Shares must be zero or a positive number')
        return
      }
      sharesValue = parsed
    }

    const symbolChanged = normalized !== ticker.symbol
    const previousShares = ticker.shares == null ? null : Number(ticker.shares)
    const sharesChanged = previousShares !== sharesValue

    if (!symbolChanged && !sharesChanged) {
      onClose()
      return
    }

    updateTicker.mutate(
      {
        id: ticker.id,
        ...(symbolChanged ? { symbol: normalized } : {}),
        ...(sharesChanged ? { shares: sharesValue } : {}),
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          toast({
            variant: 'destructive',
            title: 'Failed to update ticker',
            description: err instanceof Error ? err.message : 'Please try again',
          })
        },
      },
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-symbol">Symbol</Label>
        <Input
          id="edit-symbol"
          value={symbol}
          maxLength={10}
          autoCapitalize="characters"
          onChange={(e) => {
            setSymbol(e.target.value)
            if (symbolError) setSymbolError(null)
          }}
          disabled={updateTicker.isPending}
          className={symbolError ? 'border-red-500 focus-visible:ring-red-500' : ''}
        />
        {symbolError && <p className="text-xs text-red-500">{symbolError}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-shares">Shares</Label>
        <Input
          id="edit-shares"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={shares}
          placeholder="Optional"
          onChange={(e) => {
            setShares(e.target.value)
            if (sharesError) setSharesError(null)
          }}
          disabled={updateTicker.isPending}
          className={sharesError ? 'border-red-500 focus-visible:ring-red-500' : ''}
        />
        {sharesError && <p className="text-xs text-red-500">{sharesError}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={updateTicker.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateTicker.isPending}>
          {updateTicker.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
