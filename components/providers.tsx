"use client"

import { createSupabaseClient } from "@/lib/supabase-auth"
import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Toaster } from "@/components/ui/toaster"
import { ExerciseReminder } from "@/components/exercise-reminder"
import { YouTubeMusicPlayer } from "@/components/youtube-music-player"
import { FeaturesProvider } from "@/lib/features-context"
import { ModulesProvider } from "@/lib/modules/context"
import { User, Session } from '@supabase/supabase-js'

type SupabaseContext = {
  supabase: ReturnType<typeof createSupabaseClient>
  user: User | null
  session: Session | null
}

const Context = createContext<SupabaseContext | undefined>(undefined)

export function Providers({
  children,
  modules = []
}: {
  children: React.ReactNode
  modules?: string[]
}) {
  const pathname = usePathname()
  const [supabase] = useState(() => createSupabaseClient())
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const initAuth = async () => {
      // Get session for tokens
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)

      // Get user from session (no network call needed)
      if (session?.user) {
        setUser(session.user)
      }
    }

    initAuth()

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] State change event:', event)
        setSession(session)

        // Get user from session (no network call needed)
        if (session?.user) {
          setUser(session.user)
        } else {
          setUser(null)
        }
      }
    )

    // Set up periodic session refresh (every 30 minutes)
    // This prevents sessions from expiring while user is active
    const refreshInterval = setInterval(async () => {
      console.log('[Auth] Refreshing session...')
      const { data: { session }, error } = await supabase.auth.refreshSession()

      if (error) {
        console.error('[Auth] Session refresh failed:', error.message)
        // If refresh fails, clear the session and user
        setSession(null)
        setUser(null)
      } else if (session) {
        console.log('[Auth] Session refreshed successfully')
        setSession(session)
        // Get user from refreshed session (no network call needed)
        if (session.user) {
          setUser(session.user)
        }
      }
    }, 30 * 60 * 1000) // 30 minutes

    return () => {
      subscription.unsubscribe()
      clearInterval(refreshInterval)
    }
  }, [supabase])

  return (
    <Context.Provider value={{ supabase, user, session }}>
      <ModulesProvider modules={modules}>
        <FeaturesProvider>
          {children}
          <Toaster />
          {/* Only show exercise reminder when user is authenticated */}
          {user && <ExerciseReminder />}
          {/* Hide music player on welcome page */}
          {pathname !== '/welcome' && (
            <div className="fixed top-[53px] right-6 z-50">
              <YouTubeMusicPlayer />
            </div>
          )}
        </FeaturesProvider>
      </ModulesProvider>
    </Context.Provider>
  )
}

export const useSupabase = () => {
  const context = useContext(Context)
  if (context === undefined) {
    throw new Error('useSupabase must be used inside SupabaseProvider')
  }
  return context
}
