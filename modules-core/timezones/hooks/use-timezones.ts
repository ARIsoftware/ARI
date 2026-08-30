/**
 * Timezones Module - TanStack Query Hooks
 *
 * Usage:
 *   import { useTimezonePeople } from '@/modules/timezones/hooks/use-timezones'
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreatePersonRequest,
  TimezonePerson,
  TimezonesSettings,
  UpdatePersonRequest,
} from '../types'

const PEOPLE_KEY = ['timezones-people']
const SETTINGS_KEY = ['timezones-settings']
const RANDOM_QUOTE_KEY = ['timezones-random-quote']

/**
 * Surface Zod issue messages from the API so the dialog can show what was
 * actually wrong instead of a generic failure.
 */
async function readError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}) as Record<string, unknown>)
  const details: unknown[] = Array.isArray(body.details) ? body.details : []
  const issues: string[] = []
  for (const issue of details) {
    if (typeof issue === 'object' && issue !== null && 'message' in issue) {
      const message = String((issue as { message: unknown }).message)
      if (message) issues.push(message)
    }
  }

  if (issues.length > 0) return new Error(issues.join(', '))
  return new Error(typeof body.error === 'string' ? body.error : fallback)
}

export function useTimezonePeople() {
  return useQuery({
    queryKey: PEOPLE_KEY,
    queryFn: async (): Promise<TimezonePerson[]> => {
      const res = await fetch('/api/modules/timezones/people')
      if (!res.ok) throw await readError(res, 'Failed to load people')
      const data = await res.json()
      return data.people ?? []
    },
  })
}

export function useCreateTimezonePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (person: CreatePersonRequest): Promise<TimezonePerson> => {
      const res = await fetch('/api/modules/timezones/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(person),
      })
      if (!res.ok) throw await readError(res, 'Failed to add person')
      const data = await res.json()
      return data.person
    },
    onMutate: async (person) => {
      await queryClient.cancelQueries({ queryKey: PEOPLE_KEY })
      const previous = queryClient.getQueryData<TimezonePerson[]>(PEOPLE_KEY)
      const now = new Date().toISOString()

      queryClient.setQueryData<TimezonePerson[]>(PEOPLE_KEY, (old = []) => [
        ...old,
        {
          id: `temp-${crypto.randomUUID()}`,
          user_id: '',
          name: person.name,
          timezone: person.timezone,
          created_at: now,
          updated_at: now,
        },
      ])

      return { previous }
    },
    onError: (_error, _person, context) => {
      if (context?.previous) queryClient.setQueryData(PEOPLE_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PEOPLE_KEY })
    },
  })
}

export function useUpdateTimezonePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: UpdatePersonRequest & { id: string }): Promise<TimezonePerson> => {
      const res = await fetch(`/api/modules/timezones/people/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw await readError(res, 'Failed to update person')
      const data = await res.json()
      return data.person
    },
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: PEOPLE_KEY })
      const previous = queryClient.getQueryData<TimezonePerson[]>(PEOPLE_KEY)

      queryClient.setQueryData<TimezonePerson[]>(PEOPLE_KEY, (old = []) =>
        old.map((person) => (person.id === id ? { ...person, ...patch } : person))
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(PEOPLE_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PEOPLE_KEY })
    },
  })
}

export function useDeleteTimezonePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/timezones/people/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw await readError(res, 'Failed to remove person')
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: PEOPLE_KEY })
      const previous = queryClient.getQueryData<TimezonePerson[]>(PEOPLE_KEY)

      queryClient.setQueryData<TimezonePerson[]>(PEOPLE_KEY, (old = []) =>
        old.filter((person) => person.id !== id)
      )

      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(PEOPLE_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PEOPLE_KEY })
    },
  })
}

/**
 * A single random quote for the page header, via the quotes module's
 * purpose-built endpoint — the list endpoint returns 100 full rows to show one.
 * Going through useQuery picks up the provider's cache and dedupe.
 */
export function useRandomQuote(enabled: boolean) {
  return useQuery({
    queryKey: RANDOM_QUOTE_KEY,
    enabled,
    retry: false,
    queryFn: async (): Promise<{ quote: string; author?: string } | null> => {
      const res = await fetch('/api/modules/quotes/quotes/random')
      if (!res.ok) return null
      return await res.json()
    },
  })
}

export function useTimezonesSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<TimezonesSettings>> => {
      const res = await fetch('/api/modules/timezones/settings')
      // 404 means "nothing saved yet", which is a valid empty state. Anything
      // else (401, 500) must surface — this value picks the board's home zone,
      // so silently falling back to the browser zone would look deliberate.
      if (res.status === 404) return {}
      if (!res.ok) throw await readError(res, 'Failed to load your settings')
      return await res.json()
    },
  })
}

export function useUpdateTimezonesSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<TimezonesSettings>): Promise<void> => {
      const res = await fetch('/api/modules/timezones/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw await readError(res, 'Failed to save your time zone')
    },
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<TimezonesSettings>>(SETTINGS_KEY)

      queryClient.setQueryData<Partial<TimezonesSettings>>(SETTINGS_KEY, (old = {}) => ({
        ...old,
        ...settings,
      }))

      return { previous }
    },
    onError: (_error, _settings, context) => {
      if (context?.previous) queryClient.setQueryData(SETTINGS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}
