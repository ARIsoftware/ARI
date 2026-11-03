'use client'

import { useAuth } from '@/components/providers'
import { greeting } from '@/modules/chat/lib/welcome'

interface WelcomeProps {
  composer: React.ReactNode
  error?: React.ReactNode
}

/** ChatGPT-style centered welcome: greeting above the composer. */
export function Welcome({ composer, error }: WelcomeProps) {
  const { user } = useAuth()
  const firstName = user?.firstName || user?.name?.split(' ')[0]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-10">
        <div className="mb-7 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-500">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting(new Date(), firstName)}</h2>
        </div>

        {composer}

        {error && <div className="mt-5">{error}</div>}
      </div>
    </div>
  )
}
