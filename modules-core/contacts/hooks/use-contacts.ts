import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Contact } from '../lib/contacts'

/**
 * Fetch all contacts for the current user.
 * Contacts are sorted alphabetically by name.
 */
export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const res = await fetch('/api/modules/contacts?limit=200')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch contacts')
      }
      const result = await res.json()
      const data: Contact[] = result.data ?? result
      return data.sort((a: Contact, b: Contact) => a.name.localeCompare(b.name))
    },
  })
}

/**
 * Hook to invalidate contacts cache - call after mutations
 */
export function useInvalidateContacts() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['contacts'] })
}
