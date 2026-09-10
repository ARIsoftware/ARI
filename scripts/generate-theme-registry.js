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

// Color tokens are HSL component triples in the shadcn convention ("H S% L%",
// no hsl() wrapper) — the app renders them as hsl(var(--token)), so a hex or
// hsl()-wrapped value would silently produce invalid CSS. radius is the one
// non-color token (a CSS length like "0.5rem").
const HSL_TRIPLE = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/

const KNOWN_TOP_LEVEL_FIELDS = new Set([
  'id',
  'name',
  'category',
  'order',
  'colors',
  'defaultFont',
  'defaultFontSize',
])

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
  for (const key of Object.keys(theme)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) {
      errors.push(
        `"${key}" is not a recognized field (allowed: ${[...KNOWN_TOP_LEVEL_FIELDS].join(', ')})`,
      )
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
    for (const [key, value] of Object.entries(theme.colors)) {
      if (!known.has(key)) {
        errors.push(`colors.${key} is not a recognized token`)
      } else if (key !== 'radius' && typeof value === 'string' && !HSL_TRIPLE.test(value)) {
        errors.push(
          `colors.${key} must be HSL components "H S% L%" (e.g. "222 47% 11%"), got ${JSON.stringify(value)}`,
        )
      }
    }
  }
  return errors
}

/**
 * Remove comments from CSS and (optionally) blank out string literal contents,
 * so structural checks don't trip over braces inside comments, url("..."),
 * or content: "{". Returns null when a comment or string never terminates —
 * an unterminated comment would swallow every theme concatenated after it in
 * the aggregate file, so callers must treat null as invalid CSS.
 */
export function stripCssNoise(css, blankStrings = false) {
  let out = ''
  let i = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      if (end === -1) return null // unterminated comment
      i = end + 2
      continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      let literal = ''
      while (j < css.length && css[j] !== ch && css[j] !== '\n') {
        if (css[j] === '\\' && j + 1 < css.length) {
          literal += css[j] + css[j + 1]
          j += 2
        } else {
          literal += css[j]
          j++
        }
      }
      if (j >= css.length || css[j] === '\n') return null // unterminated string
      out += ch + (blankStrings ? '' : literal) + ch
      i = j + 1
      continue
    }
    out += ch
    i++
  }
  return out
}

/**
 * Structural check on a theme.css: one unbalanced brace (or an unterminated
 * comment/string) would corrupt every theme concatenated after it in the
 * aggregate file. Braces inside comments and string literals don't count.
 */
export function cssBracesBalanced(css) {
  const cleaned = stripCssNoise(css, true)
  if (cleaned === null) return false
  let depth = 0
  for (const ch of cleaned) {
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth < 0) return false
    }
  }
  return depth === 0
}

// Split a selector prelude on top-level commas, respecting (), [] nesting so
// :is(a, b) or [attr="x,y"] don't split.
function splitSelectorList(prelude) {
  const members = []
  let depth = 0
  let current = ''
  for (const ch of prelude) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      members.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  members.push(current)
  return members.map((m) => m.trim()).filter(Boolean)
}

// Conditional group at-rules wrap ordinary style rules, so their contents must
// be scope-checked too. Other block at-rules (@keyframes, @font-face, …) have
// opaque contents that aren't selectors.
const GROUP_AT_RULE = /^@(media|supports|layer|container|scope)\b/

/**
 * Every style-rule selector in a theme.css — at the top level, in a
 * comma-separated list, or inside @media/@supports/@layer/@container blocks —
 * must be scoped to the theme's own [data-theme="<id>"], or the rule leaks
 * into every theme. Returns the unscoped selectors found. Assumes the css
 * already passed cssBracesBalanced (unparseable css returns []).
 */
export function findUnscopedSelectors(css, id) {
  const cleaned = stripCssNoise(css, false)
  if (cleaned === null) return []
  // Quote style is a formatting choice ([data-theme="x"], ='x', or =x) —
  // accept all three.
  const scoped = new RegExp(`\\[data-theme=("${id}"|'${id}'|${id})\\]`)
  const offenders = []
  // Context per open block: 'rules' = contents are style/at-rules to check,
  // 'opaque' = contents are declarations or non-selector constructs.
  const contexts = ['rules']
  let buffer = ''
  for (const ch of cleaned) {
    if (ch === '{') {
      const prelude = buffer.trim()
      if (contexts[contexts.length - 1] === 'rules' && prelude) {
        if (prelude.startsWith('@')) {
          contexts.push(GROUP_AT_RULE.test(prelude) ? 'rules' : 'opaque')
        } else {
          for (const member of splitSelectorList(prelude)) {
            if (!scoped.test(member)) offenders.push(member.replace(/\s+/g, ' '))
          }
          contexts.push('opaque')
        }
      } else {
        contexts.push('opaque')
      }
      buffer = ''
    } else if (ch === '}') {
      if (contexts.length > 1) contexts.pop()
      buffer = ''
    } else if (ch === ';' && contexts[contexts.length - 1] === 'rules') {
      buffer = '' // statement at-rule (@import, @charset, …) — not a selector
    } else {
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
    // Include symlinked folders (e.g. themes kept in a dotfiles repo) —
    // Dirent.isDirectory() is false for symlinks-to-directories.
    .filter((e) => {
      if (e.isDirectory()) return true
      if (!e.isSymbolicLink()) return false
      try {
        return fs.statSync(path.join(dirPath, e.name)).isDirectory()
      } catch {
        return false
      }
    })
    .map((e) => e.name)
    .sort() // readdir order is platform-dependent; output must be deterministic

  for (const folder of entries) {
    const folderPath = path.join(dirPath, folder)
    let files
    try {
      files = fs.readdirSync(folderPath)
    } catch {
      continue // unreadable folder — nothing to load
    }
    // Exact-case check: existsSync('theme.json') would match 'Theme.json' on
    // case-insensitive macOS/Windows but not on Linux (Vercel/CI), so the
    // theme would silently vanish in production. Enforce the exact name
    // everywhere and say so.
    if (!files.includes('theme.json')) {
      const variant = files.find((f) => f.toLowerCase() === 'theme.json')
      if (variant) {
        console.warn(
          `⚠️  ${dirName}/${folder}/${variant}: must be named exactly "theme.json" (lowercase) — theme skipped`,
        )
      }
      continue // not a theme folder (e.g. docs)
    }

    let theme
    try {
      theme = JSON.parse(stripBom(fs.readFileSync(path.join(folderPath, 'theme.json'), 'utf-8')))
    } catch (err) {
      errors.push(`${dirName}/${folder}/theme.json: invalid JSON or unreadable (${err.message})`)
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
    const cssVariant = files.find((f) => f.toLowerCase() === 'theme.css')
    if (cssVariant && cssVariant !== 'theme.css') {
      console.warn(
        `⚠️  ${dirName}/${folder}/${cssVariant}: must be named exactly "theme.css" (lowercase) — css ignored`,
      )
    }
    if (files.includes('theme.css')) {
      const cssProblems = []
      try {
        css = stripBom(fs.readFileSync(path.join(folderPath, 'theme.css'), 'utf-8'))
      } catch (err) {
        cssProblems.push(`unreadable (${err.code || err.message})`)
      }
      if (css !== null && !cssBracesBalanced(css)) {
        cssProblems.push(
          'unbalanced braces or unterminated comment/string (would corrupt the aggregated stylesheet)',
        )
      }
      if (css !== null && cssProblems.length === 0) {
        for (const selector of findUnscopedSelectors(css, theme.id)) {
          cssProblems.push(`selector not scoped to [data-theme="${theme.id}"]: ${selector}`)
        }
      }
      if (cssProblems.length > 0) {
        if (dirName === 'themes-core') {
          // Shipped CSS must be valid and scoped — fail the build.
          errors.push(`${dirName}/${folder}/theme.css: ${cssProblems.join('; ')}`)
          continue
        }
        // themes-custom: keep the theme's colors but exclude its CSS —
        // leaking or broken CSS must not restyle every theme or break boot.
        console.warn(`⚠️  ${dirName}/${folder}/theme.css excluded — ${cssProblems.join('; ')}`)
        css = null
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

/**
 * Sort by (order, name); themes without an order go last. Stable, and the
 * name tie-break is plain code-point comparison — localeCompare varies by
 * machine locale, and generated output must be deterministic everywhere.
 */
export function sortThemes(themes) {
  return [...themes].sort((a, b) => {
    const ao = a.theme.order ?? Infinity
    const bo = b.theme.order ?? Infinity
    if (ao !== bo) return ao - bo
    if (a.theme.name < b.theme.name) return -1
    if (a.theme.name > b.theme.name) return 1
    return 0
  })
}

/**
 * The required ids must exist in themes-core specifically — a required id
 * satisfied only by an untracked themes-custom folder would vanish on a fresh
 * clone or Vercel deploy of the same repo.
 */
export function missingRequiredCoreIds(coreThemes) {
  return REQUIRED_THEME_IDS.filter((id) => !coreThemes.some((t) => t.id === id))
}

// Folder names are not validated like ids, and both are interpolated into
// /* ... */ comment headers — a name containing "*/" would terminate the
// comment early and corrupt the generated file.
function commentSafe(text) {
  return String(text).split('*/').join('*∕')
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
    .map((t) => commentSafe(` *   - ${t.id} (from ${t.dirName}/${t.folder})`))
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
      const header = `/* ${commentSafe(`── theme: ${t.id} (from ${t.dirName}/${t.folder}/theme.css) ──`)} */`
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

  // The required ids must live in themes-core itself (not merely be satisfied
  // by an untracked themes-custom override) — see missingRequiredCoreIds.
  const coreScan = scans.find((s) => s.dirName === 'themes-core')
  const missing = missingRequiredCoreIds(coreScan ? coreScan.themes : [])
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
