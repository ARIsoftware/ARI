"use client"

import { createContext, useContext, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { authClient } from "@/lib/auth-client"
import { Toaster } from "@/components/ui/toaster"
import { ModuleProviders } from "@/components/module-providers"
import { ModulesProvider } from "@/lib/modules/context"
import { CommandPaletteProvider } from "@/components/command-palette"
import { DragDropModeProvider } from "@/components/drag-drop-mode-context"
import { ThemeProvider } from "@/lib/theme/theme-context"
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
}

const Context = createContext<AuthContext | undefined>(undefined)

export function Providers({
  children,
  modules = [],
  enabledModules = [],
}: {
  children: React.ReactNode
  modules?: string[]
  enabledModules?: ModuleMetadata[]
}) {
  const pathname = usePathname()
  const { data: sessionData, isPending } = authClient.useSession()

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

  // Persist welcome profile from localStorage to DB on first authenticated load
  useEffect(() => {
    if (!user) return
    const stored = localStorage.getItem('ari_welcome_profile')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      const age = Date.now() - (parsed._savedAt || 0)
      if (age >= 24 * 60 * 60 * 1000) {
        localStorage.removeItem('ari_welcome_profile')
        return
      }
    } catch {
      localStorage.removeItem('ari_welcome_profile')
      return
    }
    fetch('/api/user-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: stored,
    }).then(res => {
      if (res.ok) localStorage.removeItem('ari_welcome_profile')
    }).catch(err => console.error('Failed to persist welcome profile:', err))
  }, [user])

  return (
    <Context.Provider value={{ user, session, isLoading: isPending }}>
      <ThemeProvider isAuthenticated={!!session} isAuthLoading={isPending}>
        <ModulesProvider modules={modules} enabledModules={enabledModules}>
          <ModuleProviders isAuthenticated={!!session}>
            <CommandPaletteProvider>
              <DragDropModeProvider isAuthenticated={!!session} isAuthLoading={isPending}>
                {children}
                <Toaster />
              </DragDropModeProvider>
            </CommandPaletteProvider>
          </ModuleProviders>
        </ModulesProvider>
      </ThemeProvider>
    </Context.Provider>
  )
}

/**
 * Hook to access auth context.
 * For data mutations, prefer using API routes.
 */
export const useAuth = () => {
  const context = useContext(Context)
  if (context === undefined) {
    throw new Error('useAuth must be used inside Providers')
  }
  return context
}

/** @deprecated Use useAuth() instead */
export const useSupabase = useAuth
