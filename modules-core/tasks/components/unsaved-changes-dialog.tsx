'use client'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface UnsavedChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Throw away local changes and continue to the pending destination. */
  onDiscard: () => void
  /** Persist changes, then continue to the pending destination. */
  onSave: () => void | Promise<void>
  isSaving?: boolean
  title?: string
  description?: string
}

/**
 * Three-choice guard shown when the user tries to leave an editable view with
 * unsaved work (matches the Brainstorm / Notepad UX):
 *   - Stay    → cancel, keep editing
 *   - Discard → throw away local changes and leave
 *   - Save    → persist, then leave
 *
 * Save is a plain Button (not AlertDialogAction) so the dialog stays open and
 * can show a "Saving..." state while the async save runs; it closes only once
 * navigation proceeds.
 */
export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  onSave,
  isSaving = false,
  title = 'Unsaved changes',
  description = 'You have unsaved changes to this task. Save before leaving?',
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Stay</AlertDialogCancel>
          <Button variant="outline" onClick={onDiscard} disabled={isSaving}>
            Discard
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
