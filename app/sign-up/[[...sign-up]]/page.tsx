"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SignUpPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to sign-in since sign-ups are disabled
    router.replace('/sign-in')
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p>Redirecting to sign in...</p>
    </div>
  )
}
