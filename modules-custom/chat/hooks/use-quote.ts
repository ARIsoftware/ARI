import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useModuleEnabled } from '@/lib/modules/module-hooks'

const QUOTES_KEY = ['chat-quotes']

export interface RandomQuote {
  quote: string
  author?: string
}

/**
 * Optional quotes-module integration shared by the chat pages. Fetches the
 * quote list once (cached across pages) and returns one at random, or null
 * when the quotes module is disabled, still loading, or the fetch failed.
 */
export function useRandomQuote(): RandomQuote | null {
  const { enabled, loading } = useModuleEnabled('quotes')

  const { data } = useQuery({
    queryKey: QUOTES_KEY,
    enabled: enabled && !loading,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RandomQuote[]> => {
      const res = await fetch('/api/modules/quotes/quotes')
      if (!res.ok) return []
      const quotes = await res.json()
      return Array.isArray(quotes) ? quotes : []
    },
  })

  return useMemo(() => {
    if (!data || data.length === 0) return null
    return data[Math.floor(Math.random() * data.length)]
  }, [data])
}
