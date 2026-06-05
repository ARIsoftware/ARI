'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { VideoCard } from './video-card'
import type { GridDensity, MotivationVideo } from '../types'

interface VideoGridProps {
  videos: MotivationVideo[]
  density: GridDensity
  reorderEnabled: boolean
  onPlay: (videoId: string) => void
  onDelete: (videoId: string) => void
  onReorder: (orderedIds: string[]) => void
}

const DENSITY_CLASSES: Record<GridDensity, string> = {
  compact: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3',
  comfortable: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
  spacious: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6',
}

export function VideoGrid({
  videos,
  density,
  reorderEnabled,
  onPlay,
  onDelete,
  onReorder,
}: VideoGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Local override lets the grid animate the drop instantly while the
  // reorder mutation settles in the background. Cleared whenever the
  // backing `videos` array changes shape (add/delete) so we re-sync.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  useEffect(() => {
    setLocalOrder((prev) => (prev && prev.length !== videos.length ? null : prev))
  }, [videos.length])

  const { orderedIds, orderedVideos } = useMemo(() => {
    const ids = localOrder ?? videos.map((v) => v.id)
    const byId = new Map(videos.map((v) => [v.id, v]))
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((v): v is MotivationVideo => v !== undefined)
    return { orderedIds: ids, orderedVideos: ordered }
  }, [localOrder, videos])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const currentIds = orderedIds
    const oldIndex = currentIds.indexOf(String(active.id))
    const newIndex = currentIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return

    const next = arrayMove(currentIds, oldIndex, newIndex)
    setLocalOrder(next)
    onReorder(next)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={rectSortingStrategy} disabled={!reorderEnabled}>
        <div className={cn('grid', DENSITY_CLASSES[density])}>
          {orderedVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              sortable={reorderEnabled}
              onPlay={() => onPlay(video.id)}
              onDelete={() => onDelete(video.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
