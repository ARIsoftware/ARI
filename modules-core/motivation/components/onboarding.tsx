'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Flame, Loader2 } from 'lucide-react'
import { useUpdateMotivationSettings } from '../hooks/use-motivation'
import { useToast } from '@/hooks/use-toast'
import type { GridDensity, SortOrder } from '../types'

export function MotivationOnboarding() {
  const updateSettings = useUpdateMotivationSettings()
  const { toast } = useToast()
  const [autoplayNext, setAutoplayNext] = useState(true)
  const [defaultSort, setDefaultSort] = useState<SortOrder>('custom')
  const [gridDensity, setGridDensity] = useState<GridDensity>('comfortable')

  const handleGetStarted = () => {
    updateSettings.mutate(
      {
        onboardingCompleted: true,
        autoplayNext,
        defaultSort,
        gridDensity,
      },
      {
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Please try again.'
          toast({ variant: 'destructive', title: 'Could not save preferences', description: message })
        },
      },
    )
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Flame className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to Motivation</CardTitle>
          <CardDescription>
            Save YouTube videos that fire you up and play them back-to-back. Pick a few defaults to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="autoplay" className="text-sm font-medium">Autoplay next video</Label>
              <p className="text-xs text-muted-foreground mt-1">
                When a video ends, immediately play the next one.
              </p>
            </div>
            <Switch id="autoplay" checked={autoplayNext} onCheckedChange={setAutoplayNext} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-sort">Default sort order</Label>
            <Select value={defaultSort} onValueChange={(v) => setDefaultSort(v as SortOrder)}>
              <SelectTrigger id="default-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom (drag to reorder)</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grid-density">Grid density</Label>
            <Select value={gridDensity} onValueChange={(v) => setGridDensity(v as GridDensity)}>
              <SelectTrigger id="grid-density">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="spacious">Spacious</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={handleGetStarted}
            disabled={updateSettings.isPending || updateSettings.isSuccess}
          >
            {updateSettings.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Get Started'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
