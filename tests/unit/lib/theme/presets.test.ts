import { describe, it, expect } from 'vitest'
import { THEME_PRESETS, getThemeById, DEFAULT_THEME_ID } from '@/lib/theme/presets'

describe('THEME_PRESETS — data integrity', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(THEME_PRESETS)).toBe(true)
    expect(THEME_PRESETS.length).toBeGreaterThan(0)
  })

  it('every preset has an id, name, and category', () => {
    for (const preset of THEME_PRESETS) {
      expect(typeof preset.id).toBe('string')
      expect(preset.id.length).toBeGreaterThan(0)
      expect(typeof preset.name).toBe('string')
      expect(['light', 'dark']).toContain(preset.category)
    }
  })

  it('every preset has required color tokens', () => {
    const required = [
      'background', 'foreground', 'primary', 'primaryForeground',
      'secondary', 'secondaryForeground', 'muted', 'mutedForeground',
      'accent', 'accentForeground', 'destructive', 'destructiveForeground',
      'border', 'input', 'ring',
      'chart1', 'chart2', 'chart3', 'chart4', 'chart5',
      'sidebarBackground', 'sidebarForeground', 'sidebarPrimary',
      'sidebarPrimaryForeground', 'sidebarAccent', 'sidebarAccentForeground',
      'sidebarBorder', 'sidebarRing', 'radius',
    ] as const

    for (const preset of THEME_PRESETS) {
      for (const key of required) {
        expect(preset.colors[key], `${preset.id} missing ${key}`).toBeTruthy()
      }
    }
  })

  it('preset IDs are unique', () => {
    const ids = THEME_PRESETS.map(p => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('contains the default preset', () => {
    const def = THEME_PRESETS.find(p => p.id === 'default')
    expect(def).toBeDefined()
    expect(def?.name).toBe('Pastel')
    expect(def?.category).toBe('light')
  })

  it('contains dark themes', () => {
    const darkThemes = THEME_PRESETS.filter(p => p.category === 'dark')
    expect(darkThemes.length).toBeGreaterThan(0)
  })

  it('contains light themes', () => {
    const lightThemes = THEME_PRESETS.filter(p => p.category === 'light')
    expect(lightThemes.length).toBeGreaterThan(0)
  })
})

describe('THEME_PRESETS — optional fields', () => {
  it('8-bit preset has defaultFont and defaultFontSize', () => {
    const eightBit = THEME_PRESETS.find(p => p.id === '8-bit')
    expect(eightBit).toBeDefined()
    expect(eightBit?.defaultFont).toBe('press-start-2p')
    expect(eightBit?.defaultFontSize).toBe('11px')
  })

  it('evening-light preset has topbarBackground and topbarForeground', () => {
    const eveningLight = THEME_PRESETS.find(p => p.id === 'evening-light')
    expect(eveningLight).toBeDefined()
    expect(eveningLight?.colors.topbarBackground).toBeDefined()
    expect(eveningLight?.colors.topbarForeground).toBeDefined()
  })

  it('most presets do NOT have topbarBackground', () => {
    const withTopbar = THEME_PRESETS.filter(p => p.colors.topbarBackground !== undefined)
    // Only evening-light is expected to have it
    expect(withTopbar.length).toBeLessThan(THEME_PRESETS.length)
  })
})

describe('getThemeById', () => {
  it('returns the correct preset for a known ID', () => {
    const theme = getThemeById('dark')
    expect(theme).toBeDefined()
    expect(theme?.id).toBe('dark')
    expect(theme?.category).toBe('dark')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getThemeById('nonexistent-theme')).toBeUndefined()
  })

  it('returns the default preset for "default"', () => {
    const theme = getThemeById('default')
    expect(theme?.name).toBe('Pastel')
  })

  it('can find each preset by its own id', () => {
    for (const preset of THEME_PRESETS) {
      const found = getThemeById(preset.id)
      expect(found).toBe(preset)
    }
  })

  it('returns undefined for empty string', () => {
    expect(getThemeById('')).toBeUndefined()
  })
})

describe('DEFAULT_THEME_ID', () => {
  it('is a string', () => {
    expect(typeof DEFAULT_THEME_ID).toBe('string')
  })

  it('matches an existing preset', () => {
    const preset = getThemeById(DEFAULT_THEME_ID)
    expect(preset).toBeDefined()
  })

  it('is "default"', () => {
    expect(DEFAULT_THEME_ID).toBe('default')
  })
})
