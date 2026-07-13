'use client'

import { useEffect, useState } from 'react'

export type ChartStyle = 'bars' | 'spark'

const STORAGE_KEY = 'health-data-chart-style'

/**
 * Chart style preference (bar graphs vs sparklines), shared across all
 * Health Data pages via localStorage.
 */
export function useChartStyle(): [ChartStyle, (style: ChartStyle) => void] {
  const [style, setStyle] = useState<ChartStyle>('bars')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'spark' || saved === 'bars') setStyle(saved)
  }, [])

  const update = (next: ChartStyle) => {
    setStyle(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing — preference just won't persist
    }
  }

  return [style, update]
}
