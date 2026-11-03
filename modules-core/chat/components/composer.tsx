'use client'

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { AlertCircle, ArrowUp, FileText, Loader2, Paperclip, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUploadChatFile } from '@/modules/chat/hooks/use-chat'
import { formatBytes, isImageMime } from '@/modules/chat/lib/utils'
import type { ChatAttachment, ChatUpload } from '@/modules/chat/types'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from './ui/attachment'

export interface ComposerHandle {
  /** Queue files for upload (used by the thread-wide drop zone). */
  addFiles: (files: File[]) => void
  focus: () => void
}

interface ComposerProps {
  conversationId: string | null
  onSend: (content: string, attachments: ChatAttachment[]) => void
  /** Stops the reply being streamed. */
  onStop?: () => void
  isStreaming: boolean
  /** ↑ in an empty composer — edit your last message. */
  onEditLast?: () => void
  /** Optional element rendered in the footer, left of the send button (e.g. the model picker). */
  accessory?: React.ReactNode
  /** Welcome screen: roomier box that starts taller. */
  size?: 'default' | 'large'
  autoFocus?: boolean
  ref?: Ref<ComposerHandle>
}

const MAX_MESSAGE_LENGTH = 50000
const MAX_ATTACHMENTS = 10
export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]

interface PendingFile {
  key: string
  name: string
  size: number
  mime: string
  /** Local object URL for image thumbnails (revoked on remove / send). */
  previewUrl: string | null
  status: 'uploading' | 'done' | 'error'
  attachment?: ChatAttachment
  error?: string
}

function uploadToAttachment(upload: ChatUpload): ChatAttachment {
  return {
    upload_id: upload.id,
    filename: upload.filename,
    original_name: upload.original_name,
    mime: upload.mime,
    size: upload.size,
    bucket: upload.bucket,
  }
}

// Browsers sometimes report an empty type for .md/.csv — fall back to the extension.
function effectiveMime(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'text/markdown'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'json') return 'application/json'
  if (ext === 'txt') return 'text/plain'
  return ''
}

export function Composer({
  conversationId,
  onSend,
  onStop,
  isStreaming,
  onEditLast,
  accessory,
  size = 'default',
  autoFocus,
  ref,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Latest attachments for callbacks that outlive a render (unmount cleanup, addFiles).
  const filesRef = useRef(files)
  useEffect(() => {
    filesRef.current = files
  }, [files])
  const uploadFile = useUploadChatFile()
  const { toast } = useToast()

  // Revoke any preview URLs still held when the composer unmounts.
  useEffect(() => () => filesRef.current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)), [])

  // Grow with the text, from one line up to the CSS max-height (then scroll).
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus, conversationId])

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return
    const accepted = incoming.filter((f) => ACCEPTED_MIME_TYPES.includes(effectiveMime(f)))
    const rejected = incoming.length - accepted.length
    if (rejected > 0) {
      toast({
        variant: 'destructive',
        title: rejected === 1 ? 'Unsupported file' : `${rejected} unsupported files`,
        description: 'Chat accepts images (JPEG, PNG, WebP, GIF) and text files (TXT, Markdown, CSV, JSON).',
      })
    }
    if (filesRef.current.length + accepted.length > MAX_ATTACHMENTS) {
      toast({
        variant: 'destructive',
        title: 'Too many attachments',
        description: `You can attach up to ${MAX_ATTACHMENTS} files per message.`,
      })
      return
    }

    for (const file of accepted) {
      const mime = effectiveMime(file)
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const pending: PendingFile = {
        key,
        name: file.name || 'pasted-image.png',
        size: file.size,
        mime,
        previewUrl: isImageMime(mime) ? URL.createObjectURL(file) : null,
        status: 'uploading',
      }
      setFiles((prev) => [...prev, pending])
      uploadFile
        .mutateAsync({ file, conversationId })
        .then((upload) => {
          setFiles((prev) =>
            prev.map((f) => (f.key === key ? { ...f, status: 'done', attachment: uploadToAttachment(upload) } : f)),
          )
        })
        .catch((err) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.key === key
                ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
                : f,
            ),
          )
        })
    }
    textareaRef.current?.focus()
  }

  useImperativeHandle(ref, () => ({ addFiles, focus: () => textareaRef.current?.focus() }))

  const removeFile = (key: string) => {
    setFiles((prev) => {
      const gone = prev.find((f) => f.key === key)
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter((f) => f.key !== key)
    })
  }

  const isUploading = files.some((f) => f.status === 'uploading')
  const hasFailed = files.some((f) => f.status === 'error')
  const trimmed = text.trim()
  const canSend = !!trimmed && !isStreaming && !isUploading && !hasFailed

  const handleSend = () => {
    if (!trimmed || isStreaming) return
    // Don't send while a file is still uploading — otherwise it would resolve
    // into the just-cleared attachment list and ride along on the next message.
    if (isUploading) {
      toast({ title: 'Upload in progress', description: 'Wait for the attachment to finish uploading before sending.' })
      return
    }
    if (hasFailed) {
      toast({ variant: 'destructive', title: 'An attachment failed to upload', description: 'Remove it (or re-attach it) before sending.' })
      return
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      toast({
        variant: 'destructive',
        title: 'Message is too long',
        description: `Maximum length is ${MAX_MESSAGE_LENGTH} characters.`,
      })
      return
    }
    onSend(trimmed, files.flatMap((f) => (f.attachment ? [f.attachment] : [])))
    files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
    setText('')
    setFiles([])
  }

  const charCount = text.length
  const nearLimit = charCount > MAX_MESSAGE_LENGTH * 0.9

  return (
    <div className="w-full">
      <div
        className={cn(
          'flex flex-col gap-2 rounded-[26px] border border-border/60 bg-card px-4 pb-3 pt-3 shadow-[0_4px_4px_0_rgba(0,0,0,0.04),0_0_1px_0_rgba(0,0,0,0.25),0_8px_80px_0_rgba(0,0,0,0.04)]',
          size === 'large' && 'px-5 pt-4',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED_MIME_TYPES.join(',')}
          onChange={(e) => {
            if (e.target.files) {
              addFiles(Array.from(e.target.files))
              e.target.value = ''
            }
          }}
        />

        {files.length > 0 && (
          <AttachmentGroup className="px-0.5 pt-0.5">
            {files.map((f) => {
              const state = f.status === 'done' ? 'done' : f.status === 'error' ? 'error' : 'uploading'
              if (f.previewUrl) {
                return (
                  <Attachment
                    key={f.key}
                    state={state}
                    orientation="vertical"
                    className="w-16 p-1 animate-in fade-in zoom-in-95"
                    title={f.error ?? f.name}
                  >
                    <AttachmentMedia variant="image" className="rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                      <img src={f.previewUrl} alt={f.name} />
                      {f.status === 'uploading' && (
                        <span className="absolute inset-0 flex items-center justify-center bg-background/40">
                          <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                        </span>
                      )}
                      {f.status === 'error' && (
                        <span className="absolute inset-0 flex items-center justify-center bg-destructive/20">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        </span>
                      )}
                    </AttachmentMedia>
                    <AttachmentActions>
                      <AttachmentAction onClick={() => removeFile(f.key)} aria-label={`Remove ${f.name}`}>
                        <X />
                      </AttachmentAction>
                    </AttachmentActions>
                  </Attachment>
                )
              }
              return (
                <Attachment key={f.key} state={state} size="sm" className="max-w-[240px] animate-in fade-in zoom-in-95">
                  <AttachmentMedia>
                    {f.status === 'uploading' ? (
                      <Loader2 className="animate-spin" />
                    ) : f.status === 'error' ? (
                      <AlertCircle />
                    ) : (
                      <FileText />
                    )}
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{f.name}</AttachmentTitle>
                    <AttachmentDescription>
                      {f.status === 'error' ? f.error : f.status === 'uploading' ? 'Uploading…' : formatBytes(f.size)}
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    <AttachmentAction onClick={() => removeFile(f.key)} aria-label={`Remove ${f.name}`}>
                      <X />
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              )
            })}
          </AttachmentGroup>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            } else if (e.key === 'ArrowUp' && !text && onEditLast) {
              e.preventDefault()
              onEditLast()
            }
          }}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files)
            if (pasted.length > 0) {
              e.preventDefault()
              addFiles(pasted)
            }
          }}
          placeholder="Message the AI…"
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-label="Message"
          className={cn(
            'max-h-[40vh] w-full resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-1 text-base leading-relaxed outline-none placeholder:text-muted-foreground',
            size === 'large' ? 'min-h-[4.5rem] text-[15px]' : 'min-h-[2rem]',
          )}
        />

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_ATTACHMENTS}
            aria-label="Attach files"
            title="Attach files (or paste / drop them)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <div className="flex min-w-0 items-center gap-2">
            {accessory}
            {nearLimit && (
              <span className={cn('text-[10px] text-muted-foreground', charCount >= MAX_MESSAGE_LENGTH && 'text-destructive')}>
                {charCount.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
              </span>
            )}
            {isStreaming ? (
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full bg-foreground text-background transition-all hover:bg-foreground/85"
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop generating (Esc)"
              >
                <Square className="h-3 w-3 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                className={cn(
                  'h-8 w-8 shrink-0 rounded-full transition-all',
                  canSend
                    ? 'bg-accent text-accent-foreground hover:opacity-90'
                    : 'bg-muted text-muted-foreground hover:bg-muted',
                )}
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send message"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
