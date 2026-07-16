'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QUESTION_MAX as MAX_MESSAGE_LENGTH } from '@/modules/board-of-advisors/lib/limits'

interface ComposerProps {
  onSend: (content: string) => void
  isSending: boolean
  advisorCount: number
  /** Stops the running roundtable; shown in place of Send while streaming. */
  onStop?: () => void
}

export function Composer({ onSend, isSending, advisorCount, onStop }: ComposerProps) {
  const [text, setText] = useState('')

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    onSend(trimmed)
    setText('')
  }

  const charCount = text.length
  const nearLimit = charCount > MAX_MESSAGE_LENGTH * 0.9
  const canSend = !!text.trim() && !isSending

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1.5 rounded-[26px] border bg-card px-5 py-4 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.18)] transition-all focus-within:border-accent/40 focus-within:shadow-[0_14px_48px_-8px_rgba(0,0,0,0.26)] focus-within:ring-2 focus-within:ring-accent/10">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // IME composition: Enter confirms the candidate, not the send.
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Ask your board a question…"
          rows={7}
          maxLength={MAX_MESSAGE_LENGTH}
          className="min-h-0 flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between">
          <span className="px-1.5 text-[11px] text-muted-foreground">
            {advisorCount > 0
              ? `${advisorCount} advisor${advisorCount !== 1 ? 's' : ''} will answer in turn`
              : 'Your board is empty — add advisors in Settings'}
          </span>

          <div className="flex items-center gap-2">
            {nearLimit && (
              <span className={cn('text-[10px] text-muted-foreground', charCount >= MAX_MESSAGE_LENGTH && 'text-destructive')}>
                {charCount.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
              </span>
            )}
            {isSending && onStop ? (
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full bg-foreground text-background transition-all hover:opacity-90"
                onClick={onStop}
                aria-label="Stop the roundtable"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
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
                aria-label="Ask the board"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
