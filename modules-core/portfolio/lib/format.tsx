/**
 * Shared formatting helpers for portfolio prices and changes.
 * Used by both the main table view and the dashboard widget.
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export function formatPrice(value: number | null, currency: string | null): string {
  if (value === null) return '—'
  const fractionDigits = value >= 1000 ? 2 : value >= 1 ? 2 : 4
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value)
  } catch {
    return value.toFixed(fractionDigits)
  }
}

export function formatChange(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

export function formatChangePercent(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function changeColorClass(value: number | null): string {
  if (value === null || value === 0) return 'text-muted-foreground'
  return value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
}

export function ChangeIcon({
  value,
  className = 'w-3.5 h-3.5',
}: {
  value: number | null
  className?: string
}) {
  if (value === null || value === 0) return <Minus className={className} />
  return value > 0 ? <TrendingUp className={className} /> : <TrendingDown className={className} />
}
