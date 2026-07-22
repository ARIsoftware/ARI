import { describe, it, expect } from 'vitest'
import { classifyWeatherCode, WEATHER_KIND_LABEL } from '@/modules-core/morning-brief/lib/weather-codes'

describe('classifyWeatherCode', () => {
  it('returns unknown for null', () => {
    expect(classifyWeatherCode(null)).toBe('unknown')
  })

  it('code 0 is clear', () => {
    expect(classifyWeatherCode(0)).toBe('clear')
  })

  it('code 1 is partlyCloudy', () => {
    expect(classifyWeatherCode(1)).toBe('partlyCloudy')
  })

  it('code 2 is partlyCloudy', () => {
    expect(classifyWeatherCode(2)).toBe('partlyCloudy')
  })

  it('code 3 is overcast', () => {
    expect(classifyWeatherCode(3)).toBe('overcast')
  })

  it('code 45 is fog', () => {
    expect(classifyWeatherCode(45)).toBe('fog')
  })

  it('code 48 is fog', () => {
    expect(classifyWeatherCode(48)).toBe('fog')
  })

  it('code 51 is drizzle (start of range)', () => {
    expect(classifyWeatherCode(51)).toBe('drizzle')
  })

  it('code 57 is drizzle (end of range)', () => {
    expect(classifyWeatherCode(57)).toBe('drizzle')
  })

  it('code 61 is rain (start of range)', () => {
    expect(classifyWeatherCode(61)).toBe('rain')
  })

  it('code 67 is rain (end of range)', () => {
    expect(classifyWeatherCode(67)).toBe('rain')
  })

  it('code 71 is snow (start of range)', () => {
    expect(classifyWeatherCode(71)).toBe('snow')
  })

  it('code 77 is snow (end of range)', () => {
    expect(classifyWeatherCode(77)).toBe('snow')
  })

  it('code 80 is showers (start of range)', () => {
    expect(classifyWeatherCode(80)).toBe('showers')
  })

  it('code 82 is showers (end of range)', () => {
    expect(classifyWeatherCode(82)).toBe('showers')
  })

  it('code 85 is snowShowers', () => {
    expect(classifyWeatherCode(85)).toBe('snowShowers')
  })

  it('code 86 is snowShowers', () => {
    expect(classifyWeatherCode(86)).toBe('snowShowers')
  })

  it('code 95 is thunder (start of range)', () => {
    expect(classifyWeatherCode(95)).toBe('thunder')
  })

  it('code 99 is thunder (beyond 95)', () => {
    expect(classifyWeatherCode(99)).toBe('thunder')
  })

  it('code 4 is unknown (gap between overcast and fog)', () => {
    expect(classifyWeatherCode(4)).toBe('unknown')
  })

  it('code 50 is unknown (gap between overcast/fog and drizzle)', () => {
    expect(classifyWeatherCode(50)).toBe('unknown')
  })

  it('code 83 is unknown (gap between showers and snowShowers)', () => {
    expect(classifyWeatherCode(83)).toBe('unknown')
  })
})

describe('WEATHER_KIND_LABEL', () => {
  it('has a label for every kind', () => {
    const kinds = [
      'clear', 'partlyCloudy', 'overcast', 'fog', 'drizzle',
      'rain', 'snow', 'showers', 'snowShowers', 'thunder', 'unknown',
    ] as const
    for (const kind of kinds) {
      expect(WEATHER_KIND_LABEL[kind]).toBeTruthy()
      expect(typeof WEATHER_KIND_LABEL[kind]).toBe('string')
    }
  })

  it('unknown maps to Cloudy', () => {
    expect(WEATHER_KIND_LABEL.unknown).toBe('Cloudy')
  })

  it('thunder maps to Thunderstorm', () => {
    expect(WEATHER_KIND_LABEL.thunder).toBe('Thunderstorm')
  })

  it('snowShowers maps to Snow showers', () => {
    expect(WEATHER_KIND_LABEL.snowShowers).toBe('Snow showers')
  })
})
