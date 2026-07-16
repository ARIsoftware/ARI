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
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, ImageIcon, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { formatRelativeTime } from '@/lib/utils'
import { useChatUploads, useDeleteChatUpload } from '@/modules/chat/hooks/use-chat'
import { useRandomQuote } from '@/modules/chat/hooks/use-quote'
import { formatBytes, isImageMime } from '@/modules/chat/lib/utils'
import type { ChatUpload } from '@/modules/chat/types'

export default function ChatUploadsPage() {
  const { data: uploads = [], isLoading } = useChatUploads()
  const deleteUpload = useDeleteChatUpload()
  const { toast } = useToast()
  const randomQuote = useRandomQuote()

  const [deleting, setDeleting] = useState<ChatUpload | null>(null)

  const handleDelete = () => {
    if (!deleting) return
    deleteUpload.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: (err) => toast({
        variant: 'destructive',
        title: 'Failed to delete file',
        description: err instanceof Error ? err.message : 'Please try again.',
      }),
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-medium">Uploads</h1>
        {randomQuote && (
          <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          Every file you&apos;ve attached to a chat. Stored via the active Storage Provider
          (configured in <code className="font-mono text-xs">/settings?tab=storage</code>).
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : uploads.length === 0 ? (
        <Card className="p-8 text-center">
          <Paperclip className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">
            No uploads yet. Attach a file in a chat and it&apos;ll appear here.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {uploads.map((upload) => {
            const Icon = isImageMime(upload.mime) ? ImageIcon : FileText
            return (
              <Card key={upload.id} className="p-4 flex flex-col gap-3 group">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="shrink-0 rounded-md bg-muted p-2">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/storage/serve/${encodeURIComponent(upload.bucket)}/${encodeURIComponent(upload.filename)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium hover:underline truncate"
                      title={upload.original_name}
                    >
                      {upload.original_name}
                    </a>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {upload.mime} · {formatBytes(upload.size)} · {formatRelativeTime(new Date(upload.created_at))}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setDeleting(upload)}
                    disabled={deleteUpload.isPending && deleting?.id === upload.id}
                  >
                    {deleteUpload.isPending && deleting?.id === upload.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1.5" />
                    )}
                    Delete
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(next) => { if (!next) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleting?.original_name}&rdquo; will be removed from storage and from any chat that referenced it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUpload.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleteUpload.isPending}
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
