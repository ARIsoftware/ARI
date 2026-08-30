'use client'

/**
 * One clock on the board — either the viewer's own card (`isMe`) or a saved
 * person. Every card renders the same shared instant in its own zone, so
 * committing a time here re-anchors all of them.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ClockInput } from './clock-input'
import { TimezoneCombobox } from './timezone-combobox'
import {
  formatDateLabel,
  formatDayDelta,
  formatOffsetLabel,
  formatTime12,
  getZonedParts,
  zoneCityLabel,
  zoneOffsetFromParts,
  type ZonedParts,
} from '../lib/time'

interface PersonCardProps {
  name: string
  timezone: string
  instant: number
  /** The viewer's own zoned date, used for the +1 day / -1 day badge. */
  reference: Pick<ZonedParts, 'year' | 'month' | 'day'>
  isMe?: boolean
  onTimeCommit: (time: { hour: number; minute: number }) => void
  onTimezoneChange: (timezone: string) => void
  onRemove?: () => void
}

export function PersonCard({
  name,
  timezone,
  instant,
  reference,
  isMe = false,
  onTimeCommit,
  onTimezoneChange,
  onRemove,
}: PersonCardProps) {
  const [editingZone, setEditingZone] = useState(false)
  const zoneButtonRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(false)
  const clockId = `${useId()}-clock`

  // Radix hands focus back to the popover trigger on close, but that trigger
  // unmounts in the same commit — without this, focus would land on <body>.
  useEffect(() => {
    if (editingZone || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    zoneButtonRef.current?.focus()
  }, [editingZone])

  const parts = getZonedParts(timezone, instant)
  // Reuses `parts` instead of re-formatting the instant — this runs once per
  // card per minute tick while the board is live.
  const offsetLabel = formatOffsetLabel(zoneOffsetFromParts(parts, instant))
  const dayDeltaLabel = formatDayDelta(parts, reference)

  return (
    <div
      className={cn(
        'flex w-80 flex-col gap-4 rounded-2xl border p-5 transition-colors',
        isMe ? 'border-primary bg-card shadow-sm' : 'border-border bg-muted/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xl font-semibold text-foreground">{name}</span>
          {isMe && (
            <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">
              Me
            </span>
          )}
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${name}`}
            onClick={onRemove}
            className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {editingZone ? (
        <TimezoneCombobox
          defaultOpen
          value={timezone}
          instant={instant}
          aria-label={`Time zone for ${name}`}
          onChange={onTimezoneChange}
          onClose={() => {
            restoreFocusRef.current = true
            setEditingZone(false)
          }}
        />
      ) : (
        <button
          ref={zoneButtonRef}
          type="button"
          onClick={() => setEditingZone(true)}
          title="Change time zone"
          className="-mt-2 truncate text-left font-mono text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {zoneCityLabel(timezone)} · {offsetLabel}
        </button>
      )}

      <ClockInput
        id={clockId}
        value={formatTime12(parts)}
        current={parts}
        onCommit={onTimeCommit}
        label={`Time for ${name}`}
        emphasis={isMe}
      />

      <div className="flex items-center justify-between gap-2 font-mono text-sm text-muted-foreground">
        <span className="truncate">{formatDateLabel(parts)}</span>
        {dayDeltaLabel && (
          <span className="shrink-0 rounded bg-secondary px-2 py-0.5 text-secondary-foreground">
            {dayDeltaLabel}
          </span>
        )}
      </div>
    </div>
  )
}
