import { useSupabase } from '@/components/providers'

export function useAuthenticatedFetch() {
  const { session, supabase } = useSupabase()

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
  // This will be used by server components if needed
  const { createAuthenticatedClient } = await import('@/lib/auth-helpers')
  const supabase = await createAuthenticatedClient()

  // Use getUser() for secure verification
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Authentication required')
  }

  // Get session for token access
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

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