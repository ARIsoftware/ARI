'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  Settings,
  AlertCircle,
  Loader2,
  Save,
  CheckCircle,
  Info,
} from 'lucide-react'
import {
  useBackupSettings,
  useSaveBackupSettings,
  useSchedulingStatus,
} from '../../hooks/use-backup-manager'
import { isProviderConfigured } from '../../lib/providers'
import { RETENTION_OPTIONS } from '../../types'
import type { StorageProvider } from '../../types'

export default function BackupManagerSettingsPage() {
  const { toast } = useToast()
  const { data: settings, isLoading } = useBackupSettings()
  const { data: status } = useSchedulingStatus()
  const saveSettings = useSaveBackupSettings()

  // Form state
  const [enabled, setEnabled] = useState(false)
  const [storageProvider, setStorageProvider] = useState<StorageProvider>('supabase')
  const [retentionDays, setRetentionDays] = useState(30)
  const [supabaseBucket, setSupabaseBucket] = useState('ari-backups')
  const [r2Bucket, setR2Bucket] = useState('')
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3Region, setS3Region] = useState('us-east-1')

  // Initialize form state from settings
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled)
      setStorageProvider(settings.storageProvider)
      setRetentionDays(settings.retentionDays)
      setSupabaseBucket(settings.supabase?.bucketName || 'ari-backups')
      setR2Bucket(settings.r2?.bucketName || '')
      setS3Bucket(settings.s3?.bucketName || '')
      setS3Region(settings.s3?.region || 'us-east-1')
    }
  }, [settings])

  const handleSave = async () => {
    try {
      const newSettings = {
        enabled,
        storageProvider,
        retentionDays,
        supabase: { bucketName: supabaseBucket },
        r2: r2Bucket ? { bucketName: r2Bucket } : undefined,
        s3: s3Bucket ? { bucketName: s3Bucket, region: s3Region } : undefined,
      }

      await saveSettings.mutateAsync(newSettings)
      toast({
        title: 'Settings saved',
        description: 'Your backup settings have been updated.',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to save settings',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Check provider configuration
  const providerStatus = {
    supabase: isProviderConfigured('supabase'),
    r2: isProviderConfigured('r2'),
    s3: isProviderConfigured('s3'),
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Backup Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure automatic backups and storage options.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveSettings.isPending}>
          {saveSettings.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Scheduling Status */}
      {status && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scheduling Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Current Mode</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={status.schedulingMode === 'vercel-cron' ? 'default' : 'secondary'}>
                    {status.schedulingMode === 'vercel-cron' ? 'Vercel Cron' : 'App-Triggered'}
                  </Badge>
                  {status.schedulingMode === 'vercel-cron' && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Scheduled Time</p>
                <p className="font-medium mt-1">{status.scheduledTime}</p>
              </div>
            </div>
            {status.limitation && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>{status.limitation}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enable/Disable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic Backups</CardTitle>
          <CardDescription>
            Enable or disable automatic daily backups.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="enabled">Enable automatic backups</Label>
              <p className="text-sm text-muted-foreground">
                Backups will run daily at 12:00 PM in your timezone.
              </p>
            </div>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Storage Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storage Provider</CardTitle>
          <CardDescription>
            Choose where to store your backup files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={storageProvider}
              onValueChange={(v) => setStorageProvider(v as StorageProvider)}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supabase">
                  Supabase Storage
                  {providerStatus.supabase.configured && (
                    <span className="ml-2 text-green-500">(Configured)</span>
                  )}
                </SelectItem>
                <SelectItem value="r2">
                  Cloudflare R2
                  {!providerStatus.r2.configured && (
                    <span className="ml-2 text-muted-foreground">(Needs setup)</span>
                  )}
                </SelectItem>
                <SelectItem value="s3">
                  AWS S3
                  {!providerStatus.s3.configured && (
                    <span className="ml-2 text-muted-foreground">(Needs setup)</span>
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Provider-specific settings */}
          {storageProvider === 'supabase' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supabase-bucket">Bucket Name</Label>
                <Input
                  id="supabase-bucket"
                  value={supabaseBucket}
                  onChange={(e) => setSupabaseBucket(e.target.value)}
                  placeholder="ari-backups"
                />
                <p className="text-xs text-muted-foreground">
                  The bucket will be created automatically if it doesn&apos;t exist.
                </p>
              </div>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Security Note</AlertTitle>
                <AlertDescription>
                  For additional security, configure RLS policies for your storage bucket
                  in the{' '}
                  <a
                    href="https://supabase.com/docs/guides/storage/security/access-control"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Supabase Dashboard
                  </a>
                  . The backup system uses the service role key which bypasses RLS,
                  but policies protect against unauthorized direct access.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {storageProvider === 'r2' && (
            <>
              {!providerStatus.r2.configured && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Missing Environment Variables</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">Add these to your .env.local file:</p>
                    <pre className="rounded bg-muted p-2 text-xs font-mono">
                      R2_ACCOUNT_ID=your_account_id{'\n'}
                      R2_ACCESS_KEY_ID=your_access_key{'\n'}
                      R2_SECRET_ACCESS_KEY=your_secret_key
                    </pre>
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="r2-bucket">Bucket Name</Label>
                <Input
                  id="r2-bucket"
                  value={r2Bucket}
                  onChange={(e) => setR2Bucket(e.target.value)}
                  placeholder="my-backups-bucket"
                />
              </div>
            </>
          )}

          {storageProvider === 's3' && (
            <>
              {!providerStatus.s3.configured && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Missing Environment Variables</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">Add these to your .env.local file:</p>
                    <pre className="rounded bg-muted p-2 text-xs font-mono">
                      AWS_ACCESS_KEY_ID=your_access_key{'\n'}
                      AWS_SECRET_ACCESS_KEY=your_secret_key{'\n'}
                      AWS_REGION=us-east-1
                    </pre>
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s3-bucket">Bucket Name</Label>
                  <Input
                    id="s3-bucket"
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    placeholder="my-backups-bucket"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-region">Region</Label>
                  <Input
                    id="s3-region"
                    value={s3Region}
                    onChange={(e) => setS3Region(e.target.value)}
                    placeholder="us-east-1"
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Retention Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retention Policy</CardTitle>
          <CardDescription>
            Choose how long to keep backups before automatic deletion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="retention">Keep backups for</Label>
            <Select
              value={String(retentionDays)}
              onValueChange={(v) => setRetentionDays(Number(v))}
            >
              <SelectTrigger id="retention" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETENTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Expired backups are automatically deleted after each new backup.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
