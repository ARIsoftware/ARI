import { useAuth } from '@clerk/nextjs'

export function useAuthenticatedFetch() {
  const { getToken } = useAuth()

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const token = await getToken({ template: 'supabase' })
    
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
  const { auth } = await import('@clerk/nextjs/server')
  const { getToken } = auth()
  
  const token = await getToken({ template: 'supabase' })
  
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