'use client'

import { useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Play, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { MotivationVideo } from '../types'
import { fallbackThumbnailFor, thumbnailFor } from '../lib/youtube'

interface VideoCardProps {
  video: MotivationVideo
  onPlay: () => void
  onDelete: () => void
  sortable: boolean
}

export function VideoCard({ video, onPlay, onDelete, sortable }: VideoCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id, disabled: !sortable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const primarySrc = video.thumbnail_url ?? thumbnailFor(video.youtube_id)
  const [thumbSrc, setThumbSrc] = useState(primarySrc)
  const [thumbFailed, setThumbFailed] = useState(false)

  // Re-sync if the underlying video changes (e.g. thumbnail_url backfilled
  // or the card is recycled to render a different video).
  useEffect(() => {
    setThumbSrc(primarySrc)
    setThumbFailed(false)
  }, [primarySrc])

  const handleThumbError = () => {
    if (!thumbFailed) {
      setThumbFailed(true)
      setThumbSrc(fallbackThumbnailFor(video.youtube_id))
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border bg-card transition-all',
        'hover:border-primary/40 hover:shadow-lg',
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Play ${video.title ?? 'video'}`}
      >
        <div className="relative aspect-video bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbSrc}
            alt={video.title ?? 'YouTube video thumbnail'}
            onError={handleThumbError}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 shadow-lg">
              <Play className="h-6 w-6 fill-primary-foreground text-primary-foreground" />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3 text-white">
            <p className="line-clamp-2 text-sm font-medium leading-snug drop-shadow">
              {video.title ?? 'Untitled video'}
            </p>
            {video.channel && (
              <p className="mt-1 line-clamp-1 text-xs text-white/80 drop-shadow">{video.channel}</p>
            )}
          </div>
        </div>
      </button>

      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {sortable && (
          <button
            type="button"
            className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md bg-black/60 text-white backdrop-blur hover:bg-black/80 active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 bg-black/60 text-white backdrop-blur hover:bg-destructive/90 hover:text-white"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete video"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
