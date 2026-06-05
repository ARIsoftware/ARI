'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { useMotivationSettings, useUpdateMotivationSettings } from '../../hooks/use-motivation'
import { useToast } from '@/hooks/use-toast'
import type { GridDensity, SortOrder } from '../../types'

export default function MotivationSettingsPage() {
  const { toast } = useToast()
  const { data: settings, isLoading } = useMotivationSettings()
  const updateSettings = useUpdateMotivationSettings()

  const [autoplayNext, setAutoplayNext] = useState(true)
  const [defaultSort, setDefaultSort] = useState<SortOrder>('custom')
  const [gridDensity, setGridDensity] = useState<GridDensity>('comfortable')

  // Hydrate from saved settings the first time they load. Subsequent
  // background refetches mustn't stomp the user's pending selections.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (!hydrated && settings) {
      setAutoplayNext(settings.autoplayNext ?? true)
      setDefaultSort(settings.defaultSort ?? 'custom')
      setGridDensity(settings.gridDensity ?? 'comfortable')
      setHydrated(true)
    }
  }, [settings, hydrated])

  const persist = (patch: Parameters<typeof updateSettings.mutate>[0]) => {
    updateSettings.mutate(patch, {
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Please try again.'
        toast({ variant: 'destructive', title: 'Could not save settings', description: message })
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure how the Motivation module behaves.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Playback</CardTitle>
          <CardDescription>How videos play in the popup player.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="autoplay-next" className="text-sm font-medium">Autoplay next by default</Label>
              <p className="text-xs text-muted-foreground mt-1">
                When a video ends, immediately load the next one in your list.
              </p>
            </div>
            <Switch
              id="autoplay-next"
              checked={autoplayNext}
              onCheckedChange={(value) => {
                setAutoplayNext(value)
                persist({ autoplayNext: value })
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
          <CardDescription>How your video collection is shown on the main page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="default-sort">Default sort order</Label>
            <Select
              value={defaultSort}
              onValueChange={(value) => {
                const next = value as SortOrder
                setDefaultSort(next)
                persist({ defaultSort: next })
              }}
            >
              <SelectTrigger id="default-sort" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom (drag to reorder)</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Drag-to-reorder is only available in &ldquo;Custom&rdquo; mode.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grid-density">Grid density</Label>
            <Select
              value={gridDensity}
              onValueChange={(value) => {
                const next = value as GridDensity
                setGridDensity(next)
                persist({ gridDensity: next })
              }}
            >
              <SelectTrigger id="grid-density" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="spacious">Spacious</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
