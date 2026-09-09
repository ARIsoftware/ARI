import { describe, it, expect } from 'vitest'
import {
  createEventSchema,
  updateEventSchema,
  deleteEventQuerySchema,
  listEventsQuerySchema,
  TimelineEventSchema,
  EventListResponseSchema,
  EventSingleResponseSchema,
  EventDeleteResponseSchema,
} from '@/modules-core/timeline/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

const validEvent = {
  id: VALID_UUID,
  user_id: 'user-1',
  name: 'Launch day',
  event_date: '2026-10-15',
  color: '#EB2525',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

// ─── createEventSchema ────────────────────────────────────────────────────────

describe('createEventSchema', () => {
  it('accepts a minimal valid event (no color)', () => {
    expect(createEventSchema.safeParse({ name: 'Launch', event_date: '2026-10-15' }).success).toBe(true)
  })

  it('accepts a hex color and a null color', () => {
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-09-01', color: '#00ff00' }).success).toBe(true)
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-09-01', color: null }).success).toBe(true)
  })

  it('rejects an empty or missing name', () => {
    expect(createEventSchema.safeParse({ name: '', event_date: '2026-10-15' }).success).toBe(false)
    expect(createEventSchema.safeParse({ event_date: '2026-10-15' }).success).toBe(false)
  })

  it('rejects names over EVENT_NAME_MAX and unsafe characters', () => {
    expect(createEventSchema.safeParse({ name: 'x'.repeat(101), event_date: '2026-10-15' }).success).toBe(false)
    expect(createEventSchema.safeParse({ name: '<script>', event_date: '2026-10-15' }).success).toBe(false)
  })

  it('rejects malformed date strings', () => {
    expect(createEventSchema.safeParse({ name: 'A', event_date: '15-10-2026' }).success).toBe(false)
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-10-15T00:00:00Z' }).success).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-09-31' }).success).toBe(false)
  })

  it('rejects dates outside the fixed range', () => {
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-08-31' }).success).toBe(false)
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2027-01-01' }).success).toBe(false)
  })

  it('accepts the range boundaries', () => {
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-09-01' }).success).toBe(true)
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-12-31' }).success).toBe(true)
  })

  it('rejects invalid color formats', () => {
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-10-15', color: 'red' }).success).toBe(false)
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-10-15', color: '#fff' }).success).toBe(false)
    expect(createEventSchema.safeParse({ name: 'A', event_date: '2026-10-15', color: '#12345G' }).success).toBe(false)
  })
})

// ─── updateEventSchema ────────────────────────────────────────────────────────

describe('updateEventSchema', () => {
  it('accepts a valid update', () => {
    expect(
      updateEventSchema.safeParse({ id: VALID_UUID, name: 'A', event_date: '2026-10-15', color: '#123abc' }).success
    ).toBe(true)
  })

  it('rejects a missing or malformed id', () => {
    expect(updateEventSchema.safeParse({ name: 'A', event_date: '2026-10-15' }).success).toBe(false)
    expect(updateEventSchema.safeParse({ id: 'not-a-uuid', name: 'A', event_date: '2026-10-15' }).success).toBe(false)
  })
})

// ─── deleteEventQuerySchema ───────────────────────────────────────────────────

describe('deleteEventQuerySchema', () => {
  it('accepts a valid uuid and rejects a malformed one', () => {
    expect(deleteEventQuerySchema.safeParse({ id: VALID_UUID }).success).toBe(true)
    expect(deleteEventQuerySchema.safeParse({ id: 'nope' }).success).toBe(false)
  })
})

// ─── listEventsQuerySchema ────────────────────────────────────────────────────

describe('listEventsQuerySchema', () => {
  it('accepts empty query (both params optional)', () => {
    expect(listEventsQuerySchema.safeParse({}).success).toBe(true)
  })

  it('coerces string params to numbers', () => {
    const parsed = listEventsQuerySchema.safeParse({ limit: '100', offset: '20' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.limit).toBe(100)
      expect(parsed.data.offset).toBe(20)
    }
  })

  it('enforces limit bounds 1–500', () => {
    expect(listEventsQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(listEventsQuerySchema.safeParse({ limit: '501' }).success).toBe(false)
    expect(listEventsQuerySchema.safeParse({ limit: '500' }).success).toBe(true)
  })

  it('rejects non-integer and negative values', () => {
    expect(listEventsQuerySchema.safeParse({ limit: '2.5' }).success).toBe(false)
    expect(listEventsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
  })
})

// ─── response schemas ─────────────────────────────────────────────────────────

describe('response schemas', () => {
  it('TimelineEventSchema accepts a full event and null color', () => {
    expect(TimelineEventSchema.safeParse(validEvent).success).toBe(true)
    expect(TimelineEventSchema.safeParse({ ...validEvent, color: null }).success).toBe(true)
  })

  it('EventListResponseSchema requires events, count, and total', () => {
    expect(EventListResponseSchema.safeParse({ events: [validEvent], count: 1, total: 1 }).success).toBe(true)
    expect(EventListResponseSchema.safeParse({ events: [validEvent], count: 1 }).success).toBe(false)
    expect(EventListResponseSchema.safeParse({ events: [validEvent], count: -1, total: 1 }).success).toBe(false)
  })

  it('EventSingleResponseSchema wraps one event', () => {
    expect(EventSingleResponseSchema.safeParse({ event: validEvent }).success).toBe(true)
  })

  it('EventDeleteResponseSchema requires success: true', () => {
    expect(EventDeleteResponseSchema.safeParse({ success: true, message: 'Event deleted successfully' }).success).toBe(true)
    expect(EventDeleteResponseSchema.safeParse({ success: false, message: 'x' }).success).toBe(false)
  })
})
