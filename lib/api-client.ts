import { useSessionContext, useSupabaseClient } from '@supabase/auth-helpers-react'

export function useAuthenticatedFetch() {
  const { session } = useSessionContext()
  const supabase = useSupabaseClient()

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
  const { createSupabaseServerClient } = await import('@/lib/supabase-auth')
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  const token = session?.access_token
  
  if (!token) {
    throw new Error('Authentication required')
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