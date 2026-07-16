'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { GripVertical, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import {
  useAdvisors,
  useDeleteAdvisor,
  useReorderAdvisors,
} from '@/modules/board-of-advisors/hooks/use-board-of-advisors'
import { destructiveToast } from '@/modules/board-of-advisors/lib/utils'
import { AdvisorAvatar } from './advisor-avatar'
import { AdvisorDialog } from './advisor-dialog'
import { ConfirmDeleteDialog } from './confirm-delete-dialog'
import type { BoardAdvisor } from '@/modules/board-of-advisors/types'

function SortableAdvisorRow({
  advisor,
  position,
  onEdit,
  onDelete,
}: {
  advisor: BoardAdvisor
  position: number
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: advisor.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-start gap-3 rounded-xl border bg-card p-3.5 transition-shadow',
        isDragging && 'z-10 shadow-lg ring-2 ring-accent/30',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-2 cursor-grab touch-none rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={`Drag to reorder ${advisor.name}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <AdvisorAvatar name={advisor.name} color={advisor.color} size="md" className="mt-1" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{advisor.name}</p>
          <span className="shrink-0 rounded bg-foreground/5 px-1.5 py-px text-[10px] font-medium text-muted-foreground">
            speaks {position === 1 ? 'first' : `#${position}`}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {advisor.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label={`Edit ${advisor.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600"
          onClick={onDelete}
          aria-label={`Remove ${advisor.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function AdvisorList() {
  const { toast } = useToast()
  const { data: advisors = [], isLoading } = useAdvisors()
  const deleteAdvisor = useDeleteAdvisor()
  const reorderAdvisors = useReorderAdvisors()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BoardAdvisor | null>(null)
  const [deleting, setDeleting] = useState<BoardAdvisor | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = advisors.findIndex((a) => a.id === active.id)
    const newIndex = advisors.findIndex((a) => a.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(advisors, oldIndex, newIndex)
    reorderAdvisors.mutate(reordered.map((a) => a.id), {
      onError: (err) => toast(destructiveToast('Failed to save the speaking order', err)),
    })
  }

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (advisor: BoardAdvisor) => {
    setEditing(advisor)
    setDialogOpen(true)
  }

  const handleDelete = () => {
    if (!deleting) return
    deleteAdvisor.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: (err) => toast(destructiveToast('Failed to remove advisor', err)),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-[74px] w-full rounded-xl" />
        <Skeleton className="h-[74px] w-full rounded-xl" />
        <Skeleton className="h-[74px] w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {advisors.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-4 py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <p className="text-sm font-medium">No advisors yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Add your first advisor — a name and a personality is all it takes to give them a seat
            at the table.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={advisors.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {advisors.map((advisor, index) => (
                <SortableAdvisorRow
                  key={advisor.id}
                  advisor={advisor}
                  position={index + 1}
                  onEdit={() => openEdit(advisor)}
                  onDelete={() => setDeleting(advisor)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center justify-between">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Add advisor
        </Button>
        {advisors.length > 1 && (
          <p className="text-xs text-muted-foreground">Drag to change the speaking order.</p>
        )}
      </div>

      <AdvisorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        advisor={editing}
        existingCount={advisors.length}
      />

      <ConfirmDeleteDialog
        open={!!deleting}
        title={`Remove ${deleting?.name ?? 'this advisor'} from the board?`}
        description="They will no longer answer new questions. Their replies in past discussions are kept."
        confirmLabel="Remove"
        isPending={deleteAdvisor.isPending}
        onConfirm={handleDelete}
        onOpenChange={(next) => { if (!next) setDeleting(null) }}
      />
    </div>
  )
}
