/**
 * Single source of truth for WMO weather-code classification.
 *
 * Both the server (label) and the client (icon) key off the same `kind`, so the
 * code-range boundaries live in exactly one place and can't drift.
 */

export type WeatherKind =
  | 'clear'
  | 'partlyCloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'showers'
  | 'snowShowers'
  | 'thunder'
  | 'unknown'

export function classifyWeatherCode(code: number | null): WeatherKind {
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
}

export const WEATHER_KIND_LABEL: Record<WeatherKind, string> = {
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
}
