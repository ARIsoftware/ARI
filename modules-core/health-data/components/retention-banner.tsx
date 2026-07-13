'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clock, Trash2, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { usePurgeHealthData } from '@/modules/health-data/hooks/use-health-data'
import { fmtCountdown } from '@/modules/health-data/lib/format'

/**
 * The always-visible privacy notice: data is stored for 1 hour only,
 * with a live countdown and an immediate-delete button.
 */
export function RetentionBanner({ expiresAt }: { expiresAt: string }) {
  const queryClient = useQueryClient()
  const purge = usePurgeHealthData()
  const { toast } = useToast()
  const [remainingMs, setRemainingMs] = useState(() => new Date(expiresAt).getTime() - Date.now())

  useEffect(() => {
    // Minute-level countdown — a 10s tick keeps the display fresh and
    // catches expiry promptly without per-second re-renders.
    const interval = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setRemainingMs(ms)
      if (ms <= 0) {
        // Expired: refetch status once so the server purges and the UI resets
        clearInterval(interval)
        queryClient.invalidateQueries({ queryKey: ['health-data-status'] })
      }
    }, 10_000)
    return () => clearInterval(interval)
  }, [expiresAt, queryClient])

  const handleDelete = () => {
    purge.mutate(undefined, {
      onError: (err) => {
        toast({
          variant: 'destructive',
          title: 'Failed to delete health data',
          description: err.message,
        })
      },
    })
  }

  return (
    <Alert className="rounded-sm border-amber-500/40 bg-amber-500/10 [&>svg]:text-amber-500">
      <Clock className="h-4 w-4" />
      <AlertTitle>Your health data is stored for 1 hour only</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          Everything you uploaded is automatically and permanently deleted in{' '}
          <span className="font-semibold tabular-nums">{fmtCountdown(remainingMs)}</span>. The
          original zip file was already deleted after processing.
        </span>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5" disabled={purge.isPending}>
              {purge.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete now
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all health data now?</AlertDialogTitle>
              <AlertDialogDescription>
                This immediately and permanently removes everything parsed from your Apple Health
                export. You can always upload the zip again later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete now</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AlertDescription>
    </Alert>
  )
}
