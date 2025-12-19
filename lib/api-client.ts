import { useSupabase } from '@/components/providers'

export function useAuthenticatedFetch() {
  const { session } = useSupabase()

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token

    if (!token) {
      throw new Error('Authentication required')
    }

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    })
  }

  return authenticatedFetch
}

// For server-side or non-hook contexts
export async function getAuthenticatedFetch() {
  // Use Better Auth for server-side authentication
  const { auth } = await import('@/lib/auth')
  const { headers } = await import('next/headers')

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    throw new Error('Authentication required')
  }

  const token = session.session.token

  if (!token) {
    throw new Error('Authentication token not available')
  }

  return (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    })
  }
}