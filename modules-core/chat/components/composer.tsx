'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { ArrowUp, Loader2, Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUploadChatFile } from '@/modules/chat/hooks/use-chat'
import { formatBytes } from '@/modules/chat/lib/utils'
import type { ChatAttachment, ChatUpload } from '@/modules/chat/types'

interface ComposerProps {
  conversationId: string | null
  onSend: (content: string, attachments: ChatAttachment[]) => void
  isSending: boolean
}

const MAX_MESSAGE_LENGTH = 50000
const MAX_ATTACHMENTS = 10

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

export function Composer({ conversationId, onSend, isSending }: ComposerProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadFile = useUploadChatFile()
  const { toast } = useToast()

  const handleFiles = async (files: FileList) => {
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast({
        variant: 'destructive',
        title: 'Too many attachments',
        description: `You can attach up to ${MAX_ATTACHMENTS} files per message.`,
      })
      return
    }

    for (const file of Array.from(files)) {
      try {
        const upload = await uploadFile.mutateAsync({ file, conversationId })
        setAttachments((prev) => [...prev, uploadToAttachment(upload)])
      } catch (err) {
        toast({
          variant: 'destructive',
          title: `Failed to upload ${file.name}`,
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      }
    }
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    // Don't send while a file is still uploading — otherwise it would resolve
    // into the just-cleared attachment list and ride along on the next message.
    if (uploadFile.isPending) {
      toast({
        title: 'Upload in progress',
        description: 'Wait for the attachment to finish uploading before sending.',
      })
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
    onSend(trimmed, attachments)
    setText('')
    setAttachments([])
  }

  const removeAttachment = (uploadId: string) => {
    setAttachments((prev) => prev.filter((a) => a.upload_id !== uploadId))
  }

  const charCount = text.length
  const nearLimit = charCount > MAX_MESSAGE_LENGTH * 0.9
  const canSend = !!text.trim() && !isSending && !uploadFile.isPending

  return (
    <div className="w-full">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {attachments.map((a) => (
            <div
              key={a.upload_id}
              className="flex items-center gap-2 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-xs shadow-sm animate-in fade-in zoom-in-95"
            >
              <Paperclip className="h-3 w-3 text-accent" />
              <span className="max-w-[200px] truncate font-medium">{a.original_name}</span>
              <span className="text-muted-foreground">{formatBytes(a.size)}</span>
              <button
                onClick={() => removeAttachment(a.upload_id)}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                aria-label={`Remove ${a.original_name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-[26px] border bg-card px-5 py-4 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.18)] transition-all focus-within:border-accent/40 focus-within:shadow-[0_14px_48px_-8px_rgba(0,0,0,0.26)] focus-within:ring-2 focus-within:ring-accent/10">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/jpeg,image/png,image/webp,image/gif,text/plain,text/markdown,text/csv,application/json"
          onChange={(e) => {
            if (e.target.files) {
              handleFiles(e.target.files)
              e.target.value = ''
            }
          }}
        />

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Message the AI…"
          rows={7}
          maxLength={MAX_MESSAGE_LENGTH}
          className="min-h-0 flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadFile.isPending}
            aria-label="Attach file"
          >
            {uploadFile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>

          <div className="flex items-center gap-2">
            {nearLimit && (
              <span className={cn('text-[10px] text-muted-foreground', charCount >= MAX_MESSAGE_LENGTH && 'text-destructive')}>
                {charCount.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
              </span>
            )}
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
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
