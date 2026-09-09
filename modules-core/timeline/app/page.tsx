'use client'

/**
 * Timeline Module - Main Page
 *
 * Horizontal timeline of the user's events across a fixed range
 * (Sep 1 – Dec 31, 2026). Rendered via the catch-all module route,
 * so it MUST use a default export.
 *
 * Route: /timeline
 */

import { useCallback, useState } from 'react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { TimelineChart } from '../components/timeline-chart'
import { EventDialog } from '../components/event-dialog'
import { useRandomQuote, useTimelineEvents } from '../hooks/use-timeline'
import type { TimelineEvent } from '../types'

export default function TimelinePage() {
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')
  const { data: randomQuote } = useRandomQuote(quotesEnabled && !quotesLoading)

  const { data: events = [], isLoading, isError, refetch } = useTimelineEvents()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null)

  const openCreate = () => {
    setEditingEvent(null)
    setDialogOpen(true)
  }

  // Stable identity so the memoized TimelineChart skips unrelated re-renders.
  const openEdit = useCallback((event: TimelineEvent) => {
    setEditingEvent(event)
    setDialogOpen(true)
  }, [])

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-medium">Timeline</h1>
          {quotesEnabled && randomQuote?.quote && (
            <p className="mt-1 text-sm text-muted-foreground">{randomQuote.quote}</p>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Event
        </Button>
      </div>

      <TimelineChart
        events={events}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        onEventClick={openEdit}
      />

      <EventDialog open={dialogOpen} onOpenChange={setDialogOpen} event={editingEvent} />
    </div>
  )
}
