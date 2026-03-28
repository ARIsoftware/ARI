"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Shield, ShieldCheck, ShieldOff, Copy, Check, Loader2, Eye, EyeOff } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"

type SetupStep = "idle" | "password" | "qr" | "backup" | "enabled"

export function TwoFactorSetup({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  const [step, setStep] = useState<SetupStep>(twoFactorEnabled ? "enabled" : "idle")
  const [password, setPassword] = useState("")
  const [totpURI, setTotpURI] = useState("")
  const [secret, setSecret] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [verifyCode, setVerifyCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [disablePassword, setDisablePassword] = useState("")
  const [showDisable, setShowDisable] = useState(false)

  const handleEnable = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authClient.twoFactor.enable({
        password,
      })
      if (res.error) {
        setError(res.error.message || "Failed to enable 2FA")
        setLoading(false)
        return
      }
      setTotpURI(res.data?.totpURI || "")
      setBackupCodes(res.data?.backupCodes || [])
      // Extract secret from TOTP URI
      const secretMatch = res.data?.totpURI?.match(/secret=([A-Z2-7]+)/)
      setSecret(secretMatch?.[1] || "")
      setStep("qr")
    } catch {
      setError("Failed to enable 2FA")
    }
    setLoading(false)
  }

  const handleVerify = async () => {
    if (verifyCode.length !== 6) return
    setLoading(true)
    setError(null)
    try {
      const res = await authClient.twoFactor.verifyTotp({
        code: verifyCode,
      })
      if (res.error) {
        setError(res.error.message || "Invalid code. Please try again.")
        setVerifyCode("")
        setLoading(false)
        return
      }
      setStep("backup")
    } catch {
      setError("Verification failed")
      setVerifyCode("")
    }
    setLoading(false)
  }

  const handleDisable = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authClient.twoFactor.disable({
        password: disablePassword,
      })
      if (res.error) {
        setError(res.error.message || "Failed to disable 2FA")
        setLoading(false)
        return
      }
      setStep("idle")
      setShowDisable(false)
      setDisablePassword("")
      setPassword("")
      setVerifyCode("")
      setTotpURI("")
      setSecret("")
      setBackupCodes([])
    } catch {
      setError("Failed to disable 2FA")
    }
    setLoading(false)
  }

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Not enabled yet
  if (step === "idle") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-blue-500" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security with Google Authenticator or any TOTP app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setStep("password")} variant="outline">
            Enable 2FA
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Password prompt
  if (step === "password") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-blue-500" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Enter your password to begin setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="2fa-password">Password</Label>
            <Input
              id="2fa-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEnable()}
              disabled={loading}
              autoFocus
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button onClick={handleEnable} disabled={loading || !password}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </Button>
            <Button variant="ghost" onClick={() => { setStep("idle"); setError(null); setPassword("") }}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // QR code + verify
  if (step === "qr") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-blue-500" />
            Scan QR Code
          </CardTitle>
          <CardDescription>
            Scan this QR code with Google Authenticator or your preferred TOTP app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <div className="rounded-lg border bg-white p-4">
              <QRCodeSVG value={totpURI} size={200} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Can&apos;t scan? Enter this key manually:
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border bg-muted px-3 py-2 text-sm font-mono">
                {showSecret ? secret : "••••••••••••••••"}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(secret)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Enter the 6-digit code from your app to verify:</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={verifyCode}
                onChange={setVerifyCode}
                onComplete={handleVerify}
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
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button onClick={handleVerify} disabled={loading || verifyCode.length !== 6}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify & Enable
            </Button>
            <Button variant="ghost" onClick={() => { setStep("idle"); setError(null); setPassword(""); setVerifyCode("") }}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Show backup codes
  if (step === "backup") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Save Your Backup Codes
          </CardTitle>
          <CardDescription>
            Store these codes in a safe place. Each code can only be used once if you lose access to your authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted p-4">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((code, i) => (
                <div key={i} className="rounded bg-background px-2 py-1 text-center">
                  {code}
                </div>
              ))}
            </div>
          </div>
          <Button variant="outline" onClick={copyBackupCodes} className="w-full">
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Copied!" : "Copy Backup Codes"}
          </Button>
          <Button onClick={() => setStep("enabled")} className="w-full">
            I&apos;ve saved my backup codes
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Enabled state
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Your account is protected with two-factor authentication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-700">2FA is enabled</p>
          <p className="mt-1 text-emerald-600">
            You&apos;ll be asked for a verification code from your authenticator app when signing in.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {showDisable ? (
          <div className="space-y-3 rounded-lg border border-destructive/50 p-4">
            <p className="text-sm font-medium">Enter your password to disable 2FA:</p>
            <Input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDisable()}
              disabled={loading}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleDisable} disabled={loading || !disablePassword}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Disable 2FA
              </Button>
              <Button variant="ghost" onClick={() => { setShowDisable(false); setError(null); setDisablePassword("") }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setShowDisable(true)}>
            <ShieldOff className="mr-2 h-4 w-4" />
            Disable 2FA
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
