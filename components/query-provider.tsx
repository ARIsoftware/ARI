'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // No automatic refetch on tab refocus. This is a personal-use app
        // where the user is the only writer — server state can't have
        // changed while they were on another tab. Queries that genuinely
        // need realtime opt in with `refetchOnWindowFocus: true` or
        // `refetchInterval`. (Removes 5+ redundant DB roundtrips per
        // alt-tab on the dashboard alone.)
        refetchOnWindowFocus: false,
        // Retry failed requests once, but never retry 429s to avoid amplifying rate limits
        retry: (failureCount, error) => {
          if (error instanceof Error && error.message.includes('429')) return false
          return failureCount < 1
        },
        // Consider data fresh for 5 minutes. Mutations still invalidate
        // their query keys explicitly, so writes show up immediately;
        // this only suppresses redundant background refetches.
        staleTime: 5 * 60 * 1000,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
