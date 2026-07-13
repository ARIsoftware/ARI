'use client'

import { useCallback, useRef, useState } from 'react'
import { HeartPulse, Upload, Clock, Smartphone, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024

interface UploadScreenProps {
  onUpload: (file: File) => void
  /** Error from this session's upload attempt (shown with priority) */
  uploadError: string | null
  /** Stored error from a previous failed import */
  importError: string | null
}

/**
 * Empty state: how to export from the iPhone Health app, the 1-hour
 * retention promise, and a drag-and-drop upload zone. Once a valid file
 * is picked, the HealthGate switches to the unified progress card.
 */
export function UploadScreen({ onUpload, uploadError, importError }: UploadScreenProps) {
  const { toast } = useToast()
  const [dragActive, setDragActive] = useState(false)
  const [hasAttempted, setHasAttempted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Show this session's upload error inline; the stored import error from a
  // previous session is hidden as soon as the user retries.
  let displayError: string | null = null
  if (uploadError) {
    displayError = uploadError
  } else if (!hasAttempted && importError) {
    displayError = importError
  }

  const startUpload = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        toast({
          variant: 'destructive',
          title: 'Wrong file type',
          description: 'Please upload the .zip file exported by the Health app.',
        })
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: 'Health export zips up to 1GB are supported.',
        })
        return
      }
      setHasAttempted(true)
      onUpload(file)
    },
    [toast, onUpload]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragActive(false)
      const file = event.dataTransfer.files?.[0]
      if (file) startUpload(file)
    },
    [startUpload]
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {displayError && (
        <Alert variant="destructive" className="rounded-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{uploadError ? 'Upload failed' : 'The last import failed'}</AlertTitle>
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}

      <Card className="rounded-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--chart-2)/0.12)]">
            <HeartPulse className="h-8 w-8 text-[hsl(var(--chart-2))]" />
          </div>
          <CardTitle className="text-2xl">Explore Your Apple Health Data</CardTitle>
          <CardDescription>
            Upload the export zip from your iPhone to browse your activity, heart, sleep, and
            workout history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-3 rounded-sm border border-border bg-muted/40 p-4">
            <Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="mb-1 font-medium">How to export</p>
              <p className="text-muted-foreground">
                On your iPhone, open <span className="font-medium text-foreground">Health</span>,
                tap your profile picture, then{' '}
                <span className="font-medium text-foreground">Export All Health Data</span>. Send
                the zip to this device and upload it here.
              </p>
            </div>
          </div>

          <Alert className="rounded-sm border-amber-500/40 bg-amber-500/10 [&>svg]:text-amber-500">
            <Clock className="h-4 w-4" />
            <AlertTitle>Private by design</AlertTitle>
            <AlertDescription>
              Data is parsed locally by your ARI server into daily summaries, never shared, and
              wiped after an hour — or instantly with the delete button.
            </AlertDescription>
          </Alert>

          <div
            role="button"
            tabIndex={0}
            aria-label="Upload Apple Health export zip"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed border-border p-10 text-center transition-colors',
              dragActive && 'border-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.05)]'
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Drop your health export zip here</p>
              <p className="text-sm text-muted-foreground">or click to choose a file (up to 1GB)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) startUpload(file)
                e.target.value = ''
              }}
            />
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
