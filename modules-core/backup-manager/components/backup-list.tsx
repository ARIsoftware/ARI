'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Download, Trash2, RotateCcw, Loader2 } from 'lucide-react'
import { useBackupList, useDeleteBackup, downloadBackup, restoreBackup } from '../hooks/use-backup-manager'
import { formatBytes, getTimeUntilExpiration } from '../lib/retention'
import type { BackupMetadata } from '../types'

export function BackupList() {
  const { toast } = useToast()
  const { data: backups = [], isLoading, error } = useBackupList()
  const deleteBackup = useDeleteBackup()

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState<string | null>(null)
  const [isRestoring, setIsRestoring] = useState<string | null>(null)

  const handleDownload = async (backup: BackupMetadata) => {
    setIsDownloading(backup.id)
    try {
      await downloadBackup(backup.id)
      toast({
        title: 'Download started',
        description: `Downloading ${backup.filename}`,
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsDownloading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    try {
      await deleteBackup.mutateAsync(deleteId)
      toast({
        title: 'Backup deleted',
        description: 'The backup has been removed',
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setDeleteId(null)
    }
  }

  const handleRestore = async () => {
    if (!restoreId) return

    setIsRestoring(restoreId)
    try {
      const result = await restoreBackup(restoreId)
      toast({
        title: 'Restore complete',
        description: result.message,
      })
      // Reload the page after restore
      setTimeout(() => window.location.reload(), 2000)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Restore failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsRestoring(null)
      setRestoreId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load backups. Please try again.
      </div>
    )
  }

  if (backups.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No backups yet. Create your first backup using the button above.
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Tables</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {backups.map((backup) => (
            <TableRow key={backup.id}>
              <TableCell>
                {new Date(backup.created_at).toLocaleString()}
              </TableCell>
              <TableCell>
                {backup.size_bytes ? formatBytes(backup.size_bytes) : '-'}
              </TableCell>
              <TableCell>{backup.table_count ?? '-'}</TableCell>
              <TableCell>
                {backup.row_count?.toLocaleString() ?? '-'}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {backup.storage_provider}
                </Badge>
              </TableCell>
              <TableCell>
                {getTimeUntilExpiration(backup.expires_at)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(backup)}
                    disabled={isDownloading === backup.id}
                  >
                    {isDownloading === backup.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRestoreId(backup.id)}
                    disabled={isRestoring === backup.id}
                  >
                    {isRestoring === backup.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(backup.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this backup? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreId} onOpenChange={() => setRestoreId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore this backup? This will replace all current data
              with the data from this backup. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
