import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// weather.ts imports classifyWeatherCode/WEATHER_KIND_LABEL from
// '@/modules/morning-brief/lib/weather-codes' which resolves to the modules-core
// copy under the @/modules/* alias in tsconfig. In vitest the alias is just
// @/ -> repo-root, so we mock the unresolvable path directly.
vi.mock('@/modules/morning-brief/lib/weather-codes', () => ({
  classifyWeatherCode: (code: number | null) => {
    if (code == null) return 'unknown'
    if (code === 0) return 'clear'
    if (code <= 2) return 'partlyCloudy'
    if (code === 3) return 'overcast'
    if (code === 45 || code === 48) return 'fog'
    if (code >= 51 && code <= 57) return 'drizzle'
    if (code >= 61 && code <= 67) return 'rain'
    if (code >= 71 && code <= 77) return 'snow'
    if (code >= 80 && code <= 82) return 'showers'
    if (code === 85 || code === 86) return 'snowShowers'
    if (code >= 95) return 'thunder'
    return 'unknown'
  },
  WEATHER_KIND_LABEL: {
    clear: 'Clear',
    partlyCloudy: 'Partly cloudy',
    overcast: 'Overcast',
    fog: 'Fog',
    drizzle: 'Drizzle',
    rain: 'Rain',
    snow: 'Snow',
    showers: 'Showers',
    snowShowers: 'Snow showers',
    thunder: 'Thunderstorm',
    unknown: 'Cloudy',
  },
}))

import { getTemperatureUnit, geocodeCity, fetchDailyWeather, weatherDescription } from '@/modules-core/morning-brief/lib/weather'

describe('getTemperatureUnit', () => {
  it('returns F for US', () => {
    expect(getTemperatureUnit('US')).toBe('F')
  })

  it('returns F for lower-case us', () => {
    expect(getTemperatureUnit('us')).toBe('F')
  })

  it('returns F for LR (Liberia)', () => {
    expect(getTemperatureUnit('LR')).toBe('F')
  })

  it('returns F for KY (Cayman Islands)', () => {
    expect(getTemperatureUnit('KY')).toBe('F')
  })

  it('returns F for BS, BZ, PW, FM, MH', () => {
    for (const code of ['BS', 'BZ', 'PW', 'FM', 'MH']) {
      expect(getTemperatureUnit(code)).toBe('F')
    }
  })

  it('returns C for GB (United Kingdom)', () => {
    expect(getTemperatureUnit('GB')).toBe('C')
  })

  it('returns C for CA (Canada)', () => {
    expect(getTemperatureUnit('CA')).toBe('C')
  })

  it('returns C for null', () => {
    expect(getTemperatureUnit(null)).toBe('C')
  })

  it('returns C for undefined', () => {
    expect(getTemperatureUnit(undefined)).toBe('C')
  })

  it('returns C for empty string', () => {
    expect(getTemperatureUnit('')).toBe('C')
  })
})

describe('weatherDescription', () => {
  it('returns Clear for code 0', () => {
    expect(weatherDescription(0)).toBe('Clear')
  })

  it('returns Thunderstorm for code 95', () => {
    expect(weatherDescription(95)).toBe('Thunderstorm')
  })

  it('returns Rain for code 65', () => {
    expect(weatherDescription(65)).toBe('Rain')
  })

  it('returns Cloudy for unknown code 4', () => {
    expect(weatherDescription(4)).toBe('Cloudy')
  })
})

describe('geocodeCity', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    const result = await geocodeCity('UnknownCity')
    expect(result).toBeNull()
  })

  it('returns null when results is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response)
    const result = await geocodeCity('Nowhere')
    expect(result).toBeNull()
  })

  it('returns first result when no country filter', async () => {
    const mockResult = { latitude: 51.5, longitude: -0.1, name: 'London', country: 'United Kingdom', country_code: 'GB' }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [mockResult] }),
    } as Response)
    const result = await geocodeCity('London')
    expect(result).toEqual(mockResult)
  })

  it('prefers matching country name', async () => {
    const uk = { latitude: 51.5, longitude: -0.1, name: 'London', country: 'United Kingdom', country_code: 'GB' }
    const ca = { latitude: 43.0, longitude: -81.2, name: 'London', country: 'Canada', country_code: 'CA' }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [uk, ca] }),
    } as Response)
    const result = await geocodeCity('London', 'Canada')
    expect(result).toEqual(ca)
  })

  it('prefers matching country code', async () => {
    const uk = { latitude: 51.5, longitude: -0.1, name: 'London', country: 'United Kingdom', country_code: 'GB' }
    const ca = { latitude: 43.0, longitude: -81.2, name: 'London', country: 'Canada', country_code: 'CA' }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [uk, ca] }),
    } as Response)
    const result = await geocodeCity('London', 'CA')
    expect(result).toEqual(ca)
  })

  it('falls back to first result when country not matched', async () => {
    const uk = { latitude: 51.5, longitude: -0.1, name: 'London', country: 'United Kingdom', country_code: 'GB' }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [uk] }),
    } as Response)
    const result = await geocodeCity('London', 'ZZ')
    expect(result).toEqual(uk)
  })

  it('includes correct query params in request URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response)
    await geocodeCity('Paris')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('name=Paris')
    expect(url).toContain('count=5')
    expect(url).toContain('language=en')
  })
})

describe('fetchDailyWeather', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    const result = await fetchDailyWeather(51.5, -0.1, 'C')
    expect(result).toBeNull()
  })

  it('returns null when daily data is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ daily: {} }),
    } as Response)
    const result = await fetchDailyWeather(51.5, -0.1, 'C')
    expect(result).toBeNull()
  })

  it('returns null when temperature_2m_max is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ daily: { temperature_2m_max: [] } }),
    } as Response)
    const result = await fetchDailyWeather(51.5, -0.1, 'C')
    expect(result).toBeNull()
  })

  it('returns weather data with rounded values', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        daily: {
          temperature_2m_max: [22.7],
          temperature_2m_min: [11.3],
          weather_code: [3],
        },
      }),
    } as Response)
    const result = await fetchDailyWeather(51.5, -0.1, 'C')
    expect(result).toEqual({ high: 23, low: 11, code: 3 })
  })

  it('defaults low to 0 when temperature_2m_min is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        daily: {
          temperature_2m_max: [25.0],
        },
      }),
    } as Response)
    const result = await fetchDailyWeather(48.8, 2.3, 'C')
    expect(result).toEqual({ high: 25, low: 0, code: 0 })
  })

  it('uses fahrenheit temperature_unit param when unit is F', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        daily: {
          temperature_2m_max: [72.0],
          temperature_2m_min: [55.0],
          weather_code: [0],
        },
      }),
    } as Response)
    await fetchDailyWeather(40.7, -74.0, 'F')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('temperature_unit=fahrenheit')
  })

  it('uses celsius temperature_unit param when unit is C', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        daily: {
          temperature_2m_max: [20.0],
          temperature_2m_min: [10.0],
          weather_code: [0],
        },
      }),
    } as Response)
    await fetchDailyWeather(51.5, -0.1, 'C')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('temperature_unit=celsius')
  })
})
