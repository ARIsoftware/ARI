import { useQuery } from '@tanstack/react-query'
import { useModuleEnabled } from '@/lib/modules/module-hooks'

interface RandomQuote {
  quote: string
  author?: string
}

// Stable function identity so React Query memoizes the selection — an inline
// arrow would re-roll the quote on every render of the consuming page.
const pickRandomQuote = (quotes: RandomQuote[]): RandomQuote | null =>
  quotes.length > 0 ? quotes[Math.floor(Math.random() * quotes.length)] : null

/**
 * Random quote for the "quote under the page title" module convention.
 * Backed by React Query so the Chat and Settings pages share one fetch of the
 * quotes collection; the random pick happens in `select`.
 */
export function useRandomQuote(): { quotesEnabled: boolean; randomQuote: RandomQuote | null } {
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')

  const { data: randomQuote = null } = useQuery({
    queryKey: ['board-random-quote'],
    enabled: quotesEnabled && !quotesLoading,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RandomQuote[]> => {
      const res = await fetch('/api/modules/quotes/quotes')
      if (!res.ok) return []
      const quotes = await res.json()
      return Array.isArray(quotes) ? quotes : []
    },
    select: pickRandomQuote,
  })

  return { quotesEnabled, randomQuote }
}
