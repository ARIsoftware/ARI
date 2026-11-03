'use client'

import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { CHAT_TYPE_CLASS } from '@/modules/chat/lib/utils'
import { useDeleteConversation, useUpdateConversation } from '@/modules/chat/hooks/use-chat'
import { RenameDialog } from './rename-dialog'
import type { ChatConversation } from '@/modules/chat/types'

interface ConversationActionsProps {
  conversation: ChatConversation
  /** Called after a successful delete (e.g. to clear the active chat). */
  onDeleted?: (id: string) => void
  /** Extra classes for the trigger button (e.g. hover-reveal in the list). */
  triggerClassName?: string
}

/** "⋯" menu with Rename and Delete, shared by the chat list and the thread header. */
export function ConversationActions({ conversation, onDeleted, triggerClassName }: ConversationActionsProps) {
  const updateMutation = useUpdateConversation()
  const deleteMutation = useDeleteConversation()
  const { toast } = useToast()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleRename = (title: string) => {
    updateMutation.mutate(
      { id: conversation.id, title },
      {
        onSuccess: () => setRenaming(false),
        onError: (err) =>
          toast({
            variant: 'destructive',
            title: 'Failed to rename chat',
            description: err instanceof Error ? err.message : 'Please try again.',
          }),
      },
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(conversation.id, {
      onSuccess: () => {
        setDeleting(false)
        onDeleted?.(conversation.id)
      },
      onError: (err) =>
        toast({
          variant: 'destructive',
          title: 'Failed to delete chat',
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
    })
  }

  // Events from portalled menus/dialogs still bubble through the React tree;
  // stop them here so they never reach a clickable parent (the list row).
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div className="contents" onClick={stop} onKeyDown={stop}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Chat actions for ${conversation.title}`}
            className={cn('h-7 w-7 shrink-0', triggerClassName)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={CHAT_TYPE_CLASS}>
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={() => setDeleting(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renaming}
        initialTitle={conversation.title}
        isPending={updateMutation.isPending}
        onCancel={() => setRenaming(false)}
        onSubmit={handleRename}
      />

      <AlertDialog open={deleting} onOpenChange={(next) => { if (!next) setDeleting(false) }}>
        <AlertDialogContent className={CHAT_TYPE_CLASS}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              All messages in &ldquo;{conversation.title}&rdquo; will be permanently removed. Uploaded files stay in the Uploads tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
