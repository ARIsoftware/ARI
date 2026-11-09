'use client'

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Check, Copy, FileText, Pencil, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHAT_TYPE_CLASS, formatBytes, isImageMime } from '@/modules/chat/lib/utils'
import type { ChatAttachment, ChatMessage } from '@/modules/chat/types'
import { Markdown } from './markdown'
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from './ui/attachment'
import { Marker, MarkerContent, MarkerIcon } from './ui/marker'

const fileUrl = (a: ChatAttachment) =>
  `/api/storage/serve/${encodeURIComponent(a.bucket)}/${encodeURIComponent(a.filename)}`

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:h-3.5 [&_svg]:w-3.5"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className={cn('text-xs', CHAT_TYPE_CLASS)}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }
  return (
    <ActionButton label={copied ? 'Copied' : 'Copy'} onClick={copy}>
      {copied ? <Check className="text-accent" /> : <Copy />}
    </ActionButton>
  )
}

/** Sent attachments: images as thumbnails (click to preview), files as cards. */
export function MessageAttachments({ items, align }: { items: ChatAttachment[]; align: 'start' | 'end' }) {
  const [preview, setPreview] = useState<ChatAttachment | null>(null)
  if (items.length === 0) return null

  return (
    <>
      <AttachmentGroup className={cn(align === 'end' && 'justify-end')}>
        {items.map((a) =>
          isImageMime(a.mime) ? (
            // Replies' images were generated for the user — show them large.
            <Attachment
              key={a.upload_id}
              orientation="vertical"
              className={cn('p-1', align === 'start' ? 'w-72 sm:w-96' : 'w-28')}
              title={a.original_name}
            >
              <AttachmentMedia variant="image" className="rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin file */}
                <img src={fileUrl(a)} alt={a.original_name} loading="lazy" />
              </AttachmentMedia>
              <AttachmentTrigger onClick={() => setPreview(a)} aria-label={`Preview ${a.original_name}`} />
            </Attachment>
          ) : (
            <Attachment key={a.upload_id} size="sm" className="max-w-[260px]">
              <AttachmentMedia>
                <FileText />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{a.original_name}</AttachmentTitle>
                <AttachmentDescription>{formatBytes(a.size)}</AttachmentDescription>
              </AttachmentContent>
              <AttachmentTrigger onClick={() => window.open(fileUrl(a), '_blank', 'noopener')} aria-label={`Download ${a.original_name}`} />
            </Attachment>
          ),
        )}
      </AttachmentGroup>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null) }}>
        <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{preview?.original_name ?? 'Image preview'}</DialogTitle>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin file
            <img
              src={fileUrl(preview)}
              alt={preview.original_name}
              className="mx-auto max-h-[85vh] w-auto rounded-xl object-contain shadow-2xl"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

interface UserMessageProps {
  message: ChatMessage
  /** Whether editing will replace later messages (shown as a note). */
  hasLaterMessages: boolean
  isEditing: boolean
  canEdit: boolean
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSubmitEdit: (id: string, content: string) => void
}

export const UserMessage = memo(function UserMessage({
  message,
  hasLaterMessages,
  isEditing,
  canEdit,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
}: UserMessageProps) {
  return (
    <div className="group flex flex-col items-end gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <MessageAttachments items={message.attachments} align="end" />
      {isEditing ? (
        <EditBox
          initial={message.content}
          hasLaterMessages={hasLaterMessages}
          onCancel={onCancelEdit}
          onSubmit={(content) => onSubmitEdit(message.id, content)}
        />
      ) : (
        <>
          <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-3xl bg-secondary px-4 py-2.5 text-base leading-relaxed text-secondary-foreground">
            {message.content}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <span className="mr-1 text-[11px] text-muted-foreground">{timeOf(message.created_at)}</span>
            <CopyAction text={message.content} />
            {canEdit && (
              <ActionButton label="Edit" onClick={() => onStartEdit(message.id)}>
                <Pencil />
              </ActionButton>
            )}
          </div>
        </>
      )}
    </div>
  )
})

function EditBox({
  initial,
  hasLaterMessages,
  onCancel,
  onSubmit,
}: {
  initial: string
  hasLaterMessages: boolean
  onCancel: () => void
  onSubmit: (content: string) => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const trimmed = value.trim()
  const canSubmit = !!trimmed && trimmed !== initial.trim()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  return (
    <div className="w-full max-w-[85%] rounded-3xl border bg-card p-3 shadow-sm ring-2 ring-accent/10 animate-in fade-in">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          } else if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
            e.preventDefault()
            onSubmit(trimmed)
          }
        }}
        rows={1}
        maxLength={50000}
        aria-label="Edit message"
        className="max-h-[40vh] w-full resize-none overflow-y-auto bg-transparent px-1.5 py-1 text-base leading-relaxed outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {hasLaterMessages ? 'Sending replaces the replies after this message.' : 'Enter to send · Esc to cancel'}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-full bg-accent text-accent-foreground hover:opacity-90"
            disabled={!canSubmit}
            onClick={() => onSubmit(trimmed)}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

interface AssistantMessageProps {
  message: ChatMessage
  /** Latest reply — the only one that can be regenerated. */
  canRegenerate: boolean
  onRegenerate: () => void
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  canRegenerate,
  onRegenerate,
}: AssistantMessageProps) {
  return (
    <div className="group flex animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="min-w-0 flex-1 space-y-1">
        <Markdown content={message.content} />
        <MessageAttachments items={message.attachments} align="start" />
        {/* An image-only reply has no text to copy but can still be regenerated. */}
        <div
          className={cn(
            'flex items-center gap-0.5 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
            canRegenerate ? 'opacity-100' : 'opacity-0',
          )}
        >
          {message.content && <CopyAction text={message.content} />}
          {canRegenerate && (
            <ActionButton label="Regenerate" onClick={onRegenerate}>
              <RefreshCw />
            </ActionButton>
          )}
          <span className="ml-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {timeOf(message.created_at)}
          </span>
        </div>
      </div>
    </div>
  )
})

/** The reply being streamed (or just stopped). */
export function StreamingMessage({
  content,
  status,
  stopped,
}: {
  content: string
  /** A long step in progress (e.g. "Generating image…"); replaces the typing dot. */
  status?: string | null
  stopped: boolean
}) {
  const busyLine = !stopped && (status || (!content && 'Thinking…'))
  return (
    <div className="flex" aria-live="polite" aria-busy={!stopped}>
      <div className="min-w-0 flex-1 space-y-2">
        {content && <Markdown content={content} />}
        {busyLine && (
          <Marker className="py-1">
            <MarkerContent className="chat-shimmer font-medium">{busyLine}</MarkerContent>
          </Marker>
        )}
        {stopped ? (
          <Marker className="text-xs">
            <MarkerIcon>
              <span className="block h-2 w-2 rounded-[2px] bg-muted-foreground" />
            </MarkerIcon>
            <MarkerContent>Stopped</MarkerContent>
          </Marker>
        ) : (
          content && !status && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
