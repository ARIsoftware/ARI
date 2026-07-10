/**
 * Morning Brief Module - Weather API
 *
 * GET /api/modules/morning-brief/weather
 *
 * Today's high/low for the user's city (from the /settings "City" field),
 * via Open-Meteo (free, no API key). Returns { available: false } gracefully
 * when no city is set or the lookup fails, so the brief simply omits weather
 * rather than erroring.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { WeatherResponseSchema } from '@/modules/morning-brief/lib/validation'
import {
  geocodeCity,
  fetchDailyWeather,
  weatherDescription,
  getTemperatureUnit,
  type TempUnit,
} from '@/modules/morning-brief/lib/weather'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { userPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/weather',
  operationId: 'getMorningBriefWeather',
  summary: "Today's high/low for the user's city via Open-Meteo (no API key)",
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Weather (or { available: false })', content: { 'application/json': { schema: WeatherResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const prefsRows = await withRLS((db) =>
      db.select({ city: userPreferences.city, country: userPreferences.country })
        .from(userPreferences)
        .where(eq(userPreferences.userId, user.id))
        .limit(1)
    )
    const city = prefsRows[0]?.city?.trim() || null
    const country = prefsRows[0]?.country?.trim() || null

    const unavailable = (unit: TempUnit, cityName?: string | null) =>
      NextResponse.json({
        available: false,
        city: cityName ?? city,
        high: null,
        low: null,
        unit,
        code: null,
        description: null,
      })

    if (!city) {
      return unavailable('C')
    }

    try {
      const geo = await geocodeCity(city, country)
      if (!geo) return unavailable('C')

      // The geocoded ISO country code decides the unit (reliable, unlike the
      // free-text country field, which is only used to disambiguate the city).
      const unit = getTemperatureUnit(geo.country_code)
      const weather = await fetchDailyWeather(geo.latitude, geo.longitude, unit)
      if (!weather) return unavailable(unit, geo.name)

      return NextResponse.json({
        available: true,
        city: geo.name || city,
        high: weather.high,
        low: weather.low,
        unit,
        code: weather.code,
        description: weatherDescription(weather.code),
      })
    } catch (err) {
      // Open-Meteo hiccup — degrade gracefully, don't fail the brief.
      console.error('morning-brief weather lookup error:', err instanceof Error ? err.message : err)
      return unavailable('C')
    }
  } catch (error) {
    console.error('GET /api/modules/morning-brief/weather error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
