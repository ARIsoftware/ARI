import { z } from 'zod'
import '@/lib/openapi/registry'
import { safeText } from '@/lib/validation'
import {
  TIMELINE_START,
  TIMELINE_END,
  TIMELINE_RANGE_LABEL,
  EVENT_NAME_MAX,
  isValidIsoDate,
} from './timeline-range'

const uuidSchema = z.string().uuid('Invalid event id format')

const eventNameSchema = safeText(EVENT_NAME_MAX).min(1, 'Event name is required')

const eventDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Date must be a valid calendar date')
  .refine(
    (d) => d >= TIMELINE_START && d <= TIMELINE_END,
    `Date must be within the timeline range (${TIMELINE_RANGE_LABEL})`
  )

// Optional line color; null/omitted = the default blue.
const eventColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #EB2525')
  .nullable()
  .optional()

export const createEventSchema = z.object({
  name: eventNameSchema,
  event_date: eventDateSchema,
  color: eventColorSchema,
}).openapi('TimelineCreateEventBody')

export const updateEventSchema = z.object({
  id: uuidSchema,
  name: eventNameSchema,
  event_date: eventDateSchema,
  color: eventColorSchema,
}).openapi('TimelineUpdateEventBody')

export const deleteEventQuerySchema = z.object({
  id: uuidSchema,
}).openapi('TimelineDeleteEventQuery')

export const listEventsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('Limit must be a whole number')
    .min(1, 'Limit must be at least 1')
    .max(500, 'Limit must be 500 or fewer')
    .optional(),
  offset: z.coerce
    .number()
    .int('Offset must be a whole number')
    .min(0, 'Offset cannot be negative')
    .optional(),
}).openapi('TimelineListEventsQuery')

export const TimelineEventSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  event_date: z.string(),
  color: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('TimelineEvent')

export const EventListResponseSchema = z.object({
  events: z.array(TimelineEventSchema),
  count: z.number().int().nonnegative().describe('Number of events in this page'),
  total: z.number().int().nonnegative().describe("Total number of the user's events across all pages"),
}).openapi('TimelineEventListResponse')

export const EventSingleResponseSchema = z.object({
  event: TimelineEventSchema,
}).openapi('TimelineEventSingleResponse')

export const EventDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('TimelineEventDeleteResponse')
