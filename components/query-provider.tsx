'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Refetch on window focus (user switches back to tab)
        refetchOnWindowFocus: true,
        // Retry failed requests once
        retry: 1,
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
