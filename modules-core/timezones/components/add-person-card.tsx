'use client'

/**
 * The dashed "add person" tile that sits at the end of the board.
 *
 * Validation mirrors the server Zod schema in lib/validation.ts and shows
 * inline errors; the form only clears once the server confirms the insert, so a
 * rejected add never loses what was typed.
 */

import { useId, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { firstZodError } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TimezoneCombobox } from './timezone-combobox'
import { NAME_MAX, personNameSchema } from '../lib/validation'

interface AddPersonCardProps {
  instant: number
  isSubmitting: boolean
  onAdd: (person: { name: string; timezone: string }, onSuccess: () => void) => void
}

type FieldErrors = { name?: string; timezone?: string }

export function AddPersonCard({ instant, isSubmitting, onAdd }: AddPersonCardProps) {
  const fieldId = useId()
  const nameErrorId = `${fieldId}-name-error`
  const zoneErrorId = `${fieldId}-zone-error`

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})

  // Validating against the server's own schema keeps the two from drifting —
  // a hand-written copy silently misses rules like the control-char check.
  const validate = (): FieldErrors => {
    const next: FieldErrors = {}

    const nameError = firstZodError(personNameSchema, name)
    if (nameError) next.name = nameError
    if (!timezone) next.timezone = 'Pick a time zone'

    return next
  }

  const handleAdd = () => {
    const fieldErrors = validate()
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    onAdd({ name: name.trim(), timezone: timezone as string }, () => {
      setName('')
      setTimezone(null)
      setErrors({})
    })
  }

  return (
    <div className="flex w-80 flex-col gap-4 rounded-2xl border border-dashed border-border p-5">
      <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Add person
      </span>

      <div className="space-y-1">
        <Label htmlFor="timezones-add-name" className="sr-only">
          Name
        </Label>
        <Input
          id={`${fieldId}-name`}
          placeholder="Name"
          value={name}
          maxLength={NAME_MAX}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? nameErrorId : undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
          }}
          onKeyDown={(event) => {
            // Guarded like the button — holding Enter would otherwise post the
            // same person once per repeat while the first create is in flight.
            if (event.key === 'Enter' && !isSubmitting) handleAdd()
          }}
          className={cn('h-11 text-base', errors.name && 'border-destructive focus-visible:ring-destructive')}
        />
        {errors.name && (
          <p id={nameErrorId} role="alert" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <TimezoneCombobox
          value={timezone}
          instant={instant}
          aria-label="Time zone for the new person"
          invalid={Boolean(errors.timezone)}
          aria-describedby={errors.timezone ? zoneErrorId : undefined}
          className="h-11 text-base"
          onChange={(zone) => {
            setTimezone(zone)
            setErrors((prev) => ({ ...prev, timezone: undefined }))
          }}
        />
        {errors.timezone && (
          <p id={zoneErrorId} role="alert" className="text-sm text-destructive">
            {errors.timezone}
          </p>
        )}
      </div>

      <Button type="button" size="lg" onClick={handleAdd} disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-2 h-4 w-4" />
        )}
        Add
      </Button>
    </div>
  )
}
