'use client'

/**
 * Searchable IANA time zone picker.
 *
 * The full IANA list is ~400 entries, so cmdk's built-in filter is switched off
 * (`shouldFilter={false}`) and results are ranked and capped here. The search
 * keys are precomputed once by listTimeZones() — deriving them inside the
 * filter meant thousands of string splits per keystroke.
 */

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { listTimeZones, zoneCityLabel, zoneOffsetLabel, zoneRegionLabel, type TimeZoneEntry } from '../lib/time'

// CommandList is capped at ~8 visible rows, so a deeper list is DOM and cmdk
// bookkeeping nobody scrolls to — and each unseen zone costs a formatter
// construction. Narrowing by search is faster than scrolling anyway.
const MAX_RESULTS = 25

interface TimezoneComboboxProps {
  value: string | null
  onChange: (timezone: string) => void
  /** Instant used to label each zone's current offset (DST-accurate). */
  instant: number | null
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  /** Open the list as soon as it mounts (used by the inline card editor). */
  defaultOpen?: boolean
  /** Fires when the list closes, whether or not a zone was picked. */
  onClose?: () => void
}

/** Lower is better; -1 means no match. */
function rank(entry: TimeZoneEntry, query: string): number {
  if (entry.city.startsWith(query)) return 0
  if (entry.city.includes(query)) return 1
  if (entry.haystack.includes(query)) return 2
  return -1
}

export function TimezoneCombobox({
  value,
  onChange,
  instant,
  placeholder = 'Select time zone',
  invalid = false,
  disabled = false,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  defaultOpen = false,
  onClose,
}: TimezoneComboboxProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')

  const zones = useMemo(() => listTimeZones(), [])

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    // No query means every zone scores 0, and listTimeZones() is already sorted
    // by city — scoring and re-sorting would be pure waste.
    if (!normalized) {
      return { zones: zones.slice(0, MAX_RESULTS), truncated: zones.length > MAX_RESULTS }
    }

    const scored: Array<{ entry: TimeZoneEntry; score: number }> = []
    for (const entry of zones) {
      const score = rank(entry, normalized)
      if (score >= 0) scored.push({ entry, score })
    }

    // Stable sort keeps the city ordering listTimeZones() already established,
    // so only the score buckets need comparing.
    scored.sort((a, b) => a.score - b.score)

    return {
      zones: scored.slice(0, MAX_RESULTS).map((match) => match.entry),
      truncated: scored.length > MAX_RESULTS,
    }
  }, [zones, query])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setQuery('')
      onClose?.()
    }
  }

  const handleSelect = (zone: string) => {
    onChange(zone)
    handleOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            invalid && 'border-destructive ring-1 ring-destructive',
            className
          )}
        >
          <span className="truncate">{value ? zoneCityLabel(value) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      {/* Radix portals this to <body>, outside the board's zoom, so it opts back
          in explicitly — otherwise the list renders smaller than its trigger.
          The zoom sits on the inner wrapper, never on the positioned element. */}
      <PopoverContent className="w-auto p-0" align="start">
        <div className="timezones-scaled min-w-[16rem]">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search city or region..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No matching time zone.</CommandEmpty>
              {results.zones.map(({ zone }) => {
                const region = zoneRegionLabel(zone)
                return (
                  <CommandItem key={zone} value={zone} onSelect={() => handleSelect(zone)}>
                    <Check
                      className={cn('mr-2 h-4 w-4 shrink-0', value === zone ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{zoneCityLabel(zone)}</span>
                      {region && (
                        <span className="block truncate text-xs text-muted-foreground">{region}</span>
                      )}
                    </span>
                    {instant !== null && (
                      <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">
                        {zoneOffsetLabel(zone, instant)}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandList>
            {/* Outside CommandList: cmdk gives that element role="listbox", whose
                children must all be options. */}
            {results.truncated && (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Showing the first {MAX_RESULTS} — keep typing to narrow.
              </p>
            )}
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  )
}
