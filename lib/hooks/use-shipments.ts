import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Shipment } from '@/modules-core/shipments/lib/shipments'

/**
 * Fetch all shipments for the current user.
 */
export function useShipments() {
  return useQuery({
    queryKey: ['shipments'],
    queryFn: async (): Promise<Shipment[]> => {
      const res = await fetch('/api/shipments')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch shipments')
      }
      return res.json()
    },
  })
}

/**
 * Hook to invalidate shipments cache - call after mutations
 */
export function useInvalidateShipments() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['shipments'] })
}
