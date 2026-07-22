/**
 * Tests for lib/modules/icon-utils.ts
 *
 * getLucideIcon() is the only public export. It has 4 branches:
 *   1. No name (undefined / empty) → FALLBACK_ICON (Package)
 *   2. Name is in PRELOADED_ICONS   → returns the static import directly
 *   3. Name in dynamicCache         → returns cached component
 *   4a. Name maps via ICON_NAME_ALIASES → dynamic(loader)
 *   4b. Name maps via pascalToLucideKebab → dynamic(loader)
 *   5. Unknown name                 → FALLBACK_ICON + console.warn
 *
 * vi.mock factories are hoisted — they cannot reference top-level variables.
 * We use inline factory objects instead.
 */
import { describe, it, expect, vi } from 'vitest'

// ── vi.mock MUST NOT reference top-level const before initialization ──────────

// Capture loading callbacks so tests can invoke them for coverage
const capturedLoadingCallbacks: Array<() => null> = []

vi.mock('next/dynamic', () => {
  let counter = 0
  return {
    default: (_loader: unknown, _opts: unknown) => {
      counter++
      const fn = () => null
      ;(fn as unknown as Record<string, unknown>).displayName = `DynamicIcon${counter}`
      // Capture the loading callback so we can call it in a test
      if (_opts && typeof (_opts as any).loading === 'function') {
        capturedLoadingCallbacks.push((_opts as any).loading)
      }
      return fn
    },
  }
})

vi.mock('lucide-react', () => {
  const makeIcon = (name: string) => {
    const fn = () => null
    ;(fn as unknown as Record<string, unknown>).displayName = name
    return fn
  }
  return {
    BarChart3: makeIcon('BarChart3'),
    BookOpen: makeIcon('BookOpen'),
    CheckSquare: makeIcon('CheckSquare'),
    Clock: makeIcon('Clock'),
    Dumbbell: makeIcon('Dumbbell'),
    FileBox: makeIcon('FileBox'),
    Ghost: makeIcon('Ghost'),
    Hand: makeIcon('Hand'),
    LineChart: makeIcon('LineChart'),
    MessageSquare: makeIcon('MessageSquare'),
    Music: makeIcon('Music'),
    Network: makeIcon('Network'),
    Package: makeIcon('Package'),
    PawPrint: makeIcon('PawPrint'),
    Newspaper: makeIcon('Newspaper'),
    Pencil: makeIcon('Pencil'),
    Plus: makeIcon('Plus'),
    Quote: makeIcon('Quote'),
    Radar: makeIcon('Radar'),
    StickyNote: makeIcon('StickyNote'),
    Users: makeIcon('Users'),
  }
})

vi.mock('lucide-react/dynamicIconImports', () => {
  const makeIcon = (name: string) => {
    const fn = () => null
    ;(fn as unknown as Record<string, unknown>).displayName = name
    return fn
  }
  return {
    default: {
      'chart-column': () => Promise.resolve({ default: makeIcon('BarChart3Dynamic') }),
      'square-check-big': () => Promise.resolve({ default: makeIcon('CheckSquareDynamic') }),
      'circle-check-big': () => Promise.resolve({ default: makeIcon('CheckCircleDynamic') }),
      'arrow-down-wide-narrow': () => Promise.resolve({ default: makeIcon('SortDescDynamic') }),
      'arrow-up-narrow-wide': () => Promise.resolve({ default: makeIcon('SortAscDynamic') }),
      'shield': () => Promise.resolve({ default: makeIcon('ShieldDynamic') }),
      'star': () => Promise.resolve({ default: makeIcon('StarDynamic') }),
      // 'unknown-icon' is intentionally absent → fallback path
    },
  }
})

// Import AFTER mocks are set up
import { getLucideIcon } from '@/lib/modules/icon-utils'
import { Package, CheckSquare, BarChart3 } from 'lucide-react'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('getLucideIcon — no name (fallback)', () => {
  it('returns Package icon when called with undefined', () => {
    const Icon = getLucideIcon(undefined)
    expect(Icon).toBe(Package)
  })
})

describe('getLucideIcon — preloaded icons', () => {
  it('returns the statically imported Package icon', () => {
    const Icon = getLucideIcon('Package')
    expect(Icon).toBe(Package)
  })

  it('returns the statically imported CheckSquare icon', () => {
    const Icon = getLucideIcon('CheckSquare')
    expect(Icon).toBe(CheckSquare)
  })

  it('returns the statically imported BarChart3 icon', () => {
    const Icon = getLucideIcon('BarChart3')
    expect(Icon).toBe(BarChart3)
  })
})

describe('getLucideIcon — alias lookup (ICON_NAME_ALIASES)', () => {
  it('returns a dynamic component for an aliased name (SortDesc → arrow-down-wide-narrow)', () => {
    const Icon = getLucideIcon('SortDesc')
    expect(Icon).not.toBe(Package)
    expect(typeof Icon).toBe('function')
  })

  it('returns a dynamic component for CheckCircle alias', () => {
    const Icon = getLucideIcon('CheckCircle')
    expect(Icon).not.toBe(Package)
    expect(typeof Icon).toBe('function')
  })
})

describe('getLucideIcon — pascal-to-kebab conversion', () => {
  it('returns a dynamic component for an icon with pascalCase name (Star)', () => {
    const Icon = getLucideIcon('Star')
    expect(Icon).not.toBe(Package)
    expect(typeof Icon).toBe('function')
  })

  it('returns a dynamic component for Shield', () => {
    const Icon = getLucideIcon('Shield')
    expect(Icon).not.toBe(Package)
    expect(typeof Icon).toBe('function')
  })
})

describe('getLucideIcon — caching', () => {
  it('returns the same component on repeated calls for the same icon name', () => {
    const Icon1 = getLucideIcon('Star')
    const Icon2 = getLucideIcon('Star')
    expect(Icon1).toBe(Icon2)
  })

  it('different dynamic icons return different components', () => {
    const IconA = getLucideIcon('Shield')
    const IconB = getLucideIcon('SortAsc')
    expect(IconA).not.toBe(IconB)
  })
})

describe('getLucideIcon — unknown icon (fallback + warn)', () => {
  it('returns Package for a completely unknown icon name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Icon = getLucideIcon('ThisIconDoesNotExistAtAll')
    expect(Icon).toBe(Package)
    warnSpy.mockRestore()
  })

  it('logs a console.warn for unknown icons', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getLucideIcon('AbsolutelyUnknownIconXyz')
    // console.warn is called with a single formatted string
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown icon'),
    )
    warnSpy.mockRestore()
  })
})

describe('getLucideIcon — loading callback coverage', () => {
  it('the loading: () => null callback passed to next/dynamic returns null', () => {
    // Ensure a dynamic icon has been loaded so the loading callback was captured
    getLucideIcon('Star') // this is a dynamic icon (in dynamicIconImports)
    // At least one loading callback should have been captured
    expect(capturedLoadingCallbacks.length).toBeGreaterThan(0)
    // Call the loading callback to cover the anonymous function in the source
    const result = capturedLoadingCallbacks[0]()
    expect(result).toBeNull()
  })
})
