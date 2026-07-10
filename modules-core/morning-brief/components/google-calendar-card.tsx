'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import {
  CalendarCheck,
  Loader2,
  Plug,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Link2,
  Info,
} from 'lucide-react'
import {
  useGoogleStatus,
  useDisconnectGoogle,
  useIcalStatus,
  useSubscribeIcal,
  useDisconnectIcal,
} from '@/modules/morning-brief/hooks/use-morning-brief'
import { GoogleSetupInstructions } from './google-setup-instructions'

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google isn't configured on this server yet. Follow the setup steps below.",
  access_denied: 'Google access was denied. You can try connecting again.',
  state: 'Security check failed. Please start the connection again.',
  no_refresh_token:
    "Google didn't return a refresh token. Remove ARI's access in your Google account, then reconnect.",
  exchange_failed: 'Could not complete the Google connection. Please try again.',
}

export function GoogleCalendarCard() {
  const { data: status, isLoading } = useGoogleStatus()
  const { data: ical, isLoading: icalLoading } = useIcalStatus()
  const disconnect = useDisconnectGoogle()
  const subscribe = useSubscribeIcal()
  const removeIcal = useDisconnectIcal()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [showInstructions, setShowInstructions] = useState(false)
  const [showIcalHelp, setShowIcalHelp] = useState(false)
  const [icsUrl, setIcsUrl] = useState('')
  // The user's explicit tab choice; until they pick one, default to whichever
  // method is already in use (subscription wins, matching the route precedence).
  const [tab, setTab] = useState<string | undefined>(undefined)

  const configured = status?.configured ?? false
  const connected = status?.connected ?? false
  const subscribed = ical?.subscribed ?? false
  const activeTab = tab ?? (subscribed ? 'ical' : 'google')

  // Surface the redirect result from the OAuth callback, then clean the URL.
  useEffect(() => {
    const connectedParam = searchParams.get('google')
    const error = searchParams.get('google_error')
    if (!connectedParam && !error) return

    if (connectedParam === 'connected') {
      toast({ title: 'Google Calendar connected', description: "Your meetings will appear in tomorrow's brief and today's." })
    } else if (error) {
      toast({
        variant: 'destructive',
        title: 'Google connection failed',
        description: ERROR_MESSAGES[error] ?? 'Something went wrong connecting Google.',
      })
      if (error === 'not_configured') setShowInstructions(true)
    }
    router.replace('/morning-brief/settings')
  }, [searchParams, toast, router])

  const handleConnect = () => {
    // Top-level navigation so the OAuth flow can set its state cookie + redirect.
    window.location.href = '/api/modules/morning-brief/google/connect'
  }

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onSuccess: () => toast({ title: 'Disconnected', description: 'Google Calendar has been disconnected.' }),
      onError: (err) =>
        toast({
          variant: 'destructive',
          title: 'Failed to disconnect',
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
    })
  }

  const handleSubscribe = () => {
    const url = icsUrl.trim()
    if (!url) return
    subscribe.mutate(url, {
      onSuccess: (res) => {
        setIcsUrl('')
        toast({
          title: 'Calendar subscribed',
          description: res.host ? `Reading events from ${res.host}.` : 'Your events will appear in the brief.',
        })
      },
      onError: (err) =>
        toast({
          variant: 'destructive',
          title: 'Could not subscribe',
          description: err instanceof Error ? err.message : 'Check the link and try again.',
        }),
    })
  }

  const handleRemoveIcal = () => {
    removeIcal.mutate(undefined, {
      onSuccess: () => toast({ title: 'Subscription removed', description: 'The brief will stop showing those meetings.' }),
      onError: (err) =>
        toast({
          variant: 'destructive',
          title: 'Failed to remove',
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <CardTitle>Calendar</CardTitle>
        </div>
        <CardDescription>
          Show today&apos;s meetings in your brief. Connect your Google account, or — if you&apos;d
          rather not set up OAuth — subscribe to a calendar link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || icalLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking calendar…
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="google">
                Connect account
                {connected && <CheckCircle2 className="ml-1.5 h-3.5 w-3.5 text-green-600" />}
              </TabsTrigger>
              <TabsTrigger value="ical">
                Subscribe via link
                {subscribed && <CheckCircle2 className="ml-1.5 h-3.5 w-3.5 text-green-600" />}
              </TabsTrigger>
            </TabsList>

            {/* ── OAuth ───────────────────────────────────────────────────── */}
            <TabsContent value="google" className="space-y-4 pt-4">
              {subscribed && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>
                    A subscribed calendar link is currently active and takes priority. Remove it
                    under <span className="font-medium text-foreground">Subscribe via link</span> to
                    use a connected account instead.
                  </span>
                </div>
              )}

              {!configured ? (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">Google isn&apos;t configured yet</p>
                    <p className="text-muted-foreground">
                      A one-time Google Cloud setup is required before you can connect. Follow the
                      steps below — or use a calendar link instead (no setup needed).
                    </p>
                  </div>
                </div>
              ) : connected ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Connected</p>
                      {status?.email && <p className="text-xs text-muted-foreground">{status.email}</p>}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={disconnect.isPending} className="w-full sm:w-auto">
                        {disconnect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes the stored connection{status?.email ? ` for ${status.email}` : ''}. Your brief
                          will stop showing meetings, and you&apos;ll need to reconnect through Google to restore it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Not connected.</p>
                  <Button onClick={handleConnect}>
                    <Plug className="mr-2 h-4 w-4" />
                    Connect Google Calendar
                  </Button>
                </div>
              )}

              {/* Setup instructions — always visible when not configured, collapsible otherwise. */}
              {!configured ? (
                <div className="rounded-lg border border-border p-4">
                  <p className="mb-3 text-sm font-medium text-foreground">One-time Google Cloud setup</p>
                  <GoogleSetupInstructions />
                </div>
              ) : (
                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setShowInstructions((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showInstructions ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    How the Google connection was set up
                  </button>
                  {showInstructions && (
                    <div className="mt-3">
                      <GoogleSetupInstructions />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── iCal subscription ───────────────────────────────────────── */}
            <TabsContent value="ical" className="space-y-4 pt-4">
              {subscribed ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Subscribed</p>
                      {ical?.host && <p className="text-xs text-muted-foreground">{ical.host}</p>}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={removeIcal.isPending} className="w-full sm:w-auto">
                        {removeIcal.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove calendar subscription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The brief will stop showing meetings from this calendar link. You can subscribe
                          again anytime.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemoveIcal}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="mb-ics-url" className="text-sm font-medium text-foreground">
                    Calendar link (.ics)
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="mb-ics-url"
                      type="url"
                      inputMode="url"
                      placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                      value={icsUrl}
                      onChange={(e) => setIcsUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSubscribe()
                      }}
                      className="flex-1"
                    />
                    <Button onClick={handleSubscribe} disabled={!icsUrl.trim() || subscribe.isPending}>
                      {subscribe.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="mr-2 h-4 w-4" />
                      )}
                      Subscribe
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keep this link private — anyone with it can see your events.
                  </p>
                </div>
              )}

              {/* How to find the secret iCal address. */}
              <div className="border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setShowIcalHelp((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showIcalHelp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Where do I find my Google Calendar link?
                </button>
                {showIcalHelp && (
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                    <li>Open Google Calendar on the web (calendar.google.com).</li>
                    <li>
                      Hover the calendar under <span className="font-medium text-foreground">My calendars</span>, click
                      the <span className="font-medium text-foreground">⋮</span> menu →{' '}
                      <span className="font-medium text-foreground">Settings and sharing</span>.
                    </li>
                    <li>
                      Scroll to <span className="font-medium text-foreground">Integrate calendar</span>.
                    </li>
                    <li>
                      Copy the <span className="font-medium text-foreground">Secret address in iCal format</span> (it
                      ends in <code className="rounded bg-muted px-1 py-0.5 text-xs">.ics</code>).
                    </li>
                    <li>Paste it above and click Subscribe.</li>
                  </ol>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
