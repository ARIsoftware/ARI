'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHealthStatus, useUploadHealthData } from '@/modules/health-data/hooks/use-health-data'
import { useUploadStore } from '@/modules/health-data/hooks/upload-store'
import { LoadingState } from './loading-state'
import { UploadScreen } from './upload-screen'
import { ProcessingScreen } from './processing-screen'
import { RetentionBanner } from './retention-banner'

/** Upload occupies the first slice of the unified progress bar; the
 * server-side parse fills the rest. */
const UPLOAD_SHARE = 30

/** Shown when the status query itself fails — inviting a re-upload of a
 * multi-hundred-MB export would be the wrong call, so offer a retry. */
function StatusErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">Couldn&apos;t check your health data status</p>
        <p className="text-sm text-muted-foreground">
          Your imported data may still be there — retry before uploading again.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  )
}

/**
 * Shared wrapper for every Health Data page: decides between the upload
 * screen (no data / failed import), the single unified progress card
 * (upload + parse share one bar), and the actual page content topped by
 * the retention banner.
 *
 * Upload progress lives in a module-scoped store (see hooks/upload-store),
 * so navigating between health pages mid-upload keeps showing the
 * progress card instead of a fresh upload screen — a second upload here
 * would silently kill the in-flight server session.
 */
export function HealthGate({ children }: { children: React.ReactNode }) {
  const { data: importStatus, isLoading, isError, refetch } = useHealthStatus()
  const upload = useUploadHealthData()
  const { status: uploadStatus, percent: uploadPercent, error: uploadError } = useUploadStore()

  const startUpload = (file: File) => {
    // No-op while an upload is active anywhere — starting a second one
    // would delete the first upload's server session.
    if (uploadStatus === 'uploading') return
    upload.mutate({ file })
  }

  if (isLoading) {
    return <LoadingState />
  }

  if (uploadStatus === 'uploading') {
    return (
      <ProcessingScreen
        percent={Math.round((uploadPercent / 100) * UPLOAD_SHARE)}
        phase="Uploading your export"
      />
    )
  }

  if (isError) {
    return <StatusErrorState onRetry={() => refetch()} />
  }

  // A discovered processing/completed import always wins over a stale
  // upload error — a dropped `finish` response still starts the parse
  // server-side, so the "failed" upload may in fact be running.
  if (importStatus?.status === 'processing') {
    return (
      <ProcessingScreen
        percent={UPLOAD_SHARE + Math.round((importStatus.progress / 100) * (100 - UPLOAD_SHARE))}
        phase={importStatus.phase ?? 'Working…'}
        recordsParsed={importStatus.records_parsed}
      />
    )
  }

  if (!importStatus || importStatus.status === 'failed') {
    return (
      <UploadScreen
        onUpload={startUpload}
        uploadError={uploadError}
        importError={importStatus?.error ?? null}
      />
    )
  }

  return (
    <div className="space-y-4">
      <RetentionBanner expiresAt={importStatus.expires_at} />
      {children}
    </div>
  )
}
