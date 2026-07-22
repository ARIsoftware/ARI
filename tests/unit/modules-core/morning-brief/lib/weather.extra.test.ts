/**
 * Extra coverage for morning-brief/lib/weather.ts.
 *
 * Targets:
 * - geocodeCity: results array missing (json.results is undefined) → falls back to []
 * - fetchDailyWeather: json.daily is undefined (no .daily key at all)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/modules/morning-brief/lib/weather-codes', () => ({
  classifyWeatherCode: () => 'clear',
  WEATHER_KIND_LABEL: { clear: 'Clear' },
}))

import { geocodeCity, fetchDailyWeather } from '@/modules-core/morning-brief/lib/weather'

describe('geocodeCity — missing results key', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns null when response JSON has no results key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // no 'results' key
    } as Response)
    const result = await geocodeCity('Tokyo')
    expect(result).toBeNull()
  })
})

describe('fetchDailyWeather — missing daily key', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns null when response has no daily field at all', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // no 'daily' key
    } as Response)
    const result = await fetchDailyWeather(51.5, -0.1, 'C')
    expect(result).toBeNull()
  })
})
