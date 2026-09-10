import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REQUIRED_COLOR_KEYS,
  OPTIONAL_COLOR_KEYS,
  REQUIRED_THEME_IDS,
  THEME_DIRECTORIES,
  validateTheme,
  cssBracesBalanced,
  findUnscopedSelectors,
  scanThemesDirectory,
  mergeThemes,
  sortThemes,
  toPreset,
  renderRegistry,
  renderStyles,
  missingRequiredCoreIds,
} from '@/scripts/generate-theme-registry.js'
import { CSS_VAR_MAP } from '@/lib/theme/types'

function makeColors(overrides: Record<string, string> = {}) {
  const colors: Record<string, string> = {}
  for (const key of REQUIRED_COLOR_KEYS) colors[key] = '0 0% 50%'
  return { ...colors, ...overrides }
}

function makeTheme(overrides: Record<string, unknown> = {}) {
  return {
    id: 'my-theme',
    name: 'My Theme',
    category: 'dark',
    colors: makeColors(),
    ...overrides,
  }
}

describe('constants', () => {
  it('scans themes-custom before themes-core', () => {
    expect(THEME_DIRECTORIES).toEqual(['themes-custom', 'themes-core'])
  })

  it('requires the ids the app hardcodes', () => {
    expect(REQUIRED_THEME_IDS).toContain('sovereign-day') // DEFAULT_THEME_ID
    expect(REQUIRED_THEME_IDS).toContain('light') // light-layout.tsx
    expect(REQUIRED_THEME_IDS).toContain('default') // toggleDarkMode / migration map
    expect(REQUIRED_THEME_IDS).toContain('dark')
  })

  it('requires every non-optional color token ThemeColors defines', () => {
    // ThemeColors (lib/theme/types.ts) has 33 required tokens + 2 optional
    // topbar tokens (35 total in CSS_VAR_MAP).
    expect(REQUIRED_COLOR_KEYS).toHaveLength(33)
    expect(REQUIRED_COLOR_KEYS).toContain('card')
    expect(REQUIRED_COLOR_KEYS).toContain('popoverForeground')
    expect(REQUIRED_COLOR_KEYS).toContain('radius')
    expect(OPTIONAL_COLOR_KEYS).toEqual(['topbarBackground', 'topbarForeground'])
  })

  it('stays in sync with CSS_VAR_MAP — drift would silently break user themes on upgrade', () => {
    // The generator's key list hand-mirrors ThemeColors; if a token is added
    // to lib/theme/types.ts without updating the generator, every theme
    // carrying it would be rejected as "not a recognized token".
    expect(new Set([...REQUIRED_COLOR_KEYS, ...OPTIONAL_COLOR_KEYS])).toEqual(
      new Set(Object.keys(CSS_VAR_MAP)),
    )
  })
})

describe('missingRequiredCoreIds', () => {
  it('reports ids absent from the core scan even when a custom theme provides them', () => {
    // Required ids must live in themes-core itself: an untracked themes-custom
    // copy vanishes on fresh clones and Vercel deploys.
    const core = [{ id: 'default' }, { id: 'dark' }, { id: 'light' }]
    expect(missingRequiredCoreIds(core)).toEqual(['sovereign-day'])
    expect(missingRequiredCoreIds([])).toEqual(REQUIRED_THEME_IDS)
  })

  it('returns empty when all required ids are shipped', () => {
    expect(missingRequiredCoreIds(REQUIRED_THEME_IDS.map((id: string) => ({ id })))).toEqual([])
  })
})

describe('validateTheme', () => {
  it('accepts a complete theme', () => {
    expect(validateTheme(makeTheme())).toEqual([])
  })

  it('accepts optional fields when well-typed', () => {
    const theme = makeTheme({
      order: 42,
      defaultFont: 'press-start-2p',
      defaultFontSize: '11px',
      colors: makeColors({ topbarBackground: '0 0% 0%', topbarForeground: '0 0% 100%' }),
    })
    expect(validateTheme(theme)).toEqual([])
  })

  it('rejects non-objects', () => {
    expect(validateTheme(null)).toHaveLength(1)
    expect(validateTheme([])).toHaveLength(1)
    expect(validateTheme('nope')).toHaveLength(1)
  })

  it('rejects a missing id', () => {
    expect(validateTheme(makeTheme({ id: undefined }))).toContain('missing "id"')
  })

  it.each(['My Theme', 'UPPER', 'trailing-', '-leading', 'no--double', 'dots.bad', 'a/b'])(
    'rejects invalid id %j (must be lowercase kebab-case)',
    (id) => {
      expect(validateTheme(makeTheme({ id })).join()).toContain('invalid id')
    },
  )

  it('accepts kebab-case ids with digits', () => {
    expect(validateTheme(makeTheme({ id: '8-bit' }))).toEqual([])
  })

  it('rejects a missing name and bad category', () => {
    expect(validateTheme(makeTheme({ name: '' }))).toContain('missing "name"')
    expect(validateTheme(makeTheme({ category: 'sepia' })).join()).toContain('"category"')
  })

  it('rejects a non-numeric order and non-string font fields', () => {
    expect(validateTheme(makeTheme({ order: '10' })).join()).toContain('"order"')
    expect(validateTheme(makeTheme({ defaultFont: 3 })).join()).toContain('"defaultFont"')
    expect(validateTheme(makeTheme({ defaultFontSize: 11 })).join()).toContain('"defaultFontSize"')
  })

  it('rejects missing colors object and reports each missing token', () => {
    expect(validateTheme(makeTheme({ colors: undefined })).join()).toContain('missing "colors"')
    const colors = makeColors()
    delete (colors as Record<string, string>).radius
    delete (colors as Record<string, string>).background
    const errors = validateTheme(makeTheme({ colors }))
    expect(errors.join()).toContain('colors.radius')
    expect(errors.join()).toContain('colors.background')
  })

  it('rejects hex and hsl()-wrapped color values (the most likely paste mistake)', () => {
    expect(
      validateTheme(makeTheme({ colors: makeColors({ background: '#0f172a' }) })).join(),
    ).toContain('colors.background must be HSL components')
    expect(
      validateTheme(makeTheme({ colors: makeColors({ primary: 'hsl(222 47% 11%)' }) })).join(),
    ).toContain('colors.primary must be HSL components')
  })

  it('accepts decimal HSL components and exempts radius from the format check', () => {
    expect(validateTheme(makeTheme({ colors: makeColors({ border: '134 100% 74.5%' }) }))).toEqual(
      [],
    )
    expect(validateTheme(makeTheme({ colors: makeColors({ radius: '0.625rem' }) }))).toEqual([])
  })

  it('rejects unknown top-level fields (typos would otherwise vanish silently)', () => {
    expect(validateTheme(makeTheme({ Order: 25 })).join()).toContain(
      '"Order" is not a recognized field',
    )
    expect(validateTheme(makeTheme({ defaultFontsize: '13.5px' })).join()).toContain(
      '"defaultFontsize" is not a recognized field',
    )
  })

  it('rejects unrecognized and mistyped color tokens', () => {
    expect(validateTheme(makeTheme({ colors: makeColors({ glow: '1 2% 3%' }) })).join()).toContain(
      'colors.glow is not a recognized token',
    )
    expect(
      validateTheme(
        makeTheme({ colors: makeColors({ topbarBackground: 7 as unknown as string }) }),
      ).join(),
    ).toContain('colors.topbarBackground')
  })
})

describe('cssBracesBalanced', () => {
  it('accepts balanced css (including nested at-rules)', () => {
    expect(
      cssBracesBalanced('a { color: red } @media (min-width: 1px) { b { color: blue } }'),
    ).toBe(true)
    expect(cssBracesBalanced('')).toBe(true)
  })

  it('rejects unbalanced braces in either direction', () => {
    expect(cssBracesBalanced('a { color: red')).toBe(false)
    expect(cssBracesBalanced('a } b {')).toBe(false)
  })

  it('ignores braces inside comments (valid css with { in a comment passes)', () => {
    expect(
      cssBracesBalanced("/* fixes the { layout bug */ [data-theme='x'] a { color: red }"),
    ).toBe(true)
  })

  it('ignores braces inside string literals', () => {
    expect(cssBracesBalanced('a { content: "{" }')).toBe(true)
    expect(cssBracesBalanced("a { background: url('img{1}.png') }")).toBe(true)
  })

  it('rejects an unterminated comment (would swallow every theme after it)', () => {
    expect(cssBracesBalanced('a { color: red }\n/* stray')).toBe(false)
  })

  it('rejects an unterminated string', () => {
    expect(cssBracesBalanced('a { content: "oops }')).toBe(false)
  })
})

describe('findUnscopedSelectors', () => {
  it('accepts rules scoped to the theme id', () => {
    const css = '[data-theme="terminal"] .topbar,\n[data-theme="terminal"] header { color: red }'
    expect(findUnscopedSelectors(css, 'terminal')).toEqual([])
  })

  it('accepts single-quoted and unquoted attribute values (Prettier uses single quotes)', () => {
    expect(findUnscopedSelectors("[data-theme='terminal'] a { color: red }", 'terminal')).toEqual(
      [],
    )
    expect(findUnscopedSelectors('[data-theme=terminal] a { color: red }', 'terminal')).toEqual([])
  })

  it('does not accept a partial id match', () => {
    expect(
      findUnscopedSelectors("[data-theme='terminal-amber'] a { color: red }", 'terminal'),
    ).toEqual(["[data-theme='terminal-amber'] a"])
  })

  it('flags top-level selectors missing the scope', () => {
    const css = '.topbar { color: red }\n[data-theme="terminal"] main { color: blue }'
    expect(findUnscopedSelectors(css, 'terminal')).toEqual(['.topbar'])
  })

  it('flags rules scoped to a different theme id', () => {
    expect(findUnscopedSelectors('[data-theme="other"] a { color: red }', 'terminal')).toEqual([
      '[data-theme="other"] a',
    ])
  })

  it('ignores comments and accepts scoped rules inside at-rule blocks', () => {
    const css =
      '/* .decoy { } */\n@media (min-width: 1px) {\n  [data-theme="terminal"] a { color: red }\n}'
    expect(findUnscopedSelectors(css, 'terminal')).toEqual([])
  })

  it('flags unscoped rules inside @media/@supports blocks', () => {
    expect(findUnscopedSelectors('@media (min-width: 1px) { .leak { color: red } }', 't')).toEqual([
      '.leak',
    ])
    expect(findUnscopedSelectors('@supports (display: grid) { body { margin: 0 } }', 't')).toEqual([
      'body',
    ])
  })

  it('flags an unscoped member of a comma-separated selector list', () => {
    expect(findUnscopedSelectors('body, [data-theme="t"] main { color: red }', 't')).toEqual([
      'body',
    ])
  })

  it('does not split commas inside :is() or attribute selectors', () => {
    expect(findUnscopedSelectors('[data-theme="t"] :is(a, b) { color: red }', 't')).toEqual([])
  })

  it('is not masked by a preceding statement at-rule like @import', () => {
    expect(findUnscopedSelectors('@import url(x);\n.foo { color: red }', 't')).toEqual(['.foo'])
  })

  it('does not flag @keyframes frames or @font-face contents', () => {
    const css =
      '@keyframes spin { 0% { opacity: 0 } 100% { opacity: 1 } }\n@font-face { font-family: X; src: url(y) }'
    expect(findUnscopedSelectors(css, 't')).toEqual([])
  })
})

describe('scanThemesDirectory', () => {
  let root: string
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ari-themes-'))
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    warnSpy.mockRestore()
  })

  function writeTheme(dirName: string, folder: string, theme: unknown, css?: string) {
    const dir = path.join(root, dirName, folder)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(theme))
    if (css !== undefined) fs.writeFileSync(path.join(dir, 'theme.css'), css)
  }

  it('returns empty results for a missing directory', () => {
    expect(scanThemesDirectory('themes-custom', root)).toEqual({ themes: [], errors: [] })
  })

  it('reads themes with their css, in sorted folder order', () => {
    writeTheme('themes-core', 'zeta', makeTheme({ id: 'zeta' }))
    writeTheme(
      'themes-core',
      'alpha',
      makeTheme({ id: 'alpha' }),
      '[data-theme="alpha"] a { color: red }',
    )
    const { themes, errors } = scanThemesDirectory('themes-core', root)
    expect(errors).toEqual([])
    expect(themes.map((t: { id: string }) => t.id)).toEqual(['alpha', 'zeta'])
    expect(themes[0].css).toContain('[data-theme="alpha"]')
    expect(themes[1].css).toBeNull()
  })

  it('skips folders without a theme.json (e.g. docs) silently', () => {
    fs.mkdirSync(path.join(root, 'themes-core', 'not-a-theme'), { recursive: true })
    expect(scanThemesDirectory('themes-core', root).themes).toEqual([])
  })

  it('reports invalid JSON and invalid themes as errors, keeping valid ones', () => {
    const dir = path.join(root, 'themes-core', 'broken')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'theme.json'), '{ not json')
    writeTheme('themes-core', 'incomplete', { id: 'incomplete' })
    writeTheme('themes-core', 'good', makeTheme({ id: 'good' }))
    const { themes, errors } = scanThemesDirectory('themes-core', root)
    expect(themes.map((t: { id: string }) => t.id)).toEqual(['good'])
    expect(errors).toHaveLength(2)
    expect(errors.join()).toContain('invalid JSON')
  })

  it('strips a UTF-8 BOM before parsing', () => {
    const dir = path.join(root, 'themes-core', 'bom')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'theme.json'), '﻿' + JSON.stringify(makeTheme({ id: 'bom' })))
    expect(
      scanThemesDirectory('themes-core', root).themes.map((t: { id: string }) => t.id),
    ).toEqual(['bom'])
  })

  it('treats unbalanced theme.css as an error for that theme', () => {
    writeTheme(
      'themes-core',
      'busted',
      makeTheme({ id: 'busted' }),
      '[data-theme="busted"] a { color: red',
    )
    const { themes, errors } = scanThemesDirectory('themes-core', root)
    expect(themes).toEqual([])
    expect(errors.join()).toContain('unbalanced braces')
  })

  it('warns on folder/id mismatch (id wins) and excludes unscoped custom css, keeping the colors', () => {
    writeTheme('themes-custom', 'folder-name', makeTheme({ id: 'real-id' }), '.leak { color: red }')
    const { themes, errors } = scanThemesDirectory('themes-custom', root)
    expect(errors).toEqual([])
    expect(themes[0].id).toBe('real-id')
    expect(themes[0].css).toBeNull() // leaking css must not restyle every theme
    const warnings = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(warnings).toContain("doesn't match theme id")
    expect(warnings).toContain('excluded')
    expect(warnings).toContain('not scoped')
  })

  it('treats unscoped css in themes-core as a hard error', () => {
    writeTheme('themes-core', 'leaky', makeTheme({ id: 'leaky' }), 'body { color: red }')
    const { themes, errors } = scanThemesDirectory('themes-core', root)
    expect(themes).toEqual([])
    expect(errors.join()).toContain('not scoped')
  })

  it('keeps a custom theme whose css is unbalanced, dropping only the css', () => {
    writeTheme('themes-custom', 'busted', makeTheme({ id: 'busted' }), '[data-theme="busted"] a {')
    const { themes, errors } = scanThemesDirectory('themes-custom', root)
    expect(errors).toEqual([])
    expect(themes[0].id).toBe('busted')
    expect(themes[0].css).toBeNull()
  })

  it('keeps a custom theme whose theme.css exists but cannot be read (never breaks boot)', () => {
    writeTheme('themes-custom', 'odd', makeTheme({ id: 'odd' }))
    // a directory named theme.css passes an existence check but fails to read
    fs.mkdirSync(path.join(root, 'themes-custom', 'odd', 'theme.css'))
    const { themes, errors } = scanThemesDirectory('themes-custom', root)
    expect(errors).toEqual([])
    expect(themes[0].id).toBe('odd')
    expect(themes[0].css).toBeNull()
  })

  it('scans a symlinked theme folder', () => {
    writeTheme('themes-elsewhere', 'linked', makeTheme({ id: 'linked' }))
    fs.mkdirSync(path.join(root, 'themes-custom'), { recursive: true })
    fs.symlinkSync(
      path.join(root, 'themes-elsewhere', 'linked'),
      path.join(root, 'themes-custom', 'linked'),
    )
    const { themes } = scanThemesDirectory('themes-custom', root)
    expect(themes.map((t: { id: string }) => t.id)).toEqual(['linked'])
  })

  it('skips a wrongly-cased Theme.json with a warning (would vanish on Linux otherwise)', () => {
    const dir = path.join(root, 'themes-custom', 'cased')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'Theme.json'), JSON.stringify(makeTheme({ id: 'cased' })))
    const { themes } = scanThemesDirectory('themes-custom', root)
    // The scan matches the exact directory-listing name, so this is skipped
    // consistently on every platform — never works-on-mac-vanishes-on-Linux.
    expect(themes).toEqual([])
    const warnings = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(warnings).toContain('theme.json')
    expect(warnings).toContain('lowercase')
  })
})

describe('mergeThemes', () => {
  const entry = (
    dirName: string,
    folder: string,
    theme: Record<string, unknown>,
    css: string | null = null,
  ) => ({
    id: theme.id as string,
    dirName,
    folder,
    theme,
    css,
  })

  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('lets a custom theme fully replace a core theme with the same id (css included)', () => {
    const merged = mergeThemes([
      {
        dirName: 'themes-custom',
        themes: [
          entry(
            'themes-custom',
            'dark',
            makeTheme({ id: 'dark', name: 'My Dark', order: 5 }),
            null,
          ),
        ],
      },
      {
        dirName: 'themes-core',
        themes: [
          entry(
            'themes-core',
            'dark',
            makeTheme({ id: 'dark', name: 'Dark', order: 20 }),
            'core css',
          ),
        ],
      },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].theme.name).toBe('My Dark')
    expect(merged[0].theme.order).toBe(5)
    expect(merged[0].css).toBeNull()
  })

  it('a custom override without an order inherits the core order', () => {
    const merged = mergeThemes([
      {
        dirName: 'themes-custom',
        themes: [entry('themes-custom', 'dark', makeTheme({ id: 'dark', name: 'My Dark' }))],
      },
      {
        dirName: 'themes-core',
        themes: [entry('themes-core', 'dark', makeTheme({ id: 'dark', order: 20 }))],
      },
    ])
    expect(merged[0].theme.order).toBe(20)
    expect(merged[0].theme.name).toBe('My Dark')
  })

  it('keeps the first folder and warns on duplicate ids within one directory', () => {
    const merged = mergeThemes([
      {
        dirName: 'themes-custom',
        themes: [
          entry('themes-custom', 'a-first', makeTheme({ id: 'dupe', name: 'First' })),
          entry('themes-custom', 'b-second', makeTheme({ id: 'dupe', name: 'Second' })),
        ],
      },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].theme.name).toBe('First')
    expect(String(warnSpy.mock.calls[0][0])).toContain('duplicate id')
  })

  it('appends new custom ids alongside core themes', () => {
    const merged = mergeThemes([
      {
        dirName: 'themes-custom',
        themes: [entry('themes-custom', 'extra', makeTheme({ id: 'extra' }))],
      },
      { dirName: 'themes-core', themes: [entry('themes-core', 'dark', makeTheme({ id: 'dark' }))] },
    ])
    expect(merged.map((t: { id: string }) => t.id).sort()).toEqual(['dark', 'extra'])
  })
})

describe('sortThemes', () => {
  const withOrder = (id: string, order?: number, name = id) => ({
    id,
    dirName: 'themes-core',
    folder: id,
    theme: { ...makeTheme({ id, name }), order },
    css: null,
  })

  it('sorts by order, then name; themes without an order go last', () => {
    const sorted = sortThemes([
      withOrder('unordered', undefined, 'Zed'),
      withOrder('second', 20),
      withOrder('first', 10),
      withOrder('also-unordered', undefined, 'Alpha'),
    ])
    expect(sorted.map((t) => t.id)).toEqual(['first', 'second', 'also-unordered', 'unordered'])
  })

  it('does not mutate its input', () => {
    const input = [withOrder('b', 20), withOrder('a', 10)]
    sortThemes(input)
    expect(input.map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('toPreset', () => {
  it('strips order, keeps optional fields, and emits canonical key order', () => {
    const preset = toPreset({
      ...makeTheme({
        id: 't',
        order: 30,
        defaultFont: 'geist',
        defaultFontSize: '12px',
        colors: makeColors({ topbarBackground: '1 1% 1%', topbarForeground: '2 2% 2%' }),
      }),
    })
    expect(preset).not.toHaveProperty('order')
    expect(preset).toHaveProperty('defaultFont', 'geist')
    expect(preset).toHaveProperty('defaultFontSize', '12px')
    const keys = Object.keys(preset.colors)
    // topbar tokens sit between the chart and sidebar tokens, as in ThemeColors
    expect(keys.indexOf('topbarBackground')).toBeGreaterThan(keys.indexOf('chart5'))
    expect(keys.indexOf('topbarForeground')).toBeLessThan(keys.indexOf('sidebarBackground'))
    expect(keys[keys.length - 1]).toBe('radius')
  })

  it('omits absent optional fields entirely (JSON round-trip drops nothing)', () => {
    const preset = toPreset(makeTheme({ id: 't' }))
    expect('defaultFont' in preset).toBe(false)
    expect('defaultFontSize' in preset).toBe(false)
    expect('topbarBackground' in preset.colors).toBe(false)
  })
})

describe('renderRegistry / renderStyles', () => {
  const themes = [
    {
      id: 'one',
      dirName: 'themes-core',
      folder: 'one',
      theme: makeTheme({ id: 'one' }),
      css: '[data-theme="one"] a { color: red }',
    },
    {
      id: 'two',
      dirName: 'themes-custom',
      folder: 'two',
      theme: makeTheme({ id: 'two' }),
      css: null,
    },
  ]

  it('renders a typed, annotated registry module', () => {
    const out = renderRegistry(themes)
    expect(out).toContain('AUTO-GENERATED')
    expect(out).toContain("import type { ThemePreset } from '@/lib/theme/types'")
    expect(out).toContain('export const THEME_PRESETS: ThemePreset[] =')
    expect(out).toContain('- one (from themes-core/one)')
    expect(out).toContain('- two (from themes-custom/two)')
    expect(out).not.toContain('"order"')
  })

  it('renders css blocks for themes that have them, with source headers', () => {
    const out = renderStyles(themes)
    expect(out).toContain('theme: one (from themes-core/one/theme.css)')
    expect(out).toContain('[data-theme="one"] a { color: red }')
    expect(out).not.toContain('theme: two')
  })

  it('renders a banner-only stylesheet when no theme ships css', () => {
    const out = renderStyles([{ ...themes[1] }])
    expect(out).toContain('AUTO-GENERATED')
    expect(out).not.toContain('── theme:')
  })
})
