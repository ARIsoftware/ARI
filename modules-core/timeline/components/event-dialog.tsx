'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Trash2 } from 'lucide-react'
import {
  useCreateTimelineEvent,
  useUpdateTimelineEvent,
  useDeleteTimelineEvent,
} from '../hooks/use-timeline'
import {
  TIMELINE_START,
  TIMELINE_END,
  TIMELINE_RANGE_LABEL,
  EVENT_NAME_MAX,
} from '../lib/timeline-range'
import type { TimelineEvent } from '../types'

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create mode, otherwise the event being edited */
  event: TimelineEvent | null
}

type FieldErrors = { name?: string; eventDate?: string }

// Matches the chart's default blue (Tailwind blue-600) for the picker swatch.
const DEFAULT_LINE_COLOR = '#2563eb'

export function EventDialog({ open, onOpenChange, event }: EventDialogProps) {
  const { toast } = useToast()
  const createEvent = useCreateTimelineEvent()
  const updateEvent = useUpdateTimelineEvent()
  const deleteEvent = useDeleteTimelineEvent()

  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  // '' = default blue; otherwise a #RRGGBB value
  const [color, setColor] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)

  const isEdit = event !== null
  const isPending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending

  // Reset the form on each open transition (render-time state adjustment,
  // per https://react.dev/learn/you-might-not-need-an-effect)
  if (open && !wasOpen) {
    setWasOpen(true)
    setName(event?.name ?? '')
    setEventDate(event?.event_date ?? '')
    setColor(event?.color ?? '')
    setErrors({})
    setConfirmingDelete(false)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  const errorToast = (title: string) => (err: Error) =>
    toast({ variant: 'destructive', title, description: err.message })

  // Mirrors the server Zod schema in lib/validation.ts (safeText + range) for
  // inline feedback.
  const validate = (): FieldErrors => {
    const errs: FieldErrors = {}
    if (!name.trim()) {
      errs.name = 'Event name is required'
    } else if (name.trim().length > EVENT_NAME_MAX) {
      errs.name = `Event name must be ${EVENT_NAME_MAX} characters or fewer`
    } else if (/[<>\x00-\x1F\x7F]/.test(name)) {
      errs.name = 'Event name cannot contain < > or control characters'
    }
    if (!eventDate) {
      errs.eventDate = 'Date is required'
    } else if (eventDate < TIMELINE_START || eventDate > TIMELINE_END) {
      errs.eventDate = `Date must be within the timeline range (${TIMELINE_RANGE_LABEL})`
    }
    return errs
  }

  const handleSave = () => {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const payload = { name: name.trim(), event_date: eventDate, color: color || null }
    if (isEdit) {
      updateEvent.mutate(
        { id: event.id, ...payload },
        {
          onSuccess: () => onOpenChange(false),
          onError: errorToast('Failed to update event'),
        }
      )
    } else {
      createEvent.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: errorToast('Failed to create event'),
      })
    }
  }

  const handleDelete = () => {
    if (!event) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    deleteEvent.mutate(event.id, {
      onSuccess: () => onOpenChange(false),
      onError: errorToast('Failed to delete event'),
    })
  }

  const updateName = (value: string) => {
    setName(value)
    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
  }

  const updateDate = (value: string) => {
    setEventDate(value)
    if (errors.eventDate) setErrors((prev) => ({ ...prev, eventDate: undefined }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Event' : 'Add Event'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update or remove this event.'
              : `Add an event to the timeline (${TIMELINE_RANGE_LABEL}).`}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="event-name">Event name</Label>
            <Input
              id="event-name"
              value={name}
              onChange={(e) => updateName(e.target.value)}
              placeholder="e.g. HYROX Event"
              maxLength={EVENT_NAME_MAX}
              disabled={isPending}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'event-name-error' : undefined}
              className={cn(errors.name && 'border-destructive focus-visible:ring-destructive')}
            />
            {errors.name && (
              <p id="event-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-date">Date</Label>
            <Input
              id="event-date"
              type="date"
              value={eventDate}
              onChange={(e) => updateDate(e.target.value)}
              min={TIMELINE_START}
              max={TIMELINE_END}
              disabled={isPending}
              aria-invalid={!!errors.eventDate}
              aria-describedby={errors.eventDate ? 'event-date-error' : undefined}
              className={cn(errors.eventDate && 'border-destructive focus-visible:ring-destructive')}
            />
            {errors.eventDate && (
              <p id="event-date-error" className="text-xs text-destructive">
                {errors.eventDate}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-color">Line color</Label>
            <div className="flex items-center gap-2">
              <input
                id="event-color"
                type="color"
                value={color || DEFAULT_LINE_COLOR}
                onChange={(e) => setColor(e.target.value)}
                disabled={isPending}
                className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              {color && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setColor('')} disabled={isPending}>
                  Reset to default
                </Button>
              )}
              {!color && <span className="text-xs text-muted-foreground">Default blue</span>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant={confirmingDelete ? 'destructive' : 'ghost'}
                onClick={handleDelete}
                disabled={isPending}
                className={cn(!confirmingDelete && 'text-destructive hover:text-destructive')}
              >
                {deleteEvent.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {confirmingDelete ? 'Confirm delete?' : 'Delete'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {(createEvent.isPending || updateEvent.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEdit ? 'Save' : 'Add Event'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
