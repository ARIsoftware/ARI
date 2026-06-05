'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAddMotivationVideo } from '../hooks/use-motivation'
import { useToast } from '@/hooks/use-toast'
import { extractYouTubeId } from '../lib/youtube'
import { URL_MAX } from '../lib/validation'

interface AddVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddVideoDialog({ open, onOpenChange }: AddVideoDialogProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const addVideo = useAddMotivationVideo()
  const { toast } = useToast()

  const handleClose = (next: boolean) => {
    if (!next) {
      setUrl('')
      setError(null)
    }
    onOpenChange(next)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Paste a YouTube URL to add it')
      return
    }
    if (extractYouTubeId(trimmed) === null) {
      setError("That doesn't look like a YouTube video URL")
      return
    }

    addVideo.mutate(trimmed, {
      onSuccess: () => {
        setUrl('')
        setError(null)
        onOpenChange(false)
        toast({ title: 'Video added' })
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Please try again.'
        setError(message)
      },
    })
  }

  const updateUrl = (value: string) => {
    setUrl(value)
    if (error) setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a YouTube video</DialogTitle>
          <DialogDescription>
            Paste any YouTube video URL. We&apos;ll grab the title and thumbnail for you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="video-url">YouTube URL</Label>
            <Input
              id="video-url"
              value={url}
              onChange={(e) => updateUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              maxLength={URL_MAX}
              autoFocus
              disabled={addVideo.isPending}
              aria-invalid={!!error}
              aria-describedby={error ? 'video-url-error' : undefined}
              className={cn(error && 'border-red-500 focus-visible:ring-red-500')}
            />
            {error && (
              <p id="video-url-error" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={addVideo.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={addVideo.isPending || !url.trim()}>
              {addVideo.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                'Add video'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
