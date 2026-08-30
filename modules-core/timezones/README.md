# Timezones

Schedule meetings across time zones. Every clock on the board is editable — type a
time into any person's card and every other card shifts to match.

## How it works

The whole board is driven by a single absolute instant (UTC milliseconds):

- **Live mode** (default) — the instant is the current time and ticks on each minute
  boundary. Nothing on the board renders seconds, so waking once a second would
  re-render it 60x to produce identical output.
- **Pinned mode** — editing a clock or picking a date freezes the board on a chosen
  instant. `NOW` returns to live.

Each card renders that one instant in its own IANA zone, so "what is 3pm in London
for everyone else" is just a re-render rather than a chain of pairwise conversions.
Editing runs the conversion in reverse: the typed wall-clock time plus that card's
current calendar date is converted back into an instant.

All of the zone math lives in `lib/time.ts` and uses `Intl.DateTimeFormat` as the
source of truth for offsets — no date library — so DST transitions, half-hour zones
(Kolkata, `GMT+5:30`) and quarter-hour zones (Chatham, `GMT+12:45`) are handled by
the runtime's ICU data.

### DST edge cases

`zonedPartsToInstant()` follows the Temporal proposal's *compatible* disambiguation:

| Case | Behaviour |
|---|---|
| Ambiguous (clocks fell back, the time happens twice) | Resolves to the **earlier** instant |
| Nonexistent (clocks sprang forward, e.g. 02:30 on a US spring-forward Sunday) | Shifts **forward** past the gap (→ 03:30) |

## Accepted time input

`3pm` · `3:30 PM` · `15:00` · `1500` · `930` · `9:30 am` · `noon` · `midnight`

Unparseable text shows an inline hint and leaves the board unchanged. `Esc` discards
an in-progress edit; `Enter` commits.

## Data

| What | Where | Scope |
|---|---|---|
| People and their zones | `timezone_people` table | **Per-user (private)** |
| Your own home zone | `module_settings.settings.homeTimezone` | Per-user |

Per-user means every API read/write filters by `user_id = user.id`; the RLS policies
in `database/schema.sql` mirror that as defense-in-depth. Until you pick a zone, the
board falls back to the browser-detected one. Up to 30 people per user.

## API

| Method | Path |
|---|---|
| `GET` / `POST` | `/api/modules/timezones/people` |
| `PATCH` / `DELETE` | `/api/modules/timezones/people/{id}` |
| `GET` / `PUT` | `/api/modules/timezones/settings` |

All routes are authenticated (session cookie or ARI API key), Zod-validated, and
documented in `/api-docs`.

## Files

```
app/page.tsx                      Board: header controls + card row
styles.css                        Module-scoped 110% display scale
components/person-card.tsx        One clock (name, zone, editable time, date)
components/clock-input.tsx        The editable time field
components/add-person-card.tsx    Dashed "add person" tile
components/timezone-combobox.tsx  Searchable IANA picker (~400 zones, ranked + capped)
hooks/use-timezones.ts            TanStack Query hooks (people + settings)
hooks/use-clock.ts                Hydration-safe current time + browser zone
lib/time.ts                       All zone math and formatting
lib/field-schemas.ts              Field rules shared with the client forms
lib/validation.ts                 Zod schemas (also the OpenAPI components)
```

`lib/field-schemas.ts` is separate from `lib/validation.ts` on purpose: the latter
side-effect-imports the OpenAPI registry to get `.openapi()`, which would pull
`zod-to-openapi` into the client bundle for any form that just wants the name rule.

## Optional integration: Quotes

The header shows a random quote when the Quotes module is enabled, read from its
`/api/modules/quotes/quotes/random` endpoint. This is a **soft** dependency — it is
gated on `useModuleEnabled('quotes')`, never retries, and the line simply doesn't
render when Quotes is absent. It is deliberately not listed in `module.json`
`dependencies.modules`, which would wrongly mark Quotes as required.

## Removing the module's tables

`database/uninstall.sql` is never run automatically. Execute it by hand in pgweb,
Supabase Studio, or `psql` to drop `timezone_people` permanently.
