"use client"

import { useSupabase } from "@/components/providers"
import { useEffect } from "react"

const isDevelopment = process.env.NODE_ENV === 'development'

export function RLSDebug() {
  const { session, supabase } = useSupabase()
  const user = session?.user
  
  useEffect(() => {
    // Only run in development environment
    if (!isDevelopment) {
      return
    }
    
    const debugJWT = async () => {
      console.log("🔍 RLS Debug Component Loaded")
      
      if (!user) {
        console.log("❌ No user logged in")
        return
      }
      
      console.log("👤 User found:", user.id)
      console.log("📧 Email:", user.email)
      
      try {
        const token = session?.access_token
        if (token) {
          console.log("🎫 JWT Token obtained")
          // Decode JWT payload (safe - just reading claims)
          const payload = JSON.parse(atob(token.split('.')[1]))
          console.log("🔑 JWT Claims:", {
            sub: payload.sub,
            email: payload.email,
            iss: payload.iss,
            exp: new Date(payload.exp * 1000).toISOString()
          })
          console.log("✅ JWT contains email:", !!payload.email)
        } else {
          console.log("❌ No Supabase JWT token available")
        }
      } catch (error) {
        console.error("❌ JWT Debug Error:", error)
      }
    }
    
    // Run debug after a short delay to ensure user is loaded
    const timer = setTimeout(debugJWT, 1000)
    return () => clearTimeout(timer)
  }, [user, session?.access_token])
  
  // Don't render anything visible
  return null
}