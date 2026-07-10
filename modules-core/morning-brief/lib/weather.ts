/**
 * Morning Brief - Open-Meteo weather helpers (server only)
 *
 * Open-Meteo is free and requires NO API key. We resolve the user's location
 * from their /settings "City" (+ "Country") field via Open-Meteo's geocoding
 * API, then fetch today's high/low for that location. Plain `fetch`, no SDK.
 */

import { classifyWeatherCode, WEATHER_KIND_LABEL } from '@/modules/morning-brief/lib/weather-codes'

const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

export type TempUnit = 'C' | 'F'

// The handful of countries that use Fahrenheit, by ISO 3166-1 alpha-2 code.
const FAHRENHEIT_COUNTRY_CODES = new Set(['US', 'LR', 'KY', 'BS', 'BZ', 'PW', 'FM', 'MH'])

/**
 * Fahrenheit for the few countries that use it, Celsius otherwise. Takes the
 * ISO country code (from geocoding) — structured and reliable, unlike the
 * user's free-text country field.
 */
export function getTemperatureUnit(countryCode: string | null | undefined): TempUnit {
  return countryCode && FAHRENHEIT_COUNTRY_CODES.has(countryCode.toUpperCase()) ? 'F' : 'C'
}

interface GeoResult {
  latitude: number
  longitude: number
  name: string
  country?: string
  country_code?: string
}

/** Geocode a city name to coordinates, preferring a result in the given country. */
export async function geocodeCity(city: string, country?: string | null): Promise<GeoResult | null> {
  const params = new URLSearchParams({ name: city, count: '5', language: 'en', format: 'json' })
  const res = await fetch(`${GEOCODE_ENDPOINT}?${params.toString()}`)
  if (!res.ok) return null
  const json = (await res.json()) as { results?: GeoResult[] }
  const results = json.results ?? []
  if (results.length === 0) return null

  if (country) {
    const c = country.trim().toLowerCase()
    const match = results.find(
      (r) => (r.country ?? '').toLowerCase() === c || (r.country_code ?? '').toLowerCase() === c,
    )
    if (match) return match
  }
  return results[0]
}

export interface DailyWeather {
  high: number
  low: number
  code: number
}

/** Today's max/min temperature + WMO weather code for a coordinate. */
export async function fetchDailyWeather(lat: number, lon: number, unit: TempUnit): Promise<DailyWeather | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    timezone: 'auto', // bounds "today" by the location's own timezone
    forecast_days: '1',
    temperature_unit: unit === 'F' ? 'fahrenheit' : 'celsius',
  })
  const res = await fetch(`${FORECAST_ENDPOINT}?${params.toString()}`)
  if (!res.ok) return null
  const json = (await res.json()) as {
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; weather_code?: number[] }
  }
  const d = json.daily
  if (!d || !d.temperature_2m_max?.length) return null
  return {
    high: Math.round(d.temperature_2m_max[0]),
    low: Math.round(d.temperature_2m_min?.[0] ?? 0),
    code: d.weather_code?.[0] ?? 0,
  }
}

/** Short, human label for a WMO weather code. */
export function weatherDescription(code: number): string {
  return WEATHER_KIND_LABEL[classifyWeatherCode(code)]
}
