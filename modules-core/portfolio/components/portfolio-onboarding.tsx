'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, LineChart, Plus, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useCompleteOnboarding, usePortfolioTickers } from '../hooks/use-portfolio'
import { SYMBOL_REGEX, SYMBOL_ERROR, normalizeSymbol } from '../lib/validation'

interface RowError {
  message: string
}

export function PortfolioOnboarding() {
  const { toast } = useToast()
  const completeOnboarding = useCompleteOnboarding()
  // Reachable with tickers already in the account (Settings > Reset
  // onboarding), so pre-filter re-entered symbols against what exists.
  const { data: existingTickers = [] } = usePortfolioTickers()

  const [symbols, setSymbols] = useState<string[]>([''])
  const [errors, setErrors] = useState<Record<number, RowError>>({})
  const submitting = completeOnboarding.isPending

  const updateRow = (idx: number, value: string) => {
    setSymbols((prev) => prev.map((s, i) => (i === idx ? value : s)))
    if (errors[idx]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[idx]
        return next
      })
    }
  }

  const addRow = () => {
    setSymbols((prev) => [...prev, ''])
  }

  const removeRow = (idx: number) => {
    setSymbols((prev) => prev.filter((_, i) => i !== idx))
    setErrors((prev) => {
      const next: Record<number, RowError> = {}
      Object.entries(prev).forEach(([key, val]) => {
        const k = Number(key)
        if (k < idx) next[k] = val
        else if (k > idx) next[k - 1] = val
      })
      return next
    })
  }

  const validate = (): { ok: boolean; cleaned: string[] } => {
    const cleaned: string[] = []
    const newErrors: Record<number, RowError> = {}
    const seen = new Set<string>()

    symbols.forEach((raw, idx) => {
      const normalized = normalizeSymbol(raw)
      if (!normalized) {
        newErrors[idx] = { message: 'Symbol is required' }
        return
      }
      if (!SYMBOL_REGEX.test(normalized)) {
        newErrors[idx] = { message: SYMBOL_ERROR }
        return
      }
      if (seen.has(normalized)) {
        newErrors[idx] = { message: 'Duplicate symbol' }
        return
      }
      seen.add(normalized)
      cleaned.push(normalized)
    })

    setErrors(newErrors)
    return { ok: Object.keys(newErrors).length === 0, cleaned }
  }

  const handleSubmit = () => {
    const { ok, cleaned } = validate()
    if (!ok || cleaned.length === 0) return

    // Symbols already in the account count as done — no need to re-add them.
    const existing = new Set(existingTickers.map((t) => t.symbol))
    const toAdd = cleaned.filter((s) => !existing.has(s))

    completeOnboarding.mutate(toAdd, {
      onSuccess: ({ failed }) => {
        if (failed.length > 0) {
          toast({
            variant: 'destructive',
            title: 'Some tickers could not be added',
            description: `${failed.map((f) => f.symbol).join(', ')} failed (${failed[0].message}). The rest were saved — press Get Started again to retry.`,
          })
        }
      },
      onError: (err) => {
        toast({
          variant: 'destructive',
          title: 'Failed to set up portfolio',
          description: err instanceof Error ? err.message : 'Please try again',
        })
      },
    })
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <LineChart className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to Portfolio</CardTitle>
          <CardDescription>
            Add the stock tickers you want to track. Prices come from Yahoo Finance and are cached
            for two minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {symbols.map((value, idx) => (
              <div key={idx} className="space-y-1">
                <Label htmlFor={`symbol-${idx}`}>
                  {idx === 0 ? 'First ticker *' : `Ticker ${idx + 1}`}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`symbol-${idx}`}
                    value={value}
                    maxLength={10}
                    placeholder="e.g. AAPL"
                    autoCapitalize="characters"
                    onChange={(e) => updateRow(idx, e.target.value)}
                    className={errors[idx] ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  />
                  {symbols.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(idx)}
                      aria-label={`Remove ticker ${idx + 1}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {errors[idx] && <p className="text-xs text-red-500">{errors[idx].message}</p>}
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={addRow}
            disabled={submitting}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add another ticker
          </Button>

          <Button type="button" className="w-full" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Get Started
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
