/**
 * Tests for morning-brief/lib/google.ts
 *
 * Mocks: global fetch. Tests all exported functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// BriefMeeting type comes from modules-core/morning-brief/types — mock it
vi.mock('@/modules/morning-brief/types', () => ({
  // nothing needed — we only import the type which is erased at runtime
}))

import {
  getGoogleConfig,
  getRedirectUri,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchPrimaryCalendarEmail,
  fetchTodaysEvents,
  toBriefMeeting,
  formatTimeInTz,
  getDayBoundsISO,
  getLocalDateString,
  GOOGLE_SCOPE,
  OAUTH_STATE_COOKIE,
} from '@/modules-core/morning-brief/lib/google'

// ─── Constants ───────────────────────────────────────────────────────────────

describe('constants', () => {
  it('GOOGLE_SCOPE is calendar.readonly', () => {
    expect(GOOGLE_SCOPE).toContain('calendar.readonly')
  })

  it('OAUTH_STATE_COOKIE is a non-empty string', () => {
    expect(typeof OAUTH_STATE_COOKIE).toBe('string')
    expect(OAUTH_STATE_COOKIE.length).toBeGreaterThan(0)
  })
})

// ─── getGoogleConfig ─────────────────────────────────────────────────────────

describe('getGoogleConfig', () => {
  afterEach(() => {
    delete process.env.MORNING_BRIEF_GOOGLE_CLIENT_ID
    delete process.env.MORNING_BRIEF_GOOGLE_CLIENT_SECRET
  })

  it('returns null when CLIENT_ID is missing', () => {
    delete process.env.MORNING_BRIEF_GOOGLE_CLIENT_ID
    process.env.MORNING_BRIEF_GOOGLE_CLIENT_SECRET = 'secret'
    expect(getGoogleConfig()).toBeNull()
  })

  it('returns null when CLIENT_SECRET is missing', () => {
    process.env.MORNING_BRIEF_GOOGLE_CLIENT_ID = 'client-id'
    delete process.env.MORNING_BRIEF_GOOGLE_CLIENT_SECRET
    expect(getGoogleConfig()).toBeNull()
  })

  it('returns config object when both env vars are set', () => {
    process.env.MORNING_BRIEF_GOOGLE_CLIENT_ID = 'my-client-id'
    process.env.MORNING_BRIEF_GOOGLE_CLIENT_SECRET = 'my-client-secret'
    const config = getGoogleConfig()
    expect(config).toEqual({
      clientId: 'my-client-id',
      clientSecret: 'my-client-secret',
    })
  })
})

// ─── getRedirectUri ──────────────────────────────────────────────────────────

describe('getRedirectUri', () => {
  afterEach(() => {
    delete process.env.MORNING_BRIEF_GOOGLE_REDIRECT_URI
    delete process.env.BETTER_AUTH_URL
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('returns explicit override when set', () => {
    process.env.MORNING_BRIEF_GOOGLE_REDIRECT_URI = 'https://custom.example.com/callback'
    expect(getRedirectUri()).toBe('https://custom.example.com/callback')
  })

  it('derives from BETTER_AUTH_URL when no explicit override', () => {
    delete process.env.MORNING_BRIEF_GOOGLE_REDIRECT_URI
    process.env.BETTER_AUTH_URL = 'https://myapp.example.com/'
    const uri = getRedirectUri()
    expect(uri).toBe('https://myapp.example.com/api/modules/morning-brief/google/callback')
  })

  it('derives from NEXT_PUBLIC_APP_URL as second fallback', () => {
    delete process.env.MORNING_BRIEF_GOOGLE_REDIRECT_URI
    delete process.env.BETTER_AUTH_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://fallback.example.com'
    const uri = getRedirectUri()
    expect(uri).toBe('https://fallback.example.com/api/modules/morning-brief/google/callback')
  })

  it('defaults to localhost:3000 when no env vars set', () => {
    delete process.env.MORNING_BRIEF_GOOGLE_REDIRECT_URI
    delete process.env.BETTER_AUTH_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    const uri = getRedirectUri()
    expect(uri).toContain('localhost:3000')
    expect(uri).toContain('/api/modules/morning-brief/google/callback')
  })

  it('strips trailing slash from base URL', () => {
    delete process.env.MORNING_BRIEF_GOOGLE_REDIRECT_URI
    process.env.BETTER_AUTH_URL = 'https://myapp.example.com///'
    const uri = getRedirectUri()
    expect(uri).not.toContain('///')
  })
})

// ─── buildAuthUrl ────────────────────────────────────────────────────────────

describe('buildAuthUrl', () => {
  it('returns a URL containing the accounts.google.com auth endpoint', () => {
    const url = buildAuthUrl('client-id', 'random-state')
    expect(url).toContain('accounts.google.com')
    expect(url).toContain('o/oauth2/v2/auth')
  })

  it('includes client_id in the URL', () => {
    const url = buildAuthUrl('my-client', 'state-123')
    expect(url).toContain('client_id=my-client')
  })

  it('includes the state parameter', () => {
    const url = buildAuthUrl('client-id', 'test-state-xyz')
    expect(url).toContain('state=test-state-xyz')
  })

  it('includes response_type=code', () => {
    const url = buildAuthUrl('client-id', 'state')
    expect(url).toContain('response_type=code')
  })

  it('includes access_type=offline', () => {
    const url = buildAuthUrl('client-id', 'state')
    expect(url).toContain('access_type=offline')
  })

  it('includes prompt=consent', () => {
    const url = buildAuthUrl('client-id', 'state')
    expect(url).toContain('prompt=consent')
  })

  it('includes the calendar.readonly scope', () => {
    const url = buildAuthUrl('client-id', 'state')
    expect(decodeURIComponent(url)).toContain('calendar.readonly')
  })
})

// ─── exchangeCodeForTokens ───────────────────────────────────────────────────

describe('exchangeCodeForTokens', () => {
  afterEach(() => vi.unstubAllGlobals())

  const config = { clientId: 'cid', clientSecret: 'csec' }

  it('returns token response on success', async () => {
    const tokenData = { access_token: 'at', expires_in: 3600, refresh_token: 'rt' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => tokenData,
    }))
    const result = await exchangeCodeForTokens(config, 'auth-code')
    expect(result.access_token).toBe('at')
    expect(result.refresh_token).toBe('rt')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant',
    }))
    await expect(exchangeCodeForTokens(config, 'bad-code')).rejects.toThrow(/400/)
  })

  it('sends correct grant_type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at', expires_in: 3600 }),
    }))
    await exchangeCodeForTokens(config, 'code-xyz')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('code-xyz')
  })
})

// ─── refreshAccessToken ──────────────────────────────────────────────────────

describe('refreshAccessToken', () => {
  afterEach(() => vi.unstubAllGlobals())

  const config = { clientId: 'cid', clientSecret: 'csec' }

  it('returns a fresh token response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', expires_in: 3600 }),
    }))
    const result = await refreshAccessToken(config, 'rt-old')
    expect(result.access_token).toBe('new-at')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid_token',
    }))
    await expect(refreshAccessToken(config, 'bad-rt')).rejects.toThrow(/401/)
  })

  it('sends grant_type=refresh_token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at', expires_in: 3600 }),
    }))
    await refreshAccessToken(config, 'my-refresh-token')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('my-refresh-token')
  })

  it('handles text() throwing gracefully on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => { throw new Error('network error') },
    }))
    await expect(refreshAccessToken(config, 'rt')).rejects.toThrow(/500/)
  })
})

// ─── fetchPrimaryCalendarEmail ────────────────────────────────────────────────

describe('fetchPrimaryCalendarEmail', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the calendar id (email) on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'user@example.com' }),
    }))
    const email = await fetchPrimaryCalendarEmail('access-token')
    expect(email).toBe('user@example.com')
  })

  it('returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }))
    const email = await fetchPrimaryCalendarEmail('bad-token')
    expect(email).toBeNull()
  })

  it('returns null when id is absent from response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }))
    const email = await fetchPrimaryCalendarEmail('token')
    expect(email).toBeNull()
  })

  it('sends Authorization: Bearer header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'a@b.com' }),
    }))
    await fetchPrimaryCalendarEmail('my-token')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: 'Bearer my-token',
    })
  })
})

// ─── fetchTodaysEvents ───────────────────────────────────────────────────────

describe('fetchTodaysEvents', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns an empty array when no items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }))
    const events = await fetchTodaysEvents('token', 'America/New_York')
    expect(events).toHaveLength(0)
  })

  it('filters out cancelled events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'e1', summary: 'Meeting', status: 'confirmed', start: { dateTime: '2024-01-15T10:00:00-05:00' }, end: { dateTime: '2024-01-15T11:00:00-05:00' } },
          { id: 'e2', summary: 'Cancelled', status: 'cancelled', start: { dateTime: '2024-01-15T12:00:00-05:00' } },
        ],
      }),
    }))
    const events = await fetchTodaysEvents('token', 'America/New_York')
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Meeting')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }))
    await expect(fetchTodaysEvents('bad-token', 'UTC')).rejects.toThrow(/401/)
  })

  it('maps all-day events correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'e1', summary: 'All Day Event', start: { date: '2024-01-15' }, end: { date: '2024-01-16' } },
        ],
      }),
    }))
    const events = await fetchTodaysEvents('token', 'UTC')
    expect(events[0].allDay).toBe(true)
    expect(events[0].startLabel).toBe('All day')
    expect(events[0].endLabel).toBeNull()
  })

  it('handles missing id by generating a fallback id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { summary: 'No ID Event', start: { dateTime: '2024-01-15T09:00:00Z' }, end: { dateTime: '2024-01-15T10:00:00Z' } },
        ],
      }),
    }))
    const events = await fetchTodaysEvents('token', 'UTC')
    expect(events[0].id).toBeTruthy()
  })

  it('handles items being undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }))
    const events = await fetchTodaysEvents('token', 'UTC')
    expect(events).toHaveLength(0)
  })

  it('uses text() throw gracefully on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => { throw new Error('body error') },
    }))
    await expect(fetchTodaysEvents('token', 'UTC')).rejects.toThrow(/500/)
  })
})

// ─── toBriefMeeting ──────────────────────────────────────────────────────────

describe('toBriefMeeting', () => {
  it('formats a timed event', () => {
    const result = toBriefMeeting(
      { id: 'e1', title: 'Standup', location: 'Zoom', startISO: '2024-01-15T14:00:00Z', endISO: '2024-01-15T14:30:00Z', allDay: false },
      'UTC',
    )
    expect(result.id).toBe('e1')
    expect(result.title).toBe('Standup')
    expect(result.allDay).toBe(false)
    expect(result.startLabel).not.toBe('')
    expect(result.endLabel).not.toBeNull()
    expect(result.location).toBe('Zoom')
    expect(result.start).toBe('2024-01-15T14:00:00Z')
  })

  it('formats an all-day event', () => {
    const result = toBriefMeeting(
      { id: 'e2', title: 'Holiday', location: null, startISO: '2024-01-15', endISO: '2024-01-16', allDay: true },
      'UTC',
    )
    expect(result.allDay).toBe(true)
    expect(result.startLabel).toBe('All day')
    expect(result.endLabel).toBeNull()
  })

  it('defaults empty title to (no title)', () => {
    const result = toBriefMeeting(
      { id: 'e3', title: '', location: null, startISO: '2024-01-15T10:00:00Z', endISO: null, allDay: false },
      'UTC',
    )
    expect(result.title).toBe('(no title)')
  })

  it('trims title whitespace', () => {
    const result = toBriefMeeting(
      { id: 'e4', title: '  Padded  ', location: null, startISO: null, endISO: null, allDay: false },
      'UTC',
    )
    expect(result.title).toBe('Padded')
  })

  it('returns null location for empty string', () => {
    const result = toBriefMeeting(
      { id: 'e5', title: 'Meeting', location: '  ', startISO: null, endISO: null, allDay: false },
      'UTC',
    )
    expect(result.location).toBeNull()
  })

  it('returns null endLabel when endISO is null', () => {
    const result = toBriefMeeting(
      { id: 'e6', title: 'Event', location: null, startISO: '2024-01-15T10:00:00Z', endISO: null, allDay: false },
      'UTC',
    )
    expect(result.endLabel).toBeNull()
  })
})

// ─── formatTimeInTz ──────────────────────────────────────────────────────────

describe('formatTimeInTz', () => {
  it('returns empty string for null ISO', () => {
    expect(formatTimeInTz(null, 'UTC')).toBe('')
  })

  it('formats a UTC time correctly', () => {
    // 2024-01-15T14:00:00Z = 2:00 PM UTC
    const result = formatTimeInTz('2024-01-15T14:00:00Z', 'UTC')
    expect(result).toContain('2')
    expect(result).toMatch(/PM|AM|:\d{2}/)
  })

  it('handles invalid timezone gracefully (falls back)', () => {
    // Should not throw; falls back to local format
    expect(() => formatTimeInTz('2024-01-15T14:00:00Z', 'Invalid/Timezone')).not.toThrow()
  })

  it('applies timezone correctly', () => {
    // 2024-01-15T00:00:00Z = 7 PM EST on the previous day, or check it's different from UTC
    const utcResult = formatTimeInTz('2024-01-15T14:00:00Z', 'UTC')
    const nyResult = formatTimeInTz('2024-01-15T14:00:00Z', 'America/New_York')
    // They should differ (UTC+0 vs UTC-5)
    expect(utcResult).not.toBe(nyResult)
  })
})

// ─── getDayBoundsISO ─────────────────────────────────────────────────────────

describe('getDayBoundsISO', () => {
  it('returns timeMin and timeMax strings', () => {
    const { timeMin, timeMax } = getDayBoundsISO('UTC')
    expect(typeof timeMin).toBe('string')
    expect(typeof timeMax).toBe('string')
  })

  it('timeMin starts at T00:00:00', () => {
    const { timeMin } = getDayBoundsISO('UTC')
    expect(timeMin).toContain('T00:00:00')
  })

  it('timeMax starts at T00:00:00 (next day midnight)', () => {
    const { timeMax } = getDayBoundsISO('UTC')
    expect(timeMax).toContain('T00:00:00')
  })

  it('timeMax is a different date than timeMin', () => {
    const { timeMin, timeMax } = getDayBoundsISO('UTC')
    const minDate = timeMin.slice(0, 10)
    const maxDate = timeMax.slice(0, 10)
    expect(minDate).not.toBe(maxDate)
  })

  it('handles invalid timezone gracefully (falls back to UTC offset)', () => {
    expect(() => getDayBoundsISO('Invalid/Zone')).not.toThrow()
    const { timeMin } = getDayBoundsISO('Invalid/Zone')
    expect(timeMin).toContain('+00:00')
  })

  it('includes a timezone offset in the result', () => {
    const { timeMin } = getDayBoundsISO('America/New_York')
    // Should contain either + or - offset
    expect(timeMin).toMatch(/[+-]\d{2}:\d{2}/)
  })
})

// ─── getLocalDateString ──────────────────────────────────────────────────────

describe('getLocalDateString', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = getLocalDateString('UTC')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('handles invalid timezone gracefully', () => {
    expect(() => getLocalDateString('Bad/Zone')).not.toThrow()
    const result = getLocalDateString('Bad/Zone')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
