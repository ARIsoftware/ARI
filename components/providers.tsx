"use client"

import { createSupabaseClient } from "@/lib/supabase-auth"
import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Toaster } from "@/components/ui/toaster"
import { ExerciseReminder } from "@/components/exercise-reminder"
import { MusicPlayerProvider } from "@/components/youtube-music-player"
import { FeaturesProvider } from "@/lib/features-context"
import { ModulesProvider } from "@/lib/modules/context"
import { CommandPaletteProvider } from "@/components/command-palette"
import { User, Session } from '@supabase/supabase-js'
import type { ModuleMetadata } from '@/lib/modules/module-types'

type SupabaseContext = {
  supabase: ReturnType<typeof createSupabaseClient>
  user: User | null
  session: Session | null
}

const Context = createContext<SupabaseContext | undefined>(undefined)

export function Providers({
  children,
  modules = [],
  enabledModules = [],
  initialFeatures
}: {
  children: React.ReactNode
  modules?: string[]
  enabledModules?: ModuleMetadata[]
  initialFeatures?: Record<string, boolean>
}) {
  const pathname = usePathname()
  const [supabase] = useState(() => createSupabaseClient())
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)

  // Load saved font preference on mount
  useEffect(() => {
    const fontMap: Record<string, string> = {
      'Overpass Mono': '"Overpass Mono", monospace',
      'Outfit': '"Outfit", sans-serif',
      'Open Sans': '"Open Sans", sans-serif',
      'Science Gothic': '"Science Gothic", sans-serif',
    }
    const savedFont = localStorage.getItem('ari-font-preference')
    if (savedFont && fontMap[savedFont]) {
      document.documentElement.style.setProperty('--font-family', fontMap[savedFont])
    }
  }, [])

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
      const { data: { session }, error } = await supabase.auth.refreshSession()

      if (error) {
        // If refresh fails, clear the session and user
        setSession(null)
        setUser(null)
      } else if (session) {
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
      <ModulesProvider modules={modules} enabledModules={enabledModules}>
        <FeaturesProvider initialFeatures={initialFeatures}>
          <MusicPlayerProvider>
            <CommandPaletteProvider>
              {children}
              <Toaster />
              {/* Only show exercise reminder when user is authenticated */}
              {user && <ExerciseReminder />}
            </CommandPaletteProvider>
          </MusicPlayerProvider>
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
