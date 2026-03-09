'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Refetch on window focus (user switches back to tab)
        refetchOnWindowFocus: true,
        // Retry failed requests once, but never retry 429s to avoid amplifying rate limits
        retry: (failureCount, error) => {
          if (error instanceof Error && error.message.includes('429')) return false
          return failureCount < 1
        },
        // Consider data fresh for 30 seconds
        staleTime: 30 * 1000,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
