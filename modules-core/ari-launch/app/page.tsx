/**
 * ARI Launch Module - Main Page (v3)
 *
 * A 45-day planning calendar with drag-and-drop support.
 * - Multiple tasks per day
 * - Drag tasks between days
 * - Click box to add new task
 * - Click task to edit/delete
 *
 * Uses TanStack Query for data fetching and optimistic updates.
 *
 * Route: /ari-launch
 */

'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Rocket, Plus, GripVertical, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  useAriLaunchEntries,
  useCreateAriLaunchEntry,
  useUpdateAriLaunchEntry,
  useDeleteAriLaunchEntry,
} from '@/lib/hooks/use-ari-launch'
import type { AriLaunchEntry } from '../types'

const TOTAL_DAYS = 45
const TRUNCATE_LENGTH = 30
const MAX_TITLE_LENGTH = 3000
const WARNING_THRESHOLD = 2900

export default function AriLaunchPage() {
  const { toast } = useToast()

  // TanStack Query hooks
  const { data: entries = [], isLoading: loading } = useAriLaunchEntries()
  const createEntry = useCreateAriLaunchEntry()
  const updateEntry = useUpdateAriLaunchEntry()
  const deleteEntry = useDeleteAriLaunchEntry()

  // Modal state for adding new task
  const [addingToDay, setAddingToDay] = useState<number | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  // Modal state for editing task
  const [editingTask, setEditingTask] = useState<AriLaunchEntry | null>(null)
  const [editTitle, setEditTitle] = useState('')

  // Drag state
  const [draggedTask, setDraggedTask] = useState<AriLaunchEntry | null>(null)
  const [dragOverDay, setDragOverDay] = useState<number | null>(null)

  /**
   * Get entries for a specific day
   */
  const getEntriesForDay = (day: number): AriLaunchEntry[] => {
    return entries
      .filter(e => e.day_number === day)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
  }

  /**
   * Truncate text with ellipsis
   */
  const truncateText = (text: string, maxLength: number = TRUNCATE_LENGTH): string => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  /**
   * Add a new task to a day
   */
  const handleAddTask = () => {
    if (addingToDay === null || !newTaskTitle.trim()) return

    const day = addingToDay
    const title = newTaskTitle.trim()

    // Close modal immediately (optimistic)
    setAddingToDay(null)
    setNewTaskTitle('')

    createEntry.mutate(
      { day_number: day, title },
      {
        onError: () => {
          toast({
            variant: 'destructive',
            title: 'Failed to save task',
            description: 'Please try again.',
          })
        },
      }
    )
  }

  /**
   * Update a task title
   */
  const handleUpdateTask = () => {
    if (!editingTask || !editTitle.trim()) return

    const taskId = editingTask.id
    const title = editTitle.trim()

    // Close modal immediately (optimistic)
    setEditingTask(null)
    setEditTitle('')

    updateEntry.mutate(
      { id: taskId, title },
      {
        onError: () => {
          toast({
            variant: 'destructive',
            title: 'Failed to update task',
            description: 'Your changes were not saved. Please try again.',
          })
        },
      }
    )
  }

  /**
   * Delete a task
   */
  const handleDeleteTask = (taskId: string) => {
    // Close modal immediately (optimistic)
    setEditingTask(null)

    deleteEntry.mutate(taskId, {
      onError: () => {
        toast({
          variant: 'destructive',
          title: 'Failed to delete task',
          description: 'The task was restored. Please try again.',
        })
      },
    })
  }

  /**
   * Handle drag start
   */
  const handleDragStart = (e: React.DragEvent, task: AriLaunchEntry) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }

  /**
   * Handle drag over a day box
   */
  const handleDragOver = (e: React.DragEvent, day: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDay(day)
  }

  /**
   * Handle drag leave
   */
  const handleDragLeave = () => {
    setDragOverDay(null)
  }

  /**
   * Handle drop on a day
   */
  const handleDrop = (e: React.DragEvent, targetDay: number) => {
    e.preventDefault()
    setDragOverDay(null)

    if (!draggedTask || draggedTask.day_number === targetDay) {
      setDraggedTask(null)
      return
    }

    const taskId = draggedTask.id
    setDraggedTask(null)

    updateEntry.mutate(
      { id: taskId, day_number: targetDay },
      {
        onError: () => {
          toast({
            variant: 'destructive',
            title: 'Failed to move task',
            description: 'Please try again.',
          })
        },
      }
    )
  }

  /**
   * Handle drag end
   */
  const handleDragEnd = () => {
    setDraggedTask(null)
    setDragOverDay(null)
  }

  const isMutating = createEntry.isPending || updateEntry.isPending || deleteEntry.isPending

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Rocket className="w-8 h-8" />
        <h1 className="text-4xl font-medium">ARI Launch</h1>
        <span className="text-muted-foreground ml-2">45-Day Countdown</span>
      </div>


      {/* 45-Day Calendar Grid */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 rounded-lg">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map(day => {
          const dayEntries = getEntriesForDay(day)
          const isDropTarget = dragOverDay === day
          const hasEntries = dayEntries.length > 0

          return (
            <div
              key={day}
              className={`
                min-h-[180px] rounded-lg border-2 transition-all flex flex-col
                ${isDropTarget
                  ? 'border-primary bg-primary/20 scale-105'
                  : hasEntries
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-card hover:border-primary/30'
                }
              `}
              onDragOver={(e) => handleDragOver(e, day)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, day)}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between px-2 py-1 border-b border-border/50">
                <span className="text-lg font-bold text-muted-foreground">{day}</span>
                <button
                  onClick={() => {
                    setAddingToDay(day)
                    setNewTaskTitle('')
                  }}
                  className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                  title="Add task"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Tasks List */}
              <div className="flex-1 p-1 space-y-1 overflow-hidden">
                {dayEntries.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      setEditingTask(task)
                      setEditTitle(task.title)
                    }}
                    className={`
                      flex items-center gap-1 px-2 py-1 rounded text-sm
                      bg-background border border-border/50
                      cursor-grab active:cursor-grabbing
                      hover:border-primary/50 hover:bg-primary/5
                      transition-all group
                      ${draggedTask?.id === task.id ? 'opacity-50' : ''}
                    `}
                  >
                    <GripVertical className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                    <span className="truncate flex-1" title={task.title}>
                      {truncateText(task.title)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        </div>
      </div>

      {/* Add Task Modal */}
      <Dialog open={addingToDay !== null} onOpenChange={(open) => !open && setAddingToDay(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add Task to Day {addingToDay}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-2">
            <Textarea
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Enter task title..."
              autoFocus
              maxLength={MAX_TITLE_LENGTH}
              rows={4}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey && newTaskTitle.trim()) {
                  handleAddTask()
                }
              }}
            />
            {newTaskTitle.length >= WARNING_THRESHOLD && (
              <div className="text-sm text-red-600 font-medium">
                {MAX_TITLE_LENGTH - newTaskTitle.length} characters left
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingToDay(null)} disabled={createEntry.isPending}>
              Cancel
            </Button>
            <Button onClick={handleAddTask} disabled={createEntry.isPending || !newTaskTitle.trim()}>
              {createEntry.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Task'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Modal */}
      <Dialog open={editingTask !== null} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Edit Task
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-2">
            <Textarea
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Enter task title..."
              autoFocus
              maxLength={MAX_TITLE_LENGTH}
              rows={4}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey && editTitle.trim()) {
                  handleUpdateTask()
                }
              }}
            />
            {editTitle.length >= WARNING_THRESHOLD && (
              <div className="text-sm text-red-600 font-medium">
                {MAX_TITLE_LENGTH - editTitle.length} characters left
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <Button
              variant="destructive"
              onClick={() => editingTask && handleDeleteTask(editingTask.id)}
              disabled={deleteEntry.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingTask(null)} disabled={isMutating}>
                Cancel
              </Button>
              <Button onClick={handleUpdateTask} disabled={isMutating || !editTitle.trim()}>
                {updateEntry.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
