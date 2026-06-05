'use client'

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
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MotivationVideo } from '../types'

interface DeleteVideoDialogProps {
  video: MotivationVideo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
}

export function DeleteVideoDialog({
  video,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: DeleteVideoDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this video?</AlertDialogTitle>
          <AlertDialogDescription>
            {video?.title
              ? `"${video.title}" will be removed from your Motivation list.`
              : 'This video will be removed from your Motivation list.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              // Keep dialog open during the mutation so we can show the
              // spinner; close happens via onSuccess in the parent.
              e.preventDefault()
              onConfirm()
            }}
            className={cn(buttonVariants({ variant: 'destructive' }))}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Removing...
              </>
            ) : (
              'Remove'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
