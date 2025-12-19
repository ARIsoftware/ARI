"use client"

import { createContext, useContext, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { authClient } from "@/lib/auth-client"
import { createSupabaseClient } from "@/lib/supabase-auth"
import { Toaster } from "@/components/ui/toaster"
import { ExerciseReminder } from "@/components/exercise-reminder"
import { MusicPlayerProvider } from "@/components/youtube-music-player"
import { FeaturesProvider } from "@/lib/features-context"
import { ModulesProvider } from "@/lib/modules/context"
import { CommandPaletteProvider } from "@/components/command-palette"
import type { ModuleMetadata } from '@/lib/modules/module-types'

// Define types matching Better Auth session structure
type User = {
  id: string
  email: string
  name: string | null
  image: string | null
  firstName?: string | null
  lastName?: string | null
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
  // Compatibility shim for old code expecting user_metadata
  user_metadata?: {
    first_name?: string | null
    last_name?: string | null
    full_name?: string | null
    avatar_url?: string | null
  }
}

// Session type with compatibility mappings
type Session = {
  token: string
  userId: string
  expiresAt: Date
  // Compatibility shim for old code
  access_token: string
  user: User
}

type AuthContext = {
  user: User | null
  session: Session | null
  isLoading: boolean
  // Keep supabase client for realtime subscriptions
  supabase: ReturnType<typeof createSupabaseClient>
}

const Context = createContext<AuthContext | undefined>(undefined)

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
  const { data: sessionData, isPending } = authClient.useSession()

  // Create supabase client for realtime subscriptions (not for auth)
  const supabase = useMemo(() => createSupabaseClient(), [])

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

  // Map Better Auth user/session to compatible format
  // Cast to include custom fields (firstName, lastName) defined in auth.ts additionalFields
  type BetterAuthUser = {
    id: string
    email: string
    name: string
    image?: string | null
    emailVerified: boolean
    createdAt: Date
    updatedAt: Date
    firstName?: string | null
    lastName?: string | null
  }
  const rawUser = sessionData?.user as BetterAuthUser | undefined

  const user: User | null = rawUser ? {
    id: rawUser.id,
    email: rawUser.email,
    name: rawUser.name,
    image: rawUser.image ?? null,
    firstName: rawUser.firstName,
    lastName: rawUser.lastName,
    emailVerified: rawUser.emailVerified,
    createdAt: rawUser.createdAt,
    updatedAt: rawUser.updatedAt,
    // Add compatibility shim for old code
    user_metadata: {
      first_name: rawUser.firstName,
      last_name: rawUser.lastName,
      full_name: rawUser.name,
      avatar_url: rawUser.image,
    }
  } : null

  const session: Session | null = sessionData?.session && user ? {
    ...sessionData.session,
    // Compatibility mappings
    access_token: sessionData.session.token,
    user: user,
  } : null

  return (
    <Context.Provider value={{ user, session, isLoading: isPending, supabase }}>
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

/**
 * Hook to access auth context.
 * Includes supabase client for realtime subscriptions.
 * For data mutations, prefer using API routes.
 */
export const useSupabase = () => {
  const context = useContext(Context)
  if (context === undefined) {
    throw new Error('useSupabase must be used inside Providers')
  }
  return context
}

// Alias for new code
export const useAuth = useSupabase
