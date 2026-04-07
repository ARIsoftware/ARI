/**
 * Unsaved Changes Dialog Pattern (Reference Implementation)
 *
 * Drop-in pattern for any module that has an editable view where the user
 * can navigate away (close a panel, click a link, etc.) with unsaved work.
 *
 * Used in production by:
 *   - modules-core/brainstorm/components/canvas.tsx
 *   - modules-core/notepad/components/notepad.tsx
 *
 * USAGE:
 *
 *   const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
 *   const [isSaving, setIsSaving] = useState(false)
 *   const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
 *
 *   // Intercept the close/navigate action
 *   const handleClose = () => {
 *     if (hasUnsavedChanges) {
 *       setShowUnsavedDialog(true)
 *       return
 *     }
 *     onClose()
 *   }
 *
 *   <UnsavedChangesDialog
 *     open={showUnsavedDialog}
 *     onOpenChange={setShowUnsavedDialog}
 *     isSaving={isSaving}
 *     onDiscard={() => { resetLocalState(); onClose() }}
 *     onSave={async () => {
 *       setIsSaving(true)
 *       try {
 *         await saveToServer()
 *         setHasUnsavedChanges(false)
 *         onClose()
 *       } finally {
 *         setIsSaving(false)
 *       }
 *     }}
 *   />
 *
 * Three explicit choices (matches the Brainstorm/Notepad UX):
 *   - Stay     → cancel, keep editing
 *   - Discard  → throw away local changes and close
 *   - Save     → persist and stay on the current view (does NOT auto-close)
 */

'use client'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
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
  onDiscard: () => void
  onSave: () => void | Promise<void>
  isSaving?: boolean
  /** Override the default copy if your context needs something more specific. */
  title?: string
  description?: string
  /** Label for the destructive "throw away changes" button. */
  discardLabel?: string
  /** Label for the primary "persist and continue" button. */
  saveLabel?: string
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  onSave,
  isSaving = false,
  title = 'Unsaved changes',
  description = 'You have unsaved changes. Save before leaving?',
  discardLabel = 'Discard',
  saveLabel = 'Save',
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <Button variant="outline" onClick={onDiscard} disabled={isSaving}>
            {discardLabel}
          </Button>
          <AlertDialogAction onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : saveLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
