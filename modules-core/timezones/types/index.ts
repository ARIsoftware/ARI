/**
 * Timezones Module - Type Definitions
 *
 * Keep in sync with:
 * - database/schema.sql + database/schema.ts
 * - lib/validation.ts (the server-side source of truth)
 */

/** A row in timezone_people, as returned by the API (snake_case). */
export interface TimezonePerson {
  id: string
  user_id: string
  name: string
  /** IANA identifier, e.g. "Europe/London" */
  timezone: string
  created_at: string
  updated_at: string
}

/** Request body for POST /api/modules/timezones/people */
export interface CreatePersonRequest {
  name: string
  timezone: string
}

/** Request body for PATCH /api/modules/timezones/people/[id] */
export interface UpdatePersonRequest {
  name?: string
  timezone?: string
}

/** Response from GET /api/modules/timezones/people */
export interface GetPeopleResponse {
  people: TimezonePerson[]
  count: number
}

/** Response from POST / PATCH /api/modules/timezones/people */
export interface PersonResponse {
  person: TimezonePerson
}

/**
 * Module settings stored in module_settings.settings (JSONB), per user.
 * `homeTimezone` is absent until the user picks one — the page falls back to
 * the browser-detected zone so the board is useful on first load.
 */
export interface TimezonesSettings {
  homeTimezone: string
}

export type GetSettingsResponse = Partial<TimezonesSettings>
export type UpdateSettingsRequest = Partial<TimezonesSettings>
