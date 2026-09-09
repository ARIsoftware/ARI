/**
 * Timeline Module - TanStack Query Hooks
 *
 * Usage:
 *   import { useTimelineEvents, useCreateTimelineEvent } from '@/modules/timeline/hooks/use-timeline'
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { TimelineEvent, TimelineEventInput, UpdateTimelineEventRequest } from '../types'

const EVENTS_KEY = ['timeline-events']
const QUOTE_KEY = ['timeline-random-quote']

/** Server-side page size cap (see lib/validation.ts listEventsQuerySchema). */
const EVENTS_PAGE_SIZE = 500

/** Build an Error from an API response, surfacing Zod issue messages when present. */
async function parseApiError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({}))
  const details = Array.isArray(err.details)
    ? err.details.map((d: { message?: string }) => d.message).filter(Boolean).join(', ')
    : ''
  return new Error(details || err.error || fallback)
}

/**
 * Random quote for the page header, shown when the Quotes module is enabled.
 * Decorative: no retries, cached for the session, silently absent on failure.
 */
export function useRandomQuote(enabled: boolean) {
  return useQuery({
    queryKey: QUOTE_KEY,
    queryFn: async (): Promise<{ quote: string; author?: string } | null> => {
      const res = await fetch('/api/modules/quotes/quotes/random')
      if (!res.ok) return null
      return res.json()
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  })
}

export function useTimelineEvents() {
  return useQuery({
    queryKey: EVENTS_KEY,
    queryFn: async (): Promise<TimelineEvent[]> => {
      // The chart needs every event in the range, so page through until done.
      const all: TimelineEvent[] = []
      let offset = 0
      for (;;) {
        const res = await fetch(
          `/api/modules/timeline/events?limit=${EVENTS_PAGE_SIZE}&offset=${offset}`
        )
        if (!res.ok) throw await parseApiError(res, 'Failed to fetch events')
        const data = await res.json()
        const page: TimelineEvent[] = data.events || []
        all.push(...page)
        if (page.length < EVENTS_PAGE_SIZE) break
        offset += EVENTS_PAGE_SIZE
      }
      return all
    },
  })
}

export function useCreateTimelineEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: TimelineEventInput): Promise<TimelineEvent> => {
      const res = await fetch('/api/modules/timeline/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await parseApiError(res, 'Failed to create event')
      const data = await res.json()
      return data.event
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: EVENTS_KEY })
      const previous = queryClient.getQueryData<TimelineEvent[]>(EVENTS_KEY)

      queryClient.setQueryData<TimelineEvent[]>(EVENTS_KEY, (old = []) => [
        ...old,
        {
          id: 'temp-' + Date.now(),
          user_id: '',
          name: input.name,
          event_date: input.event_date,
          color: input.color ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(EVENTS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY })
    },
  })
}

export function useUpdateTimelineEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateTimelineEventRequest): Promise<TimelineEvent> => {
      const res = await fetch('/api/modules/timeline/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await parseApiError(res, 'Failed to update event')
      const data = await res.json()
      return data.event
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: EVENTS_KEY })
      const previous = queryClient.getQueryData<TimelineEvent[]>(EVENTS_KEY)

      queryClient.setQueryData<TimelineEvent[]>(EVENTS_KEY, (old = []) =>
        old.map((e) =>
          e.id === input.id
            ? { ...e, name: input.name, event_date: input.event_date, color: input.color ?? null }
            : e
        )
      )

      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(EVENTS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY })
    },
  })
}

export function useDeleteTimelineEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/timeline/events?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw await parseApiError(res, 'Failed to delete event')
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: EVENTS_KEY })
      const previous = queryClient.getQueryData<TimelineEvent[]>(EVENTS_KEY)

      queryClient.setQueryData<TimelineEvent[]>(EVENTS_KEY, (old = []) =>
        old.filter((e) => e.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(EVENTS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY })
    },
  })
}
