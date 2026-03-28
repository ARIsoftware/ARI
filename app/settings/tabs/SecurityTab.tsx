"use client"

import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, LogOut, Monitor, ShieldCheck, Smartphone } from "lucide-react"
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
                        <p className="text-sm font-medium">
                          {device} · {browser}
                          {isCurrentSession && (
                            <Badge variant="secondary" className="ml-2">
                              This device
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.ipAddress || "Unknown IP"} · Last active {formatRelativeTime(session.updatedAt)}
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
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-sm">
              <p className="font-medium text-emerald-700">Authentication: Better Auth</p>
              <p className="mt-1 text-emerald-600">
                Your account is secured with Better Auth using Argon2id password hashing.
              </p>
            </div>
          </CardContent>
        </Card>
        <TwoFactorSetup twoFactorEnabled={twoFactorEnabled} />
      </div>
    </div>
  )
}
