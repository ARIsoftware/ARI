# Timeline

A horizontal timeline of your events across a fixed range: **Sep 1 – Dec 31, 2026**.

- Every day gets a small vertical tick in a cycling shade of blue.
- Days with an event get a tall line with a dot and the event's name and date above it.
- A full-height vertical line marks today; everything before today is faded out.
- Click an event's label to edit or delete it; "Add Event" creates a new one.

## Data

- Per-user (private): each user only sees their own events.
- Table: `timeline_events` (auto-created when the module is enabled).
- API: `GET/POST/PUT /api/modules/timeline/events`, `DELETE /api/modules/timeline/events?id=...`

## Soft dependency

When the core **Quotes** module is enabled, a random quote renders under the page
title (fetched from `/api/modules/quotes/quotes/random`). This is optional — the
module works fine without Quotes installed or enabled.

## Changing the range

The fixed range lives in `lib/timeline-range.ts` (`TIMELINE_START` / `TIMELINE_END`).
Server-side validation only accepts event dates inside that range.
