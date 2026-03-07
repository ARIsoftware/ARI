'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Settings, Info, AlertCircle, Plus, Trash2 } from 'lucide-react'
import {
  useDocumentsSettings,
  useUpdateDocumentsSettings,
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
} from '../../hooks/use-documents'
import type { StorageProvider, ViewMode } from '../../types'
import { MAX_FILE_SIZE_OPTIONS, TAG_COLORS } from '../../types'

export default function DocumentsSettingsPage() {
  const { toast } = useToast()
  const { data: settings, isLoading: settingsLoading } = useDocumentsSettings()
  const updateSettings = useUpdateDocumentsSettings()
  const { data: tagsData } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  // Form state
  const [storageProvider, setStorageProvider] = useState<StorageProvider>('supabase')
  const [bucketName, setBucketName] = useState('')
  const [defaultView, setDefaultView] = useState<ViewMode>('cards')
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(500)

  // New tag state
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      setStorageProvider(settings.storageProvider || 'supabase')
      setDefaultView(settings.defaultView || 'cards')
      setMaxFileSizeMb(settings.maxFileSizeMb || 500)

      if (settings.storageProvider === 'supabase') {
        setBucketName(settings.supabase?.bucketName || 'ari-documents')
      } else if (settings.storageProvider === 'r2') {
        setBucketName(settings.r2?.bucketName || '')
      } else if (settings.storageProvider === 's3') {
        setBucketName(settings.s3?.bucketName || '')
      }
    }
  }, [settings])

  const handleSaveSettings = async () => {
    try {
      const newSettings = {
        storageProvider,
        defaultView,
        maxFileSizeMb,
        ...(storageProvider === 'supabase' && {
          supabase: { bucketName: bucketName || 'ari-documents' },
        }),
        ...(storageProvider === 'r2' && bucketName && {
          r2: { bucketName },
        }),
        ...(storageProvider === 's3' && bucketName && {
          s3: { bucketName, region: 'us-east-1' },
        }),
      }

      await updateSettings.mutateAsync(newSettings)
      toast({
        title: 'Settings saved',
        description: 'Your changes have been saved successfully.',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to save settings',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    try {
      await createTag.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor,
      })
      setNewTagName('')
      toast({ title: 'Tag created' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create tag',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleDeleteTag = async (id: string) => {
    try {
      await deleteTag.mutateAsync(id)
      toast({ title: 'Tag deleted' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete tag',
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

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your Documents module preferences.
        </p>
      </div>

      {/* Storage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Storage Configuration
          </CardTitle>
          <CardDescription>
            Configure where your documents are stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Storage Provider</Label>
            <Select
              value={storageProvider}
              onValueChange={(v) => setStorageProvider(v as StorageProvider)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supabase">Supabase Storage</SelectItem>
                <SelectItem value="r2">Cloudflare R2</SelectItem>
                <SelectItem value="s3">AWS S3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {storageProvider === 'supabase' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Supabase Storage</AlertTitle>
              <AlertDescription>
                Uses your existing Supabase connection. Bucket: &quot;{bucketName || 'ari-documents'}&quot;
                <br />
                <span className="text-amber-600 dark:text-amber-400">
                  Note: Free tier has a 50MB file size limit.
                </span>
              </AlertDescription>
            </Alert>
          )}

          {(storageProvider === 'r2' || storageProvider === 's3') && (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                  {storageProvider === 'r2' ? 'Cloudflare R2' : 'AWS S3'}
                </AlertTitle>
                <AlertDescription>
                  Make sure you have the required environment variables configured.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="bucket-name">Bucket Name</Label>
                <Input
                  id="bucket-name"
                  value={bucketName}
                  onChange={(e) => setBucketName(e.target.value)}
                  placeholder="my-documents-bucket"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Display Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
          <CardDescription>
            Customize how your documents are displayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Default View</Label>
              <Select
                value={defaultView}
                onValueChange={(v) => setDefaultView(v as ViewMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cards">Cards</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Max File Size</Label>
              <Select
                value={maxFileSizeMb.toString()}
                onValueChange={(v) => setMaxFileSizeMb(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_FILE_SIZE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value.toString()}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleSaveSettings}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Tag Management */}
      <Card>
        <CardHeader>
          <CardTitle>Tag Management</CardTitle>
          <CardDescription>
            Create and manage tags for organizing your documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing tags */}
          {tagsData?.tags && tagsData.tags.length > 0 && (
            <div className="space-y-2">
              <Label>Existing Tags</Label>
              <div className="flex flex-wrap gap-2">
                {tagsData.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    className="flex items-center gap-1 pr-1"
                    style={{ borderColor: tag.color, color: tag.color }}
                  >
                    {tag.name}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({tag.usage_count})
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 hover:bg-destructive/20"
                      onClick={() => handleDeleteTag(tag.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Create new tag */}
          <div className="space-y-2">
            <Label>Create New Tag</Label>
            <div className="flex gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name"
                className="flex-1"
              />
              <Select value={newTagColor} onValueChange={setNewTagColor}>
                <SelectTrigger className="w-32">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: newTagColor }}
                    />
                    <span>Color</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {TAG_COLORS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: color.value }}
                        />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleCreateTag}
                disabled={createTag.isPending || !newTagName.trim()}
              >
                {createTag.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
