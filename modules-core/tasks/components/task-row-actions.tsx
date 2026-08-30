'use client'

import type { MutableRefObject } from 'react'
import { Pencil, Pin, Eye, EyeOff, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Task } from '@/modules/tasks/types'

/**
 * The per-task action cluster: Edit, Pin, Privacy eye, Delete, and (row
 * variant only) the drag handle — each wrapped in the same tooltip the topbar
 * icons use. One component so the list, card, and table views can't drift.
 *
 * `variant`:
 *  - "row"   — list & card views. Pinned rows repaint their buttons with the
 *              --primary-foreground palette (the row itself is primary-filled
 *              in light themes), and the drag handle is included.
 *  - "table" — table view. Neutral palette, no drag handle.
 *
 * Enabled pin/eye colour reads --task-toggle-accent when the active theme
 * defines it (Sovereign Day's blue), falling back to the view's normal
 * primary tokens everywhere else.
 */
interface TaskRowActionsProps {
  task: Task
  canMask: boolean
  variant: 'row' | 'table'
  onTogglePin: (id: string) => void
  onToggleMask: (task: Task) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  /** Required for the "row" variant — arms drags started on the grip handle. */
  dragFromHandleRef?: MutableRefObject<boolean>
}

export function TaskRowActions({
  task,
  canMask,
  variant,
  onTogglePin,
  onToggleMask,
  onEdit,
  onDelete,
  dragFromHandleRef,
}: TaskRowActionsProps) {
  const pinnedRow = variant === 'row' && task.pinned

  // Neutral buttons (edit / delete / grip) — pinned rows swap to the
  // primary-foreground palette so they stay visible on the filled row.
  const pinnedNeutral =
    'text-[hsl(var(--primary-foreground))]/75 hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-foreground))]/15 dark:text-[hsl(var(--muted-foreground))] dark:hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--muted))]'
  const editClass = pinnedRow
    ? pinnedNeutral
    : 'text-muted-foreground hover:text-primary hover:bg-muted'
  const deleteClass = pinnedRow
    ? pinnedNeutral
    : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
  const gripClass = pinnedRow
    ? pinnedNeutral
    : 'text-muted-foreground hover:text-foreground hover:bg-muted'

  // Enabled pin/eye — --task-toggle-accent wins when the theme defines it.
  const toggleOnClass =
    variant === 'row'
      ? 'text-[hsl(var(--task-toggle-accent,var(--primary-foreground)))] dark:text-[hsl(var(--task-toggle-accent,var(--primary)))]'
      : 'text-[hsl(var(--task-toggle-accent,var(--primary)))]'
  const toggleOffClass = 'text-muted-foreground hover:text-[hsl(var(--primary))]'

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editClass}`}
            onClick={(e) => {
              e.stopPropagation()
              onEdit(task.id)
            }}
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Edit task</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              onTogglePin(task.id)
            }}
          >
            <Pin
              className={`w-4 h-4 ${task.pinned ? toggleOnClass : toggleOffClass}`}
              fill={task.pinned ? 'currentColor' : 'none'}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{task.pinned ? 'Unpin task' : 'Pin task'}</p>
        </TooltipContent>
      </Tooltip>
      {canMask && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={task.is_private ? 'Make task shared' : 'Make task private'}
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation()
                onToggleMask(task)
              }}
            >
              {task.is_private ? (
                <EyeOff className={`w-4 h-4 ${toggleOnClass}`} />
              ) : (
                <Eye className={`w-4 h-4 ${toggleOffClass}`} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {task.is_private
                ? 'Private: only you can see this task'
                : 'Make private (only you can see it)'}
            </p>
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${deleteClass}`}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(task.id)
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Delete task</p>
        </TooltipContent>
      </Tooltip>
      {variant === 'row' && dragFromHandleRef && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Drag to reorder"
              onMouseDown={() => {
                dragFromHandleRef.current = true
              }}
              onMouseUp={() => {
                dragFromHandleRef.current = false
              }}
              onClick={(e) => e.stopPropagation()}
              className={`h-8 w-8 cursor-grab active:cursor-grabbing ${gripClass}`}
            >
              <GripVertical className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Drag to reorder</p>
          </TooltipContent>
        </Tooltip>
      )}
    </>
  )
}
