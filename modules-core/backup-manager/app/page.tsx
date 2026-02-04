'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  HardDrive,
  Plus,
  Clock,
  AlertCircle,
  Loader2,
  Settings,
  Info,
} from 'lucide-react'
import { BackupList } from '../components/backup-list'
import {
  useBackupSettings,
  useSaveBackupSettings,
  useCreateBackup,
  useSchedulingStatus,
} from '../hooks/use-backup-manager'
import type { StorageProvider } from '../types'

export default function BackupManagerPage() {
  const { toast } = useToast()
  const { data: settings, isLoading: settingsLoading } = useBackupSettings()
  const { data: status } = useSchedulingStatus()
  const saveSettings = useSaveBackupSettings()
  const createBackup = useCreateBackup()

  // Onboarding state
  const [selectedProvider, setSelectedProvider] = useState<StorageProvider>('supabase')
  const [bucketName, setBucketName] = useState('')

  const isOnboarding = !settings?.enabled && !settingsLoading

  const handleEnableBackups = async () => {
    try {
      const newSettings = {
        enabled: true,
        storageProvider: selectedProvider,
        ...(selectedProvider === 'supabase' && {
          supabase: { bucketName: bucketName || 'ari-backups' },
        }),
        ...(selectedProvider === 'r2' && bucketName && {
          r2: { bucketName },
        }),
        ...(selectedProvider === 's3' && bucketName && {
          s3: { bucketName, region: 'us-east-1' },
        }),
      }

      await saveSettings.mutateAsync(newSettings)
      toast({
        title: 'Backups enabled',
        description: 'Automatic backups are now configured.',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to enable backups',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleCreateBackup = async () => {
    try {
      await createBackup.mutateAsync()
      toast({
        title: 'Backup created',
        description: 'Your backup has been saved successfully.',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Backup failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isOnboarding) {
    // Onboarding Screen
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-muted p-4">
              <HardDrive className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl">Welcome to Backup Manager</CardTitle>
            <CardDescription>
              Automated daily backups with configurable storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Select Storage Provider */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Step 1</Badge>
                <span className="font-medium">Select Storage Provider</span>
              </div>
              <Select
                value={selectedProvider}
                onValueChange={(v) => setSelectedProvider(v as StorageProvider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supabase">
                    Supabase Storage (Recommended)
                  </SelectItem>
                  <SelectItem value="r2">Cloudflare R2</SelectItem>
                  <SelectItem value="s3">AWS S3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Configure Credentials */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Step 2</Badge>
                <span className="font-medium">Configure Credentials</span>
              </div>

              {selectedProvider === 'supabase' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Supabase Storage (Recommended)</AlertTitle>
                  <AlertDescription>
                    No extra configuration needed - uses your existing Supabase connection.
                    A bucket named &quot;ari-backups&quot; will be created automatically.
                  </AlertDescription>
                </Alert>
              )}

              {selectedProvider === 'r2' && (
                <div className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Cloudflare R2</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>Add these environment variables to .env.local (and Vercel):</p>
                      <pre className="mt-2 rounded bg-muted p-2 text-xs font-mono">
                        R2_ACCOUNT_ID=your_account_id{'\n'}
                        R2_ACCESS_KEY_ID=your_access_key{'\n'}
                        R2_SECRET_ACCESS_KEY=your_secret_key
                      </pre>
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label htmlFor="r2-bucket">Bucket Name</Label>
                    <Input
                      id="r2-bucket"
                      placeholder="my-backups-bucket"
                      value={bucketName}
                      onChange={(e) => setBucketName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {selectedProvider === 's3' && (
                <div className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>AWS S3</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>Add these environment variables to .env.local (and Vercel):</p>
                      <pre className="mt-2 rounded bg-muted p-2 text-xs font-mono">
                        AWS_ACCESS_KEY_ID=your_access_key{'\n'}
                        AWS_SECRET_ACCESS_KEY=your_secret_key{'\n'}
                        AWS_REGION=us-east-1
                      </pre>
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label htmlFor="s3-bucket">Bucket Name</Label>
                    <Input
                      id="s3-bucket"
                      placeholder="my-backups-bucket"
                      value={bucketName}
                      onChange={(e) => setBucketName(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleEnableBackups}
              disabled={
                saveSettings.isPending ||
                ((selectedProvider === 'r2' || selectedProvider === 's3') && !bucketName)
              }
            >
              {saveSettings.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enabling...
                </>
              ) : (
                'Enable Automatic Backups'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main View
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Database Backup Manager</h1>
          <p className="text-sm text-muted-foreground">
            Manage your database backups and restore points.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/backup-manager/settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </a>
          </Button>
          <Button
            onClick={handleCreateBackup}
            disabled={createBackup.isPending}
          >
            {createBackup.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create Backup Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Status Card */}
      {status && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Scheduling Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Mode</p>
                <p className="font-medium capitalize">
                  {status.schedulingMode === 'vercel-cron'
                    ? 'Vercel Cron'
                    : 'App-Triggered'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Scheduled Time</p>
                <p className="font-medium">{status.scheduledTime}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Backup</p>
                <p className="font-medium">
                  {status.lastBackupAt
                    ? new Date(status.lastBackupAt).toLocaleString()
                    : 'Never'}
                </p>
              </div>
            </div>
            {status.limitation && (
              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{status.limitation}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Backup Responsibility Warning */}
      <Alert variant="destructive" className="bg-red-50 border-red-200">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertTitle className="text-red-800">Your Responsibility</AlertTitle>
        <AlertDescription className="text-red-700">
          You are responsible for setting up and maintaining a reliable backup process for your data. This includes ensuring backups run regularly, are stored securely, and can be successfully restored when needed. We recommend having multiple, redundant file and database backups so you don&apos;t need to rely on one vendor. If backups are missing, outdated, or unusable, any resulting data loss is your responsibility.
        </AlertDescription>
      </Alert>

      {/* Backup List */}
      <Card>
        <CardHeader>
          <CardTitle>Stored Backups</CardTitle>
          <CardDescription>
            View, download, restore, or delete your database backups.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackupList />
        </CardContent>
      </Card>
    </div>
  )
}
