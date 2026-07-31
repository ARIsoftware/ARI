"use client"

import { useState } from 'react'
import { AuthForm } from '@/components/auth/auth-form'
import { DM_Sans } from "next/font/google"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default function SignInPage() {
  // The admin-configured login logo is served publicly from the DB. If none is
  // set the endpoint 404s (that 404 is itself cached) and we hide the slot via
  // onError. alt="" keeps it decorative so no broken-image text flashes first.
  const [showLogo, setShowLogo] = useState(true)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Bar */}
      <div className="topbar h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {showLogo && (
          <div className="mb-8 flex w-full max-w-[375px] justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/branding/login-logo"
              alt=""
              className="h-auto w-full max-w-[375px] object-contain"
              onError={() => setShowLogo(false)}
            />
          </div>
        )}
        <AuthForm mode="sign-in" />
      </div>
    </div>
  )
}
