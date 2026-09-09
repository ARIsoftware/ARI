/**
 * Timeline Module - Type Definitions
 *
 * Keep in sync with database/schema.ts and lib/validation.ts.
 * API responses are snake_case (converted via toSnakeCase in the routes).
 */

/** Row in the timeline_events table, as returned by the API. */
export interface TimelineEvent {
  id: string
  user_id: string
  name: string
  event_date: string // YYYY-MM-DD
  color: string | null // #RRGGBB, null = default blue
  created_at: string
  updated_at: string
}

/** Request body for POST /api/modules/timeline/events */
export interface TimelineEventInput {
  name: string
  event_date: string // YYYY-MM-DD
  color?: string | null // #RRGGBB, null/omitted = default blue
}

/** Request body for PUT /api/modules/timeline/events */
export interface UpdateTimelineEventRequest extends TimelineEventInput {
  id: string
}

/** Response from GET /api/modules/timeline/events */
export interface GetTimelineEventsResponse {
  events: TimelineEvent[]
  count: number
}
