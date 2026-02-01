'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { Trash2, RotateCcw, Loader2, AlertTriangle, FileBox } from 'lucide-react'
import {
  useTrashDocuments,
  useRestoreDocument,
  useEmptyTrash,
  usePermanentlyDeleteDocument,
} from '../../hooks/use-documents'
import { getFileIcon, formatFileSize, formatDate } from '../../lib/utils'
import { TRASH_RETENTION_DAYS } from '../../types'

export default function DocumentsTrashPage() {
  const { toast } = useToast()
  const { data: trashData, isLoading } = useTrashDocuments()
  const restoreDocument = useRestoreDocument()
  const emptyTrash = useEmptyTrash()
  const permanentlyDelete = usePermanentlyDeleteDocument()

  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false)

  const handleRestore = async (id: string) => {
    try {
      await restoreDocument.mutateAsync(id)
      toast({ title: 'Document restored' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Restore failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handlePermanentDelete = async (id: string) => {
    try {
      await permanentlyDelete.mutateAsync(id)
      toast({ title: 'Document permanently deleted' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleEmptyTrash = async () => {
    try {
      await emptyTrash.mutateAsync()
      setEmptyTrashOpen(false)
      toast({ title: 'Trash emptied' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to empty trash',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Calculate days until auto-delete for each item
  const getExpiryDays = (deletedAt: string) => {
    const deleted = new Date(deletedAt)
    const expiry = new Date(deleted.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const now = new Date()
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    return Math.max(0, daysLeft)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Trash2 className="h-6 w-6" />
            Trash
          </h1>
          <p className="text-sm text-muted-foreground">
            Deleted files are automatically removed after {TRASH_RETENTION_DAYS} days.
          </p>
        </div>

        {trashData?.files && trashData.files.length > 0 && (
          <AlertDialog open={emptyTrashOpen} onOpenChange={setEmptyTrashOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Empty Trash
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Empty Trash</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {trashData.files.length} items in the trash.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleEmptyTrash}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {emptyTrash.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Empty Trash
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Info alert */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Files in trash will be automatically deleted after {TRASH_RETENTION_DAYS} days.
          You can restore files or permanently delete them before then.
        </AlertDescription>
      </Alert>

      {/* Trash content */}
      {!trashData?.files || trashData.files.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileBox className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Trash is empty</p>
          <p className="text-sm">Deleted documents will appear here</p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Deleted Files</CardTitle>
            <CardDescription>
              {trashData.count} {trashData.count === 1 ? 'file' : 'files'} in trash
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-24">Size</TableHead>
                    <TableHead className="w-32">Deleted</TableHead>
                    <TableHead className="w-32">Expires in</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trashData.files.map((doc) => {
                    const Icon = getFileIcon(doc.mime_type)
                    const expiryDays = getExpiryDays(doc.deleted_at!)

                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="truncate max-w-[300px]" title={doc.name}>
                              {doc.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFileSize(doc.size_bytes)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(doc.deleted_at!)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              expiryDays <= 1
                                ? 'text-destructive font-medium'
                                : 'text-muted-foreground'
                            }
                          >
                            {expiryDays === 0
                              ? 'Today'
                              : expiryDays === 1
                              ? '1 day'
                              : `${expiryDays} days`}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestore(doc.id)}
                              disabled={restoreDocument.isPending}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Restore
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Permanently Delete</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to permanently delete &quot;{doc.name}&quot;?
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handlePermanentDelete(doc.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete Forever
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
