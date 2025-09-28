"use client"

import { createSupabaseClient } from "@/lib/supabase-auth"
import { createContext, useContext, useEffect, useState } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { ExerciseReminder } from "@/components/exercise-reminder"
import { YouTubeMusicPlayer } from "@/components/youtube-music-player"
import { User, Session } from '@supabase/supabase-js'

type SupabaseContext = {
  supabase: ReturnType<typeof createSupabaseClient>
  user: User | null
  session: Session | null
}

const Context = createContext<SupabaseContext | undefined>(undefined)

export function Providers({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createSupabaseClient())
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  return (
    <Context.Provider value={{ supabase, user, session }}>
      {children}
      <Toaster />
      {/* Only show exercise reminder when user is authenticated */}
      {user && <ExerciseReminder />}
      <div className="fixed top-[58px] right-6 z-50">
        <YouTubeMusicPlayer />
      </div>
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
