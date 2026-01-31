/**
 * Mail Stream Module - Settings Page
 *
 * Configure retention period for webhook events.
 * Route: /mail-stream/settings
 */

'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  useMailStreamSettings,
  useUpdateMailStreamSettings,
} from '@/lib/hooks/use-mail-stream'
import { RETENTION_OPTIONS, DEFAULT_MAIL_STREAM_SETTINGS } from '../../types'

export default function MailStreamSettingsPage() {
  const { toast } = useToast()

  // Fetch current settings
  const { data: savedSettings, isLoading } = useMailStreamSettings()
  const updateSettings = useUpdateMailStreamSettings()

  // Local state
  const [retentionDays, setRetentionDays] = useState<7 | 30 | 90 | 360 | -1>(DEFAULT_MAIL_STREAM_SETTINGS.retention_days)
  const [saved, setSaved] = useState(false)

  // Update local state when settings load
  useEffect(() => {
    if (savedSettings?.retention_days !== undefined) {
      setRetentionDays(savedSettings.retention_days as 7 | 30 | 90 | 360 | -1)
    }
  }, [savedSettings])

  // Handle save
  const handleSave = () => {
    setSaved(false)

    updateSettings.mutate(
      { retention_days: retentionDays },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 3000)
          toast({
            title: 'Settings saved',
            description: retentionDays === -1
              ? 'Events will be kept indefinitely.'
              : `Events older than ${retentionDays} days will be deleted.`,
          })
        },
        onError: () => {
          toast({
            variant: 'destructive',
            title: 'Failed to save settings',
            description: 'Please try again.',
          })
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading settings...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure Mail Stream module settings
        </p>
      </div>

      {/* Retention Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Data Retention</CardTitle>
          <CardDescription>
            Configure how long webhook events are stored in the database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="retention">Retention Period</Label>
            <Select
              value={retentionDays.toString()}
              onValueChange={(value) => setRetentionDays(parseInt(value) as 7 | 30 | 90 | 360 | -1)}
            >
              <SelectTrigger id="retention" className="w-[200px]">
                <SelectValue placeholder="Select retention" />
              </SelectTrigger>
              <SelectContent>
                {RETENTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {retentionDays === -1
                ? 'Events will be kept forever. Consider periodic cleanup for large volumes.'
                : `Events older than ${retentionDays} days will be automatically deleted when you save.`}
            </p>
          </div>

          {retentionDays !== -1 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">Data will be deleted</p>
                <p className="mt-1">
                  Saving this setting will immediately delete events older than {retentionDays} days.
                  This action cannot be undone.
                </p>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center gap-2 pt-4 border-t">
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>

            {saved && (
              <span className="text-sm text-green-600">
                Settings saved successfully
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            Information for setting up webhooks in Resend
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/api/modules/mail-stream/webhook`
                : '/api/modules/mail-stream/webhook'}
            </div>
            <p className="text-sm text-muted-foreground">
              Add this URL in your Resend dashboard under Webhooks
            </p>
          </div>

          <div className="space-y-2">
            <Label>Environment Variable</Label>
            <div className="p-3 bg-muted rounded-lg font-mono text-sm">
              RESEND_WEBHOOK_SECRET=whsec_your_secret_here
            </div>
            <p className="text-sm text-muted-foreground">
              Copy the signing secret from Resend and add it to your environment variables
            </p>
          </div>

          <div className="space-y-2">
            <Label>Event Types</Label>
            <p className="text-sm text-muted-foreground">
              Select "All Events" in Resend to capture all email, contact, and domain events.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Developer Info */}
      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">Developer Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <p>
            <strong>Webhook Security:</strong> The webhook endpoint verifies signatures using the Svix library.
            All webhook requests must include valid <code>svix-id</code>, <code>svix-timestamp</code>, and{' '}
            <code>svix-signature</code> headers.
          </p>
          <p>
            <strong>Data Storage:</strong> Events are stored globally (not per-user) since they come from
            Resend's infrastructure. All authenticated users can view the logs.
          </p>
          <p>
            <strong>API Endpoints:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><code>POST /api/modules/mail-stream/webhook</code> - Receive webhooks (public, signature-verified)</li>
            <li><code>GET /api/modules/mail-stream/data</code> - Fetch events (authenticated)</li>
            <li><code>GET/PUT /api/modules/mail-stream/settings</code> - Settings (authenticated)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
