/**
 * Morning Brief - Google OAuth + Calendar helpers (server only)
 *
 * Plain `fetch` against Google's OAuth 2.0 and Calendar v3 REST APIs — no SDK,
 * no extra npm dependency. ARI owns the whole pipeline using its own Google
 * OAuth credentials (configured via env vars), so nothing here depends on
 * claude.ai's connectors.
 *
 * Required env vars (see the module's Settings page for setup instructions):
 *   MORNING_BRIEF_GOOGLE_CLIENT_ID
 *   MORNING_BRIEF_GOOGLE_CLIENT_SECRET
 *   MORNING_BRIEF_GOOGLE_REDIRECT_URI   (optional override; otherwise derived)
 */

import type { BriefMeeting } from '@/modules/morning-brief/types'
export type { BriefMeeting }

// Read-only access to the user's calendars. Reading calendar metadata under
// this scope also lets us discover the connected account's email (the primary
// calendar id), so no extra profile/email scope is requested.
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

/** Short-lived httpOnly cookie holding the OAuth CSRF state between connect → callback. */
export const OAUTH_STATE_COOKIE = 'mb_google_oauth_state'

export interface GoogleConfig {
  clientId: string
  clientSecret: string
}

/** Returns the configured OAuth client, or null when env vars are missing. */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.MORNING_BRIEF_GOOGLE_CLIENT_ID
  const clientSecret = process.env.MORNING_BRIEF_GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/**
 * The OAuth redirect URI. Must EXACTLY match an "Authorized redirect URI"
 * registered on the Google OAuth client. Prefer an explicit override; otherwise
 * derive from the app's configured base URL.
 */
export function getRedirectUri(): string {
  const explicit = process.env.MORNING_BRIEF_GOOGLE_REDIRECT_URI
  if (explicit) return explicit
  const base = (process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/api/modules/morning-brief/google/callback`
}

/** Build the Google consent-screen URL the user is sent to. */
export function buildAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline', // request a refresh token
    prompt: 'consent', // force refresh-token issuance on reconnect
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(config: GoogleConfig, code: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text().catch(() => '')}`)
  }
  return (await res.json()) as GoogleTokenResponse
}

/** Trade a refresh token for a fresh access token. */
export async function refreshAccessToken(config: GoogleConfig, refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text().catch(() => '')}`)
  }
  return (await res.json()) as GoogleTokenResponse
}

/** The primary calendar's id is the connected account's email address. */
export async function fetchPrimaryCalendarEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { id?: string }
  return json.id ?? null
}

interface GoogleEvent {
  id?: string
  summary?: string
  location?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

/**
 * Today's events from the user's primary calendar, in their timezone, as
 * display-ready rows. "Today" is bounded by the user's timezone so the day
 * rolls over at their local midnight, not the server's.
 */
export async function fetchTodaysEvents(accessToken: string, timezone: string): Promise<BriefMeeting[]> {
  const { timeMin, timeMax } = getDayBoundsISO(timezone)
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true', // expand recurring events into instances
    orderBy: 'startTime',
    maxResults: '50',
  })
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Google calendar fetch failed (${res.status}): ${await res.text().catch(() => '')}`)
  }
  const json = (await res.json()) as { items?: GoogleEvent[] }
  const items = json.items ?? []

  return items
    .filter((e) => e.status !== 'cancelled')
    .map((e, i): BriefMeeting => {
      const allDay = !e.start?.dateTime
      const startRaw = e.start?.dateTime ?? e.start?.date ?? null
      return toBriefMeeting(
        {
          // Deterministic + unique even when Google omits an id (stable React key).
          id: e.id ?? `${startRaw ?? 'event'}-${i}`,
          title: e.summary ?? '',
          location: e.location ?? null,
          startISO: startRaw,
          endISO: e.end?.dateTime ?? e.end?.date ?? null,
          allDay,
        },
        timezone,
      )
    })
}

/**
 * Assemble a display-ready BriefMeeting from already-extracted fields. Shared by
 * the Google (`fetchTodaysEvents`) and iCal (`fetchTodaysIcalEvents`) paths so
 * the brief's meeting display contract — fallback title, time labels in the
 * user's timezone, trimmed location — lives in exactly one place.
 */
export function toBriefMeeting(
  fields: {
    id: string
    title: string
    location: string | null
    startISO: string | null
    endISO: string | null
    allDay: boolean
  },
  timezone: string,
): BriefMeeting {
  const { id, title, location, startISO, endISO, allDay } = fields
  return {
    id,
    title: (title || '(no title)').trim(),
    allDay,
    startLabel: allDay ? 'All day' : formatTimeInTz(startISO, timezone),
    endLabel: allDay || !endISO ? null : formatTimeInTz(endISO, timezone),
    location: location?.trim() || null,
    start: startISO,
  }
}

// ─── Timezone helpers (no external library) ─────────────────────────────────

/** "9:00 AM" formatted in the given IANA timezone. */
export function formatTimeInTz(iso: string | null, timezone: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  }
}

/**
 * Bounds of "today" in the given IANA timezone as RFC3339 strings, suitable for
 * Google Calendar's timeMin/timeMax (timeMax is EXCLUSIVE, so it's tomorrow's
 * local midnight). Each bound carries the offset computed at its own instant, so
 * the window stays correct across a DST transition day.
 */
export function getDayBoundsISO(timezone: string): { timeMin: string; timeMax: string } {
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const startYmd = formatYmdInTz(now, timezone)
  const endYmd = formatYmdInTz(tomorrow, timezone)
  return {
    timeMin: `${startYmd}T00:00:00${getTimezoneOffset(timezone, now)}`,
    timeMax: `${endYmd}T00:00:00${getTimezoneOffset(timezone, tomorrow)}`,
  }
}

/** Today's calendar date (YYYY-MM-DD) in the given timezone. */
export function getLocalDateString(timezone: string): string {
  return formatYmdInTz(new Date(), timezone)
}

function formatYmdInTz(date: Date, timezone: string): string {
  try {
    // en-CA renders as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  }
}

/** UTC offset (e.g. "-04:00") for an IANA timezone at a given instant. */
function getTimezoneOffset(timezone: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    }).formatToParts(date)
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    const match = tzName.match(/GMT([+-]\d{2}:?\d{2})/)
    if (match) {
      const raw = match[1]
      return raw.includes(':') ? raw : `${raw.slice(0, 3)}:${raw.slice(3)}`
    }
  } catch {
    // fall through
  }
  return '+00:00'
}
