'use client'

/**
 * Timezones Module - Main Page
 *
 * The whole board is driven by one absolute instant. In "live" mode that
 * instant is the current time and ticks on each minute boundary; editing any clock (or
 * picking a date) pins it, and every card re-renders from the same instant in
 * its own zone. That single-source-of-truth is what makes "edit any clock,
 * every clock follows" hold across DST boundaries and half-hour offsets.
 *
 * Route: /timezones
 */

import { useMemo, useState } from 'react'
import '../styles.css'
import { AlertCircle, CalendarDays, Loader2 } from 'lucide-react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ToastAction } from '@/components/ui/toast'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AddPersonCard } from '../components/add-person-card'
import { PersonCard } from '../components/person-card'
import { TimezoneCombobox } from '../components/timezone-combobox'
import { formatDateLabel, getZonedParts, reanchor } from '../lib/time'
import { useBrowserTimeZone, useNow } from '../hooks/use-clock'
import {
  useCreateTimezonePerson,
  useDeleteTimezonePerson,
  useRandomQuote,
  useTimezonePeople,
  useTimezonesSettings,
  useUpdateTimezonePerson,
  useUpdateTimezonesSettings,
} from '../hooks/use-timezones'
import type { TimezonePerson } from '../types'

export default function TimezonesPage() {
  const { toast } = useToast()
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')

  const {
    data: people = [],
    isLoading: peopleLoading,
    isError: peopleFailed,
    error: peopleError,
    refetch: refetchPeople,
  } = useTimezonePeople()
  const createPerson = useCreateTimezonePerson()
  const updatePerson = useUpdateTimezonePerson()
  const deletePerson = useDeleteTimezonePerson()

  const { data: settings } = useTimezonesSettings()
  const updateSettings = useUpdateTimezonesSettings()
  const { data: randomQuote } = useRandomQuote(quotesEnabled && !quotesLoading)

  /** null = live (follow the clock); a number = pinned to that instant. */
  const [anchor, setAnchor] = useState<number | null>(null)

  // The interval only runs while live — a pinned board has nothing to tick.
  const now = useNow(anchor === null)
  const detectedZone = useBrowserTimeZone()

  const homeTimezone = settings?.homeTimezone ?? detectedZone
  const instant = anchor ?? now

  const homeParts = useMemo(
    () => (homeTimezone && instant !== null ? getZonedParts(homeTimezone, instant) : null),
    [homeTimezone, instant]
  )

  const notify = (error: unknown, title: string) => {
    toast({
      variant: 'destructive',
      title,
      description: error instanceof Error ? error.message : 'Please try again.',
    })
  }

  /**
   * Re-anchor the board from a wall-clock time typed into one card: read that
   * card's current calendar date, swap in the new time, and convert back to an
   * absolute instant. Every other card then renders that same instant.
   */
  const commitTimeFor = (timezone: string) => (time: { hour: number; minute: number }) => {
    if (instant === null) return
    setAnchor(reanchor(timezone, instant, time))
  }

  /** Move the board to another day, keeping the viewer's time of day. */
  const handleDateSelect = (date: Date | undefined) => {
    if (!date || !homeTimezone || instant === null) return

    setAnchor(
      reanchor(homeTimezone, instant, {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
      })
    )
  }

  const handleHomeTimezoneChange = (timezone: string) => {
    updateSettings.mutate(
      { homeTimezone: timezone },
      { onError: (error) => notify(error, 'Could not save your time zone') }
    )
  }

  /**
   * Removal is instant with an Undo rather than gated behind a confirm dialog:
   * the common case is intentional, and re-adding restores the same name and
   * zone (a new row id, which nothing else references).
   */
  const handleRemove = (person: TimezonePerson) => {
    deletePerson.mutate(person.id, {
      onError: (error) => notify(error, `Could not remove ${person.name}`),
      onSuccess: () => {
        toast({
          title: `Removed ${person.name}`,
          action: (
            <ToastAction
              altText={`Undo removing ${person.name}`}
              onClick={() =>
                createPerson.mutate(
                  { name: person.name, timezone: person.timezone },
                  { onError: (error) => notify(error, `Could not restore ${person.name}`) }
                )
              }
            >
              Undo
            </ToastAction>
          ),
        })
      },
    })
  }

  const isReady = instant !== null && homeTimezone !== null && homeParts !== null

  return (
    <div className="timezones-board space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-medium">Timezones</h1>
          {quotesEnabled && randomQuote && (
            <p className="mt-1 text-sm text-muted-foreground">{randomQuote.quote}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Every time is editable — type <span className="font-mono">3pm</span>,{' '}
            <span className="font-mono">15:00</span>, or{' '}
            <span className="font-mono">9:30 am</span> in any card and everyone shifts.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              My time zone
            </span>
            <TimezoneCombobox
              value={homeTimezone}
              instant={instant}
              disabled={!isReady}
              aria-label="My time zone"
              onChange={handleHomeTimezoneChange}
              className="w-48"
            />
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Date
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" disabled={!isReady} className="w-44 justify-start font-normal">
                  <CalendarDays className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                  {homeParts ? formatDateLabel(homeParts) : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                {/* Portalled to <body>, outside the board's zoom — opt back in
                    so the calendar matches the control that opened it. */}
                <div className="timezones-scaled">
                  <Calendar
                  mode="single"
                  initialFocus
                  selected={
                    homeParts
                      ? new Date(homeParts.year, homeParts.month - 1, homeParts.day)
                      : undefined
                  }
                    onSelect={handleDateSelect}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Button
            onClick={() => setAnchor(null)}
            disabled={anchor === null}
            className="font-semibold tracking-wider"
          >
            NOW
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            anchor === null ? 'animate-pulse bg-primary' : 'bg-muted-foreground/40'
          )}
        />
        {anchor === null ? 'Live — clocks are following the current time' : 'Pinned — press NOW to resume'}
      </div>

      {!isReady || peopleLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : peopleFailed ? (
        // Without this branch a failed fetch renders as an empty board, which
        // is indistinguishable from "you haven't added anyone yet".
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="font-medium text-foreground">Could not load your people</p>
            <p className="text-sm text-muted-foreground">
              {peopleError instanceof Error ? peopleError.message : 'Please try again.'}
            </p>
          </div>
          <Button variant="outline" onClick={() => refetchPeople()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <PersonCard
            name="You"
            isMe
            timezone={homeTimezone}
            instant={instant}
            reference={homeParts}
            onTimeCommit={commitTimeFor(homeTimezone)}
            onTimezoneChange={handleHomeTimezoneChange}
          />

          {people.map((person) => (
            <PersonCard
              key={person.id}
              name={person.name}
              timezone={person.timezone}
              instant={instant}
              reference={homeParts}
              onTimeCommit={commitTimeFor(person.timezone)}
              onTimezoneChange={(timezone) =>
                updatePerson.mutate(
                  { id: person.id, timezone },
                  { onError: (error) => notify(error, `Could not update ${person.name}`) }
                )
              }
              onRemove={() => handleRemove(person)}
            />
          ))}

          <AddPersonCard
            instant={instant}
            isSubmitting={createPerson.isPending}
            onAdd={(person, onSuccess) =>
              createPerson.mutate(person, {
                onSuccess,
                onError: (error) => notify(error, 'Could not add person'),
              })
            }
          />
        </div>
      )}
    </div>
  )
}
