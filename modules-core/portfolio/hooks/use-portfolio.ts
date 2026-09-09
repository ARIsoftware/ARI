/**
 * Portfolio Module - TanStack Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MAX_SYMBOLS_PER_REQUEST } from '../lib/validation'
import type { PortfolioTicker, PortfolioSettings, TickerQuote } from '../types'

const TICKERS_KEY = ['portfolio-tickers']
const SETTINGS_KEY = ['portfolio-settings']
const QUOTES_KEY = (symbols: string[]) => ['portfolio-quotes', ...symbols]
const RANDOM_QUOTE_KEY = ['portfolio-random-quote']

const QUOTE_CACHE_MS = 120_000 // matches server 2-min cache

function describeError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'details' in err) {
    const details = (err as { details?: Array<{ message?: string }> }).details
    if (Array.isArray(details) && details.length > 0) {
      return details
        .map((d) => d.message)
        .filter(Boolean)
        .join(', ')
    }
  }
  if (
    err &&
    typeof err === 'object' &&
    'error' in err &&
    typeof (err as { error: unknown }).error === 'string'
  ) {
    return (err as { error: string }).error
  }
  return fallback
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return describeError(body, fallback)
  } catch {
    return fallback
  }
}

/**
 * List the current user's portfolio tickers (ordered by position).
 */
export function usePortfolioTickers() {
  return useQuery({
    queryKey: TICKERS_KEY,
    queryFn: async (): Promise<PortfolioTicker[]> => {
      const res = await fetch('/api/modules/portfolio/tickers')
      if (!res.ok) {
        throw new Error(await readError(res, 'Failed to fetch tickers'))
      }
      const data = await res.json()
      return data.tickers || []
    },
  })
}

/**
 * Add a new ticker. Optimistic-insert at the bottom of the list.
 */
export function useAddTicker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      symbol: string
      shares: number | null
    }): Promise<PortfolioTicker> => {
      const res = await fetch('/api/modules/portfolio/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        throw new Error(await readError(res, 'Failed to add ticker'))
      }
      const data = await res.json()
      return data.ticker
    },
    onMutate: async ({ symbol, shares }) => {
      await queryClient.cancelQueries({ queryKey: TICKERS_KEY })
      const previous = queryClient.getQueryData<PortfolioTicker[]>(TICKERS_KEY)
      const nextPosition =
        previous && previous.length > 0 ? Math.max(...previous.map((t) => t.position)) + 1 : 0

      queryClient.setQueryData<PortfolioTicker[]>(TICKERS_KEY, (old = []) => [
        ...old,
        {
          id: 'temp-' + Date.now(),
          user_id: '',
          symbol: symbol.toUpperCase(),
          shares: shares == null ? null : shares.toString(),
          position: nextPosition,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      return { previous }
    },
    onError: (_err, _symbol, context) => {
      if (context?.previous) {
        queryClient.setQueryData(TICKERS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TICKERS_KEY })
    },
  })
}

/**
 * Update a ticker's symbol and/or shares.
 */
export function useUpdateTicker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      symbol?: string
      shares?: number | null
    }): Promise<PortfolioTicker> => {
      const { id, ...body } = input
      const res = await fetch(`/api/modules/portfolio/tickers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(await readError(res, 'Failed to update ticker'))
      }
      const data = await res.json()
      return data.ticker
    },
    onMutate: async ({ id, symbol, shares }) => {
      await queryClient.cancelQueries({ queryKey: TICKERS_KEY })
      const previous = queryClient.getQueryData<PortfolioTicker[]>(TICKERS_KEY)

      queryClient.setQueryData<PortfolioTicker[]>(TICKERS_KEY, (old = []) =>
        old.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(symbol !== undefined ? { symbol: symbol.toUpperCase() } : {}),
                ...(shares !== undefined
                  ? { shares: shares == null ? null : shares.toString() }
                  : {}),
              }
            : t,
        ),
      )

      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(TICKERS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TICKERS_KEY })
    },
  })
}

/**
 * Delete a ticker by id.
 */
export function useDeleteTicker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/portfolio/tickers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(await readError(res, 'Failed to delete ticker'))
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TICKERS_KEY })
      const previous = queryClient.getQueryData<PortfolioTicker[]>(TICKERS_KEY)

      queryClient.setQueryData<PortfolioTicker[]>(TICKERS_KEY, (old = []) =>
        old.filter((t) => t.id !== id),
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(TICKERS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TICKERS_KEY })
    },
  })
}

/**
 * Fetch live quotes for an array of symbols. The query key includes the
 * symbol list so adding/removing a ticker invalidates correctly. We mirror
 * the server's 2-min cache on the client to avoid pointless requests.
 */
export function useQuotes(symbols: string[], enabled = true) {
  const sorted = [...symbols].sort()
  return useQuery({
    queryKey: QUOTES_KEY(sorted),
    queryFn: async (): Promise<TickerQuote[]> => {
      if (sorted.length === 0) return []
      // The server caps symbols per request, so fetch in chunks and merge —
      // a portfolio over the cap still gets all its prices.
      const chunks: string[][] = []
      for (let i = 0; i < sorted.length; i += MAX_SYMBOLS_PER_REQUEST) {
        chunks.push(sorted.slice(i, i + MAX_SYMBOLS_PER_REQUEST))
      }
      const responses = await Promise.all(
        chunks.map(async (chunk): Promise<TickerQuote[]> => {
          const res = await fetch(
            `/api/modules/portfolio/quotes?symbols=${encodeURIComponent(chunk.join(','))}`,
          )
          if (!res.ok) {
            throw new Error(await readError(res, 'Failed to fetch quotes'))
          }
          const data = await res.json()
          return data.quotes || []
        }),
      )
      return responses.flat()
    },
    enabled: enabled && sorted.length > 0,
    staleTime: QUOTE_CACHE_MS,
    refetchInterval: QUOTE_CACHE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })
}

/**
 * Random quote of the day from the Quotes module (cross-module, optional).
 * Pass enabled=false when the quotes module is disabled.
 */
export function useRandomQuote(enabled: boolean) {
  return useQuery({
    queryKey: RANDOM_QUOTE_KEY,
    queryFn: async (): Promise<{ quote: string; author?: string | null } | null> => {
      const res = await fetch('/api/modules/quotes/quotes/random')
      if (!res.ok) {
        throw new Error('Failed to fetch quote')
      }
      return await res.json()
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  })
}

/**
 * Fetch module settings.
 */
export function usePortfolioSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<PortfolioSettings>> => {
      const res = await fetch('/api/modules/portfolio/settings')
      // A missing settings row is a 200 with {} — any non-OK status is a real
      // error and must surface (the page gates onboarding on this data, so
      // swallowing it as {} would show onboarding to an existing user).
      if (!res.ok) {
        throw new Error(await readError(res, 'Failed to fetch settings'))
      }
      return await res.json()
    },
  })
}

export interface OnboardingResult {
  added: string[]
  failed: { symbol: string; message: string }[]
}

/**
 * Complete onboarding: add each symbol, then mark onboarding done.
 *
 * A 409 ("already in portfolio") counts as success so a retry after a
 * partial failure converges instead of getting stuck, and a single cache
 * invalidation runs at the end rather than one per added symbol. The
 * completed flag is only set when every symbol went through; the result
 * reports which symbols failed so the caller can surface them.
 */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (symbols: string[]): Promise<OnboardingResult> => {
      const added: string[] = []
      const failed: { symbol: string; message: string }[] = []

      for (const symbol of symbols) {
        const res = await fetch('/api/modules/portfolio/tickers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, shares: null }),
        })
        if (res.ok || res.status === 409) {
          added.push(symbol)
        } else {
          failed.push({ symbol, message: await readError(res, 'Failed to add ticker') })
        }
      }

      if (failed.length === 0) {
        const res = await fetch('/api/modules/portfolio/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onboardingCompleted: true }),
        })
        if (!res.ok) {
          throw new Error(await readError(res, 'Failed to save settings'))
        }
      }

      return { added, failed }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TICKERS_KEY })
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}

/**
 * Update module settings with optimistic merge.
 */
export function useUpdatePortfolioSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<PortfolioSettings>): Promise<void> => {
      const res = await fetch('/api/modules/portfolio/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        throw new Error(await readError(res, 'Failed to save settings'))
      }
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<PortfolioSettings>>(SETTINGS_KEY)

      queryClient.setQueryData<Partial<PortfolioSettings>>(SETTINGS_KEY, (old = {}) => ({
        ...old,
        ...newSettings,
      }))

      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SETTINGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}
