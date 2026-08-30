'use client'

/**
 * The editable clock face on every card.
 *
 * While focused the field shows a local draft rather than the canonical time —
 * otherwise the live minute tick would rewrite the text under the user's
 * cursor mid-edit. Committing hands the parsed wall-clock time back to the page,
 * which re-anchors the whole board.
 */

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { parseTimeInput } from '../lib/time'

const PARSE_HINT = 'Try 3pm, 15:00, or 9:30 am'

interface ClockInputProps {
  /** Canonical rendering of the current instant in this card's zone. */
  value: string
  /** The wall-clock time `value` represents, used to detect a no-op edit. */
  current: { hour: number; minute: number }
  onCommit: (time: { hour: number; minute: number }) => void
  label: string
  emphasis?: boolean
  /** Used to tie the inline error to the field for screen readers. */
  id: string
}

export function ClockInput({
  value,
  current,
  onCommit,
  label,
  emphasis = false,
  id,
}: ClockInputProps) {
  /** null means "show the canonical time" — the field is not being edited. */
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /**
   * blur() dispatches synchronously, so a handler that calls setDraft(null)
   * and then blur() would still hit onBlur with the old draft in scope and
   * commit the very text it just discarded. This flag tells onBlur to stand
   * down for a blur the component itself triggered.
   */
  const selfBlurRef = useRef(false)

  const errorId = `${id}-error`

  const commit = (): boolean => {
    if (draft === null) return true

    const parsed = parseTimeInput(draft)
    if (!parsed) {
      setError(PARSE_HINT)
      return false
    }

    setError(null)
    setDraft(null)

    // Focusing a clock seeds the draft, so a blur with no keystrokes would
    // otherwise re-commit the time that was showing at focus — silently
    // pinning the board and rewinding every clock to that minute.
    if (parsed.hour !== current.hour || parsed.minute !== current.minute) {
      onCommit(parsed)
    }

    return true
  }

  const discard = () => {
    setDraft(null)
    setError(null)
  }

  const blurWithoutCommitting = () => {
    selfBlurRef.current = true
    inputRef.current?.blur()
  }

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        id={id}
        aria-label={label}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        inputMode="text"
        maxLength={12}
        value={draft ?? value}
        onFocus={(event) => {
          // Freeze the live tick, then select so a retype replaces the time.
          setDraft(value)
          setError(null)
          event.currentTarget.select()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          if (error) setError(null)
        }}
        onBlur={() => {
          if (selfBlurRef.current) {
            selfBlurRef.current = false
            return
          }
          // Unparseable text keeps the draft and the error, the way any form
          // field does — Esc or a retype clears it.
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            // Keep focus on a bad value so it can be corrected in place.
            if (commit()) blurWithoutCommitting()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            discard()
            blurWithoutCommitting()
          }
        }}
        className={cn(
          'h-auto py-4 text-center font-mono text-5xl tabular-nums tracking-tight',
          emphasis ? 'bg-background' : 'bg-background/60',
          error && 'border-destructive focus-visible:ring-destructive'
        )}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
