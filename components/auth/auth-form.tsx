"use client"

import { useState, useEffect } from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Shield, ArrowLeft } from 'lucide-react'

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up'
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [noUsers, setNoUsers] = useState(false)
  const [twoFactorRequired, setTwoFactorRequired] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [backupCode, setBackupCode] = useState('')
  const router = useRouter()

  // Trigger first-run admin bootstrap (no-op if users already exist)
  useEffect(() => {
    fetch('/api/auth/bootstrap', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'no_users') setNoUsers(true)
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'sign-up') {
        // Sign-up is disabled for now (single user app)
        setError('Sign-up is currently disabled')
        setLoading(false)
        return
      }

      // Sign in with Better Auth
      const res = await authClient.signIn.email({
        email,
        password,
      })

      if (res.error) {
        if (res.error.status === 429) {
          setError("Too many login attempts. We've temporarily paused login attempts to keep your account safe. Please wait 5 minutes and try again.")
        } else {
          setError(res.error.message || 'Sign in failed')
        }
        setLoading(false)
      } else if ((res.data as any)?.twoFactorRedirect) {
        // 2FA is required — show TOTP input
        setTwoFactorRequired(true)
        setLoading(false)
      } else {
        // Redirect on success - use window.location for full page refresh
        // to ensure session cookies are properly read
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  const handleTotpVerify = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authClient.twoFactor.verifyTotp({
        code: totpCode,
      })
      if (res.error) {
        setError(res.error.message || 'Invalid code')
        setTotpCode('')
        setLoading(false)
      } else {
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed')
      setTotpCode('')
      setLoading(false)
    }
  }

  const handleBackupCodeVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!backupCode.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await authClient.twoFactor.verifyBackupCode({
        code: backupCode.trim(),
      })
      if (res.error) {
        setError(res.error.message || 'Invalid backup code')
        setLoading(false)
      } else {
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed')
      setLoading(false)
    }
  }

  // 2FA verification screen
  if (twoFactorRequired) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Shield className="h-8 w-8 text-blue-500" />
          </div>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            {useBackupCode
              ? 'Enter one of your backup codes'
              : 'Enter the 6-digit code from your authenticator app'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {useBackupCode ? (
            <form onSubmit={handleBackupCodeVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backup-code">Backup Code</Label>
                <Input
                  id="backup-code"
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  placeholder="Enter backup code"
                  disabled={loading}
                  autoFocus
                  className="font-mono"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading || !backupCode.trim()}>
                {loading ? 'Verifying...' : 'Verify Backup Code'}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={totpCode}
                  onChange={setTotpCode}
                  onComplete={handleTotpVerify}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleTotpVerify}
                className="w-full"
                disabled={loading || totpCode.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
            </div>
          )}

          <div className="flex flex-col items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => { setUseBackupCode(!useBackupCode); setError(null) }}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              {useBackupCode ? 'Use authenticator app instead' : 'Use a backup code instead'}
            </button>
            <button
              type="button"
              onClick={() => { setTwoFactorRequired(false); setError(null); setTotpCode(''); setBackupCode('') }}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </button>
          </div>
        </CardContent>
      </Card>
    )
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
        {noUsers && (
          <Alert className="mb-4">
            <AlertDescription>
              There are no user accounts set up yet. Visit the docs to view the installation steps:{' '}
              <a href="https://ari.software/docs" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                ari.software/docs
              </a>
            </AlertDescription>
          </Alert>
        )}
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
              minLength={18}
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
      </CardContent>
    </Card>
  )
}
