/**
 * File Upload Example Component
 *
 * Demonstrates how to use the ARI File Storage System in a module.
 * This is a reference example — not wired into the module template's main page.
 *
 * To use in your module:
 * 1. Copy this component into your module's components/ directory
 * 2. Import the file storage hooks from your module's hooks file
 * 3. Customize the bucket name, allowed types, and UI to your needs
 */

'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Trash2, FileIcon, Loader2, ImageIcon } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useUploadFile, useListFiles, useDeleteFile } from '../hooks/use-module-template'

const BUCKET = 'module-template'
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_MB = 5

export function FileUploadExample() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const { data: files = [], isLoading } = useListFiles(BUCKET)
  const uploadFile = useUploadFile(BUCKET)
  const deleteFile = useDeleteFile(BUCKET)

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const file = fileList[0]

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: `Accepted: ${ALLOWED_TYPES.join(', ')}` })
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: `Maximum size is ${MAX_SIZE_MB}MB` })
      return
    }

    uploadFile.mutate(file, {
      onSuccess: () => toast({ title: 'File uploaded' }),
      onError: (err) => toast({ variant: 'destructive', title: 'Upload failed', description: err.message }),
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">File Upload Example</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {uploadFile.isPending ? (
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
          ) : (
            <>
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Drop a file here or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPEG, PNG, WebP up to {MAX_SIZE_MB}MB
              </p>
            </>
          )}
        </div>

        {/* File list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length > 0 ? (
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.name} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  {file.contentType.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteFile.mutate(file.name, {
                    onError: (err) => toast({ variant: 'destructive', title: 'Delete failed', description: err.message }),
                  })}
                  disabled={deleteFile.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default FileUploadExample
