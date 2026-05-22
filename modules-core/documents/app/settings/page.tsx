'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { Loader2, HardDrive, AlertCircle, Plus, Trash2 } from 'lucide-react'
import {
  useDocumentsSettings,
  useUpdateDocumentsSettings,
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
} from '../../hooks/use-documents'
import type { ViewMode } from '../../types'
import { MAX_FILE_SIZE_OPTIONS, TAG_COLORS, MAX_UPLOAD_MB } from '../../types'
import { toastError } from '../../lib/utils'

export default function DocumentsSettingsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useDocumentsSettings()
  const updateSettings = useUpdateDocumentsSettings()
  const { data: tagsData, error: tagsError, refetch: refetchTags } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  // Form state
  const [defaultView, setDefaultView] = useState<ViewMode>('cards')
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(MAX_UPLOAD_MB)

  // New tag state
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')

  // Update form state when settings load
  useEffect(() => {
    if (settings) {
      setDefaultView(settings.defaultView || 'cards')
      setMaxFileSizeMb(settings.maxFileSizeMb || MAX_UPLOAD_MB)
    }
  }, [settings])

  const handleSaveSettings = async () => {
    try {
      await updateSettings.mutateAsync({ defaultView, maxFileSizeMb })
      toast({
        title: 'Settings saved',
        description: 'Your changes have been saved successfully.',
      })
    } catch (error) {
      toastError(toast, 'Failed to save settings', error)
    }
  }

  const handleResetOnboarding = () => {
    updateSettings.mutate(
      { onboardingCompleted: false },
      {
        onSuccess: () => {
          router.push('/documents')
        },
        onError: (err) => {
          toast({
            variant: 'destructive',
            title: 'Failed to reset onboarding',
            description: err instanceof Error ? err.message : 'Please try again',
          })
        },
      }
    )
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
      toastError(toast, 'Failed to create tag', error)
    }
  }

  const [confirmDeleteTag, setConfirmDeleteTag] = useState<{ id: string; name: string } | null>(null)

  const handleDeleteTag = (tag: { id: string; name: string }) => {
    setConfirmDeleteTag(tag)
  }

  const performDeleteTag = async () => {
    if (!confirmDeleteTag) return
    const { id } = confirmDeleteTag
    setConfirmDeleteTag(null)
    try {
      await deleteTag.mutateAsync(id)
      toast({ title: 'Tag deleted' })
    } catch (error) {
      toastError(toast, 'Failed to delete tag', error)
    }
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (settingsError) {
    return (
      <div className="p-6 max-w-2xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn't load settings</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{settingsError instanceof Error ? settingsError.message : 'Unknown error'}</p>
            <Button variant="outline" size="sm" onClick={() => refetchSettings()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
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

      {/* Storage Provider — read-only banner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage Provider
          </CardTitle>
          <CardDescription>
            Documents use the same storage backend as the rest of ARI, configured via
            the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ARI_STORAGE_PROVIDER</code> env var.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings?.globalProvider ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="font-medium">{settings.globalProvider.label}</span>
              <span className="ml-2 text-muted-foreground">
                {settings.globalProvider.source === 'env'
                  ? '(from ARI_STORAGE_PROVIDER)'
                  : '(default — ARI_STORAGE_PROVIDER not set)'}
              </span>
              <p className="mt-2 text-xs text-muted-foreground">
                Change the backend in <span className="font-mono">Settings → Storage</span>{' '}
                (or edit <code className="rounded bg-background px-1 py-0.5 font-mono">.env.local</code> directly and restart).
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
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
              <Label htmlFor="settings-default-view">Default View</Label>
              <Select
                value={defaultView}
                onValueChange={(v) => setDefaultView(v as ViewMode)}
              >
                <SelectTrigger id="settings-default-view">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cards">Cards</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-file-size">Max File Size</Label>
              <Select
                value={maxFileSizeMb.toString()}
                onValueChange={(v) => setMaxFileSizeMb(parseInt(v))}
              >
                <SelectTrigger id="max-file-size">
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
              <p className="text-xs text-muted-foreground">
                Uploads through the API are buffered in memory, so the cap is currently 50 MB.
                On Vercel, the platform also enforces a ~4.5 MB body limit before requests reach the app.
                Self-hosted ARI honors the full setting.
              </p>
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
          {tagsError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn't load tags</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{tagsError instanceof Error ? tagsError.message : 'Unknown error'}</p>
                <Button variant="outline" size="sm" onClick={() => refetchTags()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

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
                      onClick={() => handleDeleteTag(tag)}
                      disabled={deleteTag.isPending}
                      aria-label={`Delete tag ${tag.name}`}
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
                aria-label="Create tag"
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

      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>Reset the setup flow if you want to walk through it again</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleResetOnboarding}
            disabled={updateSettings.isPending}
          >
            Reset onboarding
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!confirmDeleteTag}
        onOpenChange={(open) => !open && setConfirmDeleteTag(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteTag
                ? `“${confirmDeleteTag.name}” will be removed and unassigned from every document. This cannot be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performDeleteTag}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
