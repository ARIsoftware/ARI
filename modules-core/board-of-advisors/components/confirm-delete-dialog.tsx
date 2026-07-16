'use client'

import type { ReactNode } from 'react'
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

interface ConfirmDeleteDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  isPending: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

/** Destructive confirmation dialog shared by the advisor and discussion lists. */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  isPending,
  onConfirm,
  onOpenChange,
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onOpenChange(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm() }}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
