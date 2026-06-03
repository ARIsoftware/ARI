/**
 * Icon Utilities for Modules
 *
 * Modules declare icons by string name in their `module.json` (e.g.
 * `"icon": "CheckSquare"`), so the registry is consulted at runtime — we don't
 * know which icons are needed at compile time.
 *
 * Strategy:
 *   1. Sidebar-and-chrome icons that render above the fold on every
 *      authenticated page are statically imported (PRELOADED_ICONS). Any
 *      flicker on these would be visible to the user.
 *   2. Every other icon is loaded on demand via lucide-react's official
 *      `dynamicIconImports` map, which Next.js code-splits per icon. The full
 *      lucide-react catalog (~1500 icons) is NOT bundled into the main chunk.
 *
 * Public API (getLucideIcon) is unchanged so call sites need no updates.
 */

import dynamic from 'next/dynamic'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import {
  BarChart3, BookOpen, CheckSquare, Clock, Dumbbell, FileBox, Ghost,
  Hand, LineChart, MessageSquare, Music, Network, Package, PawPrint,
  Pencil, Plus, Quote, Radar, StickyNote, Users,
} from 'lucide-react'
import type { LucideIcon, LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'

/**
 * Above-the-fold icons. These are declared in every module's module.json
 * and render in the sidebar nav before any user interaction. They stay
 * statically imported to avoid first-paint flicker.
 *
 * To keep this set tight, only icons referenced from a module.json icon
 * field belong here. Icons that only render inside dialogs or settings
 * pages should NOT be added — let them lazy-load.
 */
const PRELOADED_ICONS: Record<string, LucideIcon> = {
  BarChart3, BookOpen, CheckSquare, Clock, Dumbbell, FileBox, Ghost,
  Hand, LineChart, MessageSquare, Music, Network, Package, PawPrint,
  Pencil, Plus, Quote, Radar, StickyNote, Users,
}

const FALLBACK_ICON: LucideIcon = Package

/**
 * Lucide renamed several icons between versions and dropped the old kebab
 * keys from `dynamicIconImports`. PascalCase → kebab conversion alone would
 * miss them, so map them explicitly to the canonical kebab key.
 *
 * Verified against lucide-react@0.454.0's `dynamicIconImports.js`. When
 * upgrading lucide, re-run the diff (see notes in PR) to refresh this map.
 */
const ICON_NAME_ALIASES: Record<string, string> = {
  AlertCircle: 'circle-alert',
  AlertTriangle: 'triangle-alert',
  BarChart: 'chart-bar',
  BarChart3: 'chart-column',
  CheckCircle: 'circle-check-big',
  CheckSquare: 'square-check-big',
  Columns: 'columns-2',
  Edit: 'square-pen',
  Grid: 'grid-3x3',
  Grid3x3: 'grid-3x3',
  HelpCircle: 'circle-help',
  Home: 'house',
  Layout: 'panels-top-left',
  LineChart: 'chart-line',
  Loader2: 'loader-circle',
  MoreHorizontal: 'ellipsis',
  MoreVertical: 'ellipsis-vertical',
  PieChart: 'chart-pie',
  Sidebar: 'panel-left',
  SortAsc: 'arrow-up-narrow-wide',
  SortDesc: 'arrow-down-wide-narrow',
  Unlock: 'lock-open',
  Volume2: 'volume-2',
  XCircle: 'circle-x',
}

/**
 * PascalCase → kebab-case rule used by lucide for `dynamicIconImports` keys.
 * Insert a hyphen at every PascalCase boundary (uppercase letter preceded by
 * a lowercase letter or digit), then lowercase the result.
 *
 * Examples: 'CheckSquare' → 'check-square', 'AArrowDown' → 'a-arrow-down'.
 *
 * Edge cases (e.g. 'Home' → 'house', 'Grid3x3' → 'grid-3x3') are handled by
 * ICON_NAME_ALIASES above and never reach this function.
 */
function pascalToLucideKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

type DynamicIconLoader = () => Promise<{ default: LucideIcon }>
type IconComponent = ComponentType<LucideProps>

const dynamicCache = new Map<string, IconComponent>()

/**
 * Get a Lucide icon component by name.
 *
 * @param iconName - Name from `module.json` (e.g. "Package", "CheckSquare")
 * @returns A renderable component. Preloaded icons return the real
 *   `LucideIcon`; other names return a `next/dynamic` wrapper that loads the
 *   icon's chunk on first render. Unknown names fall back to `Package` and
 *   log a console warning.
 *
 * @example
 *   const Icon = getLucideIcon('CheckSquare')
 *   return <Icon className="w-4 h-4" />
 */
export function getLucideIcon(iconName?: string): IconComponent {
  if (!iconName) return FALLBACK_ICON

  const preloaded = PRELOADED_ICONS[iconName]
  if (preloaded) return preloaded

  const cached = dynamicCache.get(iconName)
  if (cached) return cached

  const kebab = ICON_NAME_ALIASES[iconName] ?? pascalToLucideKebab(iconName)
  const loader = (dynamicIconImports as Record<string, DynamicIconLoader>)[kebab]
  if (!loader) {
    console.warn(`[Icon Utils] Unknown icon "${iconName}" (kebab: "${kebab}"). Falling back to Package.`)
    return FALLBACK_ICON
  }

  const LazyIcon = dynamic(loader, {
    ssr: true,
    loading: () => null,
  })
  dynamicCache.set(iconName, LazyIcon)
  return LazyIcon
}
