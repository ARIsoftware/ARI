"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { BarChart3, Loader2, LogOut, Monitor, ShieldCheck, Smartphone } from "lucide-react"
import { parseUserAgent, formatRelativeTime } from "@/lib/utils"
import { TwoFactorSetup } from "./TwoFactorSetup"
import type { Session } from "../types"

interface SecurityTabProps {
  sessions: Session[]
  sessionsLoading: boolean
  currentSessionToken: string | null
  revokingSession: string | null
  revokingAllSessions: boolean
  onRevokeSession: (token: string) => void
  onRevokeAllSessions: () => void
  twoFactorEnabled?: boolean
}

export function SecurityTab({
  sessions,
  sessionsLoading,
  currentSessionToken,
  revokingSession,
  revokingAllSessions,
  onRevokeSession,
  onRevokeAllSessions,
  twoFactorEnabled = false,
}: SecurityTabProps): React.ReactElement {
  const router = useRouter()
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(null)
  const [telemetrySaving, setTelemetrySaving] = useState(false)
  useEffect(() => {
    fetch("/api/telemetry")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.telemetryEnabled === "boolean") setTelemetryEnabled(d.telemetryEnabled)
      })
      .catch(() => {})
  }, [])

  const handleTelemetryToggle = async (next: boolean) => {
    const prev = telemetryEnabled
    setTelemetryEnabled(next)
    setTelemetrySaving(true)
    try {
      const res = await fetch("/api/telemetry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) setTelemetryEnabled(prev)
    } catch {
      setTelemetryEnabled(prev)
    } finally {
      setTelemetrySaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Monitor className="h-5 w-5 text-blue-500" />
                Active Sessions
              </CardTitle>
              <CardDescription>
                Manage devices where you're currently signed in.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRevokeAllSessions}
              disabled={revokingAllSessions || sessions.length <= 1}
            >
              {revokingAllSessions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Sign out all other devices
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active sessions found
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const { device, browser } = parseUserAgent(session.userAgent)
                const isCurrentSession = session.token === currentSessionToken
                const isMobile = device === "iPhone" || device === "iPad" || device === "Android"

                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between rounded-lg border p-4 ${
                      isCurrentSession ? "border-blue-500/50 bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isMobile ? (
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Monitor className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <div className="text-sm font-medium flex items-center">
                          {device} · {browser}
                          {isCurrentSession && (
                            <Badge variant="secondary" className="ml-2">
                              This device
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(!session.ipAddress || /^(::1?|127\.0\.0\.1|[0:]+)$/.test(session.ipAddress.trim())) ? 'localhost' : session.ipAddress} · Signed in {new Date(session.createdAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' })} {new Date(session.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    {!isCurrentSession && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRevokeSession(session.token)}
                        disabled={revokingSession === session.token}
                      >
                        {revokingSession === session.token ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <LogOut className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Account Security
            </CardTitle>
            <CardDescription>
              Manage your password and security settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between rounded-lg border p-4">
              <div className="pr-4">
                <p className="text-sm font-medium">Password</p>
                <p className="text-sm text-muted-foreground">
                  Change your password to keep your account secure.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/profile")}
              >
                Change
              </Button>
            </div>
          </CardContent>
        </Card>
        <TwoFactorSetup twoFactorEnabled={twoFactorEnabled} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-purple-500" />
              Usage Statistics
            </CardTitle>
            <CardDescription>
              Help improve ARI by sharing basic install and version data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between rounded-lg border p-4">
              <div className="pr-4">
                <p className="text-sm font-medium">Share anonymous usage statistics</p>
                <p className="text-sm text-muted-foreground">
                  Sends a single ping on server startup containing an opaque install ID, ARI version, platform, and the configured account email address (used only for basic instance identification). No user content is ever transmitted.
                </p>
              </div>
              <Switch
                checked={telemetryEnabled ?? false}
                disabled={telemetryEnabled === null || telemetrySaving}
                onCheckedChange={handleTelemetryToggle}
              />
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
