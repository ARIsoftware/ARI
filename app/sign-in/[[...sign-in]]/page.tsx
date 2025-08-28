"use client"

import { AuthForm } from '@/components/auth/auth-form'
import { DM_Sans } from "next/font/google"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Bar */}
      <div className="topbar h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center p-4">
        <AuthForm mode="sign-in" />
      </div>
    </div>
  )
}
