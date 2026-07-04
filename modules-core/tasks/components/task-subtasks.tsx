"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { Plus, X, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask, isTempSubtaskId } from "../hooks/use-subtasks"
import type { Subtask } from "../types"

/**
 * One checklist row: checkbox, title, hover/focus-revealed delete.
 * Shared by both variants so behavior can't drift between them; the variants
 * only differ in the wrapper markup around this row.
 * Rows with a temp (optimistic) id are disabled until the server row lands.
 */
function SubtaskRow({
  subtask,
  pinned,
  onToggle,
  onDelete,
}: {
  subtask: Subtask
  pinned: boolean
  onToggle: (subtask: Subtask) => void
  onDelete: (subtask: Subtask) => void
}) {
  const pending = isTempSubtaskId(subtask.id)

  return (
    <>
      <input
        type="checkbox"
        checked={subtask.completed}
        disabled={pending}
        onChange={() => onToggle(subtask)}
        className="w-4 h-4 rounded border-gray-300 disabled:opacity-50"
      />
      <span
        className={`flex-1 text-sm ${
          subtask.completed
            ? `line-through ${pinned ? "text-gray-400" : "text-muted-foreground"}`
            : pinned ? "text-gray-100" : "text-foreground"
        } ${pending ? "opacity-60" : ""}`}
      >
        {subtask.title}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => onDelete(subtask)}
        className={`opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity ${
          pinned ? "text-gray-300 hover:text-white" : "text-muted-foreground hover:text-destructive"
        }`}
        aria-label={`Delete subtask "${subtask.title}"`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </>
  )
}

/**
 * Add-subtask input row, rendered by the panel variant only. Separate
 * component so the inline variant (one per expanded task in the list view)
 * never pays for the create mutation and input state it can't use.
 */
function AddSubtaskRow({ taskId, pinned }: { taskId: string; pinned: boolean }) {
  const createSubtask = useCreateSubtask()
  const [newTitle, setNewTitle] = useState("")

  const handleAdd = () => {
    const title = newTitle.trim()
    if (!title) return
    createSubtask.mutate({ task_id: taskId, title })
    setNewTitle("")
  }

  return (
    <div className="flex items-center gap-2 pt-2">
      <Input
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            handleAdd()
          }
        }}
        placeholder="Add a subtask..."
        maxLength={255}
        className={cn(
          "h-9 flex-1 bg-transparent",
          pinned && "border-white/20 text-white placeholder:text-gray-400"
        )}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleAdd}
        disabled={!newTitle.trim()}
        className={cn("h-9 w-9 bg-transparent", pinned && "border-white/20 text-gray-200 hover:bg-white/10")}
        aria-label="Add subtask"
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

/**
 * Subtask checklist for a task. Handles its own data via the shared
 * ['task-subtasks'] query, so multiple instances stay in sync.
 *
 * Variants:
 * - "panel": boxed checklist with an add input. Used inside the edit-task
 *   page and the card-view task cards.
 * - "inline": read-only-ish indented rows (toggle/delete, no add) rendered
 *   underneath the parent row in the list view. Transparent background so
 *   the rows sit directly on the page. Adding happens on the edit page.
 *
 * `pinned` switches the panel to light-on-dark styling to match the pinned
 * task rows (the inline rows sit on the page background, so they ignore it).
 * `cancelParentDrag` marks the panel draggable-but-cancelled so interacting
 * with it doesn't drag a draggable ancestor (the card-view task card). Only
 * set it when such an ancestor exists — a draggable wrapper suppresses mouse
 * text selection in child inputs on Firefox.
 */
export function TaskSubtasks({
  taskId,
  pinned = false,
  variant = "panel",
  cancelParentDrag = false,
}: {
  taskId: string
  pinned?: boolean
  variant?: "panel" | "inline"
  cancelParentDrag?: boolean
}) {
  const { data: allSubtasks = [], isLoading } = useSubtasks()
  const updateSubtask = useUpdateSubtask()
  const deleteSubtask = useDeleteSubtask()

  // No sort needed: the API returns rows ordered by (order_index, created_at)
  // and optimistic inserts append at the end, so filtering preserves order.
  const subtasks = useMemo(
    () => allSubtasks.filter((s) => s.task_id === taskId),
    [allSubtasks, taskId]
  )

  const handleToggle = (subtask: Subtask) =>
    updateSubtask.mutate({ id: subtask.id, completed: !subtask.completed })
  const handleDelete = (subtask: Subtask) => deleteSubtask.mutate(subtask.id)

  // Cancel drag from inside the panel so typing/selecting in the input does
  // not start dragging the surrounding task card (card view only).
  const blockParentDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  if (variant === "inline") {
    if (isLoading) return null
    return (
      // Inline style beats the parent container's space-y margin so the
      // subtask rows sit visually attached to their parent task row.
      <div className="ml-12 space-y-1.5" style={{ marginTop: 6 }}>
        {subtasks.length === 0 ? (
          <p className="px-3 py-1 text-xs text-muted-foreground">
            No subtasks. Add them from the edit page.
          </p>
        ) : (
          subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="group flex items-center gap-3 rounded-md border border-border bg-transparent px-3 py-2"
            >
              <SubtaskRow subtask={subtask} pinned={false} onToggle={handleToggle} onDelete={handleDelete} />
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div
      draggable={cancelParentDrag || undefined}
      onDragStart={cancelParentDrag ? blockParentDrag : undefined}
      className={`mt-3 space-y-2 rounded-md border p-4 ${
        pinned ? "border-white/20 bg-white/5" : "border-border bg-muted/40"
      }`}
    >
      {isLoading ? (
        <div className={`flex items-center gap-2 text-xs ${pinned ? "text-gray-300" : "text-muted-foreground"}`}>
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading subtasks...
        </div>
      ) : subtasks.length === 0 ? (
        <p className={`text-xs ${pinned ? "text-gray-300" : "text-muted-foreground"}`}>
          No subtasks yet. Add one below.
        </p>
      ) : (
        subtasks.map((subtask) => (
          <div key={subtask.id} className="group flex items-center gap-3 py-1.5">
            <SubtaskRow subtask={subtask} pinned={pinned} onToggle={handleToggle} onDelete={handleDelete} />
          </div>
        ))
      )}

      <AddSubtaskRow taskId={taskId} pinned={pinned} />
    </div>
  )
}
