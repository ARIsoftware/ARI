#!/usr/bin/env node
/**
 * Generate lib/generated/theme-registry.ts and lib/generated/theme-styles.css
 * from the file-based theme folders:
 *
 *   themes-custom/<id>/theme.json  (highest priority — user themes, untracked)
 *   themes-core/<id>/theme.json    (shipped themes, overwritten on upgrade)
 *
 * Each folder may also carry a theme.css with rules scoped to
 * [data-theme="<id>"]. A themes-custom folder whose theme.json declares the
 * same id as a core theme fully replaces it (json AND css) — same override
 * model as modules-custom.
 *
 * The theme data is INLINED into a generated .ts file (never read from disk at
 * runtime): serverless bundles don't trace bare .json/.css files, so a runtime
 * fs.readFile would ENOENT on Vercel — same constraint documented in
 * generate-module-registry.js for module schema.sql files.
 *
 * Problems in themes-custom are warnings (a broken user theme must never break
 * boot); problems in themes-core are hard errors (the shipped set must be
 * valid). Idempotent: skips writing when output is byte-identical.
 *
 * Called from generate-module-registry.js main(), so it runs on predev,
 * prebuild, CI, dev-boot (instrumentation.ts), and `./ari doctor` — no extra
 * wiring. Also runnable standalone: node scripts/generate-theme-registry.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Priority order (first wins), mirroring MODULE_DIRECTORIES in
// generate-module-registry.js.
export const THEME_DIRECTORIES = ['themes-custom', 'themes-core']

const REGISTRY_FILE = path.join('lib', 'generated', 'theme-registry.ts')
const STYLES_FILE = path.join('lib', 'generated', 'theme-styles.css')

// Every color token a theme must define (mirrors the required part of
// ThemeColors in lib/theme/types.ts; also asserted by
// tests/unit/lib/theme/presets.test.ts).
export const REQUIRED_COLOR_KEYS = [
  'background',
  'foreground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveForeground',
  'border',
  'input',
  'ring',
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
  'sidebarBackground',
  'sidebarForeground',
  'sidebarPrimary',
  'sidebarPrimaryForeground',
  'sidebarAccent',
  'sidebarAccentForeground',
  'sidebarBorder',
  'sidebarRing',
  'radius',
]

export const OPTIONAL_COLOR_KEYS = ['topbarBackground', 'topbarForeground']

// Theme ids end up in CSS selectors, data-theme attributes, and the inline
// pre-paint script in app/layout.tsx — keep them to safe kebab-case. Also
// avoids same-id-different-case folder collisions on case-insensitive
// filesystems (macOS/Windows).
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Ids the app hardcodes: DEFAULT_THEME_ID (presets.ts), the /welcome layout
// (light-layout.tsx uses 'light'), and toggleDarkMode + the legacy migration
// map in theme-context.tsx ('default'/'dark'). Removing any of these from
// themes-core breaks boot, so generation fails loudly instead.
export const REQUIRED_THEME_IDS = ['default', 'dark', 'light', 'sovereign-day']

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Validate one parsed theme.json. Returns a list of problems (empty = valid).
 */
export function validateTheme(theme) {
  const errors = []
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return ['theme.json must contain a JSON object']
  }
  if (typeof theme.id !== 'string' || theme.id.length === 0) {
    errors.push('missing "id"')
  } else if (!ID_PATTERN.test(theme.id)) {
    errors.push(`invalid id "${theme.id}" (lowercase kebab-case only, e.g. "my-theme")`)
  }
  if (typeof theme.name !== 'string' || theme.name.length === 0) {
    errors.push('missing "name"')
  }
  if (theme.category !== 'light' && theme.category !== 'dark') {
    errors.push(`"category" must be "light" or "dark" (got ${JSON.stringify(theme.category)})`)
  }
  if (theme.order !== undefined && typeof theme.order !== 'number') {
    errors.push('"order" must be a number when present')
  }
  for (const key of ['defaultFont', 'defaultFontSize']) {
    if (theme[key] !== undefined && typeof theme[key] !== 'string') {
      errors.push(`"${key}" must be a string when present`)
    }
  }
  if (!theme.colors || typeof theme.colors !== 'object' || Array.isArray(theme.colors)) {
    errors.push('missing "colors" object')
  } else {
    for (const key of REQUIRED_COLOR_KEYS) {
      if (typeof theme.colors[key] !== 'string' || theme.colors[key].length === 0) {
        errors.push(`colors.${key} missing or not a string`)
      }
    }
    for (const key of OPTIONAL_COLOR_KEYS) {
      if (theme.colors[key] !== undefined && typeof theme.colors[key] !== 'string') {
        errors.push(`colors.${key} must be a string when present`)
      }
    }
    const known = new Set([...REQUIRED_COLOR_KEYS, ...OPTIONAL_COLOR_KEYS])
    for (const key of Object.keys(theme.colors)) {
      if (!known.has(key)) {
        errors.push(`colors.${key} is not a recognized token`)
      }
    }
  }
  return errors
}

/**
 * Cheap structural check on a theme.css: one unbalanced brace would corrupt
 * every theme concatenated after it in the aggregate file.
 */
export function cssBracesBalanced(css) {
  let depth = 0
  for (const ch of css) {
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth < 0) return false
    }
  }
  return depth === 0
}

/**
 * Every top-level selector in a theme.css should be scoped to the theme's own
 * [data-theme="<id>"] — an unscoped selector leaks into every theme. Returns
 * the unscoped top-level selectors found (best-effort heuristic; comments are
 * stripped, nested braces are skipped).
 */
export function findUnscopedSelectors(css, id) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Quote style is a formatting choice ([data-theme="x"], ='x', or =x) —
  // accept all three.
  const scoped = new RegExp(`\\[data-theme=("${id}"|'${id}'|${id})\\]`)
  const offenders = []
  let depth = 0
  let buffer = ''
  for (const ch of noComments) {
    if (ch === '{') {
      if (depth === 0) {
        const selector = buffer.trim()
        // At-rules (@media, @supports, …) wrap their own rules; the inner
        // selectors surface on the next depth-0 pass, so skip the at-rule line.
        if (selector && !selector.startsWith('@') && !scoped.test(selector)) {
          offenders.push(selector.replace(/\s+/g, ' '))
        }
        buffer = ''
      }
      depth++
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1)
      buffer = ''
    } else if (depth === 0) {
      buffer += ch
    }
  }
  return offenders
}

/**
 * Scan one themes directory. Returns { themes, errors } where each theme is
 * { id, dirName, folder, theme, css } and each error is a human-readable
 * string. Missing directory is fine (themes-custom is absent on fresh
 * clones/Vercel). Never throws for content problems — the caller decides
 * whether errors are fatal (core) or warnings (custom).
 */
export function scanThemesDirectory(dirName, rootDir = ROOT) {
  const dirPath = path.join(rootDir, dirName)
  const themes = []
  const errors = []
  if (!fs.existsSync(dirPath)) return { themes, errors }

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort() // readdir order is platform-dependent; output must be deterministic

  for (const folder of entries) {
    const jsonPath = path.join(dirPath, folder, 'theme.json')
    if (!fs.existsSync(jsonPath)) continue // not a theme folder (e.g. docs)

    let theme
    try {
      theme = JSON.parse(stripBom(fs.readFileSync(jsonPath, 'utf-8')))
    } catch (err) {
      errors.push(`${dirName}/${folder}/theme.json: invalid JSON (${err.message})`)
      continue
    }

    const problems = validateTheme(theme)
    if (problems.length > 0) {
      errors.push(`${dirName}/${folder}/theme.json: ${problems.join('; ')}`)
      continue
    }

    if (theme.id !== folder) {
      console.warn(
        `⚠️  ${dirName}/${folder}: folder name doesn't match theme id "${theme.id}" (the id wins)`,
      )
    }

    let css = null
    const cssPath = path.join(dirPath, folder, 'theme.css')
    if (fs.existsSync(cssPath)) {
      css = stripBom(fs.readFileSync(cssPath, 'utf-8'))
      if (!cssBracesBalanced(css)) {
        errors.push(
          `${dirName}/${folder}/theme.css: unbalanced braces (would corrupt the aggregated stylesheet)`,
        )
        continue
      }
      for (const selector of findUnscopedSelectors(css, theme.id)) {
        console.warn(
          `⚠️  ${dirName}/${folder}/theme.css: selector not scoped to [data-theme="${theme.id}"]: ${selector}`,
        )
      }
    }

    themes.push({ id: theme.id, dirName, folder, theme, css })
  }

  return { themes, errors }
}

/**
 * Merge scans in THEME_DIRECTORIES priority order: first occurrence of an id
 * wins (custom over core, first folder within a directory on duplicates).
 * A custom override that omits "order" inherits the core theme's order so it
 * doesn't jump to the end of the picker.
 */
export function mergeThemes(scansByDirectory) {
  const map = new Map()
  for (const { dirName, themes } of scansByDirectory) {
    for (const entry of themes) {
      if (map.has(entry.id)) {
        const winner = map.get(entry.id)
        if (winner.dirName !== dirName) {
          console.log(
            `  ↳ ${dirName}/${entry.folder} overridden by ${winner.dirName}/${winner.folder} (same id "${entry.id}")`,
          )
          if (winner.theme.order === undefined && entry.theme.order !== undefined) {
            winner.theme = { ...winner.theme, order: entry.theme.order }
          }
        } else {
          console.warn(
            `⚠️  ${dirName}/${entry.folder}: duplicate id "${entry.id}" — keeping ${winner.dirName}/${winner.folder}`,
          )
        }
        continue
      }
      map.set(entry.id, { ...entry })
    }
  }
  return [...map.values()]
}

/** Sort by (order, name); themes without an order go last. Stable. */
export function sortThemes(themes) {
  return [...themes].sort((a, b) => {
    const ao = a.theme.order ?? Infinity
    const bo = b.theme.order ?? Infinity
    if (ao !== bo) return ao - bo
    return a.theme.name.localeCompare(b.theme.name)
  })
}

// Emit order for color keys — mirrors the ThemeColors declaration order in
// lib/theme/types.ts (optional topbar tokens sit between charts and sidebar).
const EMIT_COLOR_ORDER = [
  ...REQUIRED_COLOR_KEYS.slice(0, REQUIRED_COLOR_KEYS.indexOf('sidebarBackground')),
  ...OPTIONAL_COLOR_KEYS,
  ...REQUIRED_COLOR_KEYS.slice(REQUIRED_COLOR_KEYS.indexOf('sidebarBackground')),
]

/**
 * Emit shape: exactly a ThemePreset — fixed key order, generation-only fields
 * ("order") stripped, optional fields omitted when absent so
 * JSON.stringify output matches the legacy presets byte-for-byte in shape.
 */
export function toPreset(theme) {
  const colors = {}
  for (const key of EMIT_COLOR_ORDER) {
    if (theme.colors[key] !== undefined) colors[key] = theme.colors[key]
  }
  const preset = { id: theme.id, name: theme.name, category: theme.category, colors }
  if (theme.defaultFont !== undefined) preset.defaultFont = theme.defaultFont
  if (theme.defaultFontSize !== undefined) preset.defaultFontSize = theme.defaultFontSize
  return preset
}

export function renderRegistry(sortedThemes) {
  const presets = sortedThemes.map((t) => toPreset(t.theme))
  const sources = sortedThemes
    .map((t) => ` *   - ${t.id} (from ${t.dirName}/${t.folder})`)
    .join('\n')
  return (
    `// AUTO-GENERATED by scripts/generate-theme-registry.js — DO NOT EDIT.\n` +
    `// Sources: themes-custom/ (highest priority), themes-core/\n` +
    `// Run \`pnpm run generate-module-registry\` to regenerate.\n` +
    `/*\n * Themes in display order:\n${sources}\n */\n` +
    `import type { ThemePreset } from '@/lib/theme/types'\n\n` +
    `export const THEME_PRESETS: ThemePreset[] = ${JSON.stringify(presets, null, 2)}\n`
  )
}

export function renderStyles(sortedThemes) {
  const banner =
    `/* AUTO-GENERATED by scripts/generate-theme-registry.js — DO NOT EDIT.\n` +
    ` * Aggregated per-theme CSS from themes-custom/ and themes-core/\n` +
    ` * ([data-theme="<id>"]-scoped rules). Imported by app/layout.tsx after\n` +
    ` * globals.css. Run \`pnpm run generate-module-registry\` to regenerate. */\n`
  const blocks = sortedThemes
    .filter((t) => t.css !== null)
    .map((t) => {
      const header = `/* ── theme: ${t.id} (from ${t.dirName}/${t.folder}/theme.css) ── */`
      return `${header}\n\n${t.css.trim()}\n`
    })
  return blocks.length > 0 ? `${banner}\n${blocks.join('\n')}` : banner
}

function writeIfChanged(filePath, content) {
  let existing = null
  try {
    existing = fs.readFileSync(filePath, 'utf-8')
  } catch {
    // File doesn't exist yet — fall through and write.
  }
  if (existing === content) return false
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
}

export default function generateThemeRegistry(rootDir = ROOT) {
  const scans = THEME_DIRECTORIES.map((dirName) => {
    const { themes, errors } = scanThemesDirectory(dirName, rootDir)
    if (errors.length > 0) {
      if (dirName === 'themes-core') {
        // Shipped themes must be valid — fail the generation (and the build).
        for (const error of errors) console.error(`❌ ${error}`)
        process.exit(1)
      }
      // User themes must never break boot — warn and continue without them.
      for (const error of errors) console.warn(`⚠️  Skipping theme — ${error}`)
    }
    return { dirName, themes }
  })

  const sorted = sortThemes(mergeThemes(scans))

  const missing = REQUIRED_THEME_IDS.filter((id) => !sorted.some((t) => t.id === id))
  if (sorted.length === 0 || missing.length > 0) {
    console.error(
      sorted.length === 0
        ? '❌ No valid themes found — themes-core/ is missing or empty'
        : `❌ themes-core/ is missing required theme id(s): ${missing.join(', ')} (the app hardcodes these)`,
    )
    process.exit(1)
  }

  fs.mkdirSync(path.join(rootDir, 'lib', 'generated'), { recursive: true })

  const registryChanged = writeIfChanged(path.join(rootDir, REGISTRY_FILE), renderRegistry(sorted))
  const stylesChanged = writeIfChanged(path.join(rootDir, STYLES_FILE), renderStyles(sorted))
  const cssCount = sorted.filter((t) => t.css !== null).length

  if (registryChanged || stylesChanged) {
    console.log(
      `✅ Theme registry generated at: ${REGISTRY_FILE} (${sorted.length} themes, ${cssCount} with CSS)`,
    )
  } else {
    console.log(
      `✅ Theme registry already up-to-date (${sorted.length} themes, ${cssCount} with CSS)`,
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateThemeRegistry()
}
