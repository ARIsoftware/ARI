"use client"

import { useState, useEffect } from 'react'
import { createSupabaseClient } from '@/lib/supabase-auth'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up'
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createSupabaseClient()

  // Listen for auth state changes and redirect when signed in
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthForm] Auth state change:', event, session ? 'Session exists' : 'No session')

      if (event === 'SIGNED_IN' && session) {
        console.log('[AuthForm] User signed in, redirecting to dashboard...')
        window.location.href = '/dashboard'
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      console.log('[Auth] Starting sign-in process...')

      if (mode === 'sign-up') {
        console.log('[Auth] Sign-up mode')
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        })

        if (error) throw error

        setMessage('Check your email for the confirmation link!')
        setLoading(false)
      } else {
        console.log('[Auth] Sign-in mode - calling signInWithPassword...')

        // Call signInWithPassword but don't await - let the auth state change handle redirect
        supabase.auth.signInWithPassword({
          email,
          password,
        }).then(({ error, data }) => {
          if (error) {
            console.error('[Auth] Sign-in error:', error)
            setError(error.message)
            setLoading(false)
          } else {
            console.log('[Auth] Sign-in call completed:', data.session ? 'Session created' : 'No session')
            // Don't redirect here - the useEffect auth listener will handle it
          }
        }).catch((error) => {
          console.error('[Auth] Sign-in exception:', error)
          setError(error.message)
          setLoading(false)
        })

        // Return early - the auth state change listener will redirect
        return
      }
    } catch (error: any) {
      console.error('[Auth] Error:', error)
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle>{mode === 'sign-in' ? 'Sign In' : 'Sign Up'}</CardTitle>
        <CardDescription>
          {mode === 'sign-in' 
            ? 'Enter your credentials to access your account' 
            : 'Create a new account to get started'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Loading...' : (mode === 'sign-in' ? 'Sign In' : 'Sign Up')}
          </Button>
        </form>

        {mode === 'sign-up' && (
          <div className="mt-4 text-center text-sm">
            <p>
              Already have an account?{' '}
              <a href="/sign-in" className="text-blue-600 hover:underline">
                Sign in
              </a>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}