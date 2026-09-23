/**
 * Dashboard card catalogue — pure helpers shared by both layouts and the
 * /dashboard/settings "Cards" panel.
 *
 * Every card on the dashboard has a stable key that doubles as its drag-order
 * id: `<moduleId>-stat-<i>` for a module's small stat cards,
 * `<moduleId>-widget-<i>` for its larger cards, and `__system-status__` for
 * the built-in System Status card. Both layouts render the same set of keys,
 * so one per-user visibility list (`hiddenCards` in the dashboard's
 * module_settings) covers Default and Boxy alike.
 */

export const SYSTEM_STATUS_KEY = '__system-status__'

export type DashboardCardKind = 'stat' | 'widget' | 'system'

export interface DashboardCardInfo {
  /** Stable key — also the drag-order id. */
  key: string
  /** Owning module id, or null for built-in cards. */
  moduleId: string | null
  kind: DashboardCardKind
  /** Position within the module's `statCards` / `widgetComponents` list. */
  index: number
  /** Module name, numbered when a module has several cards ("Tasks", "Tasks 2"). */
  label: string
}

/** Minimal slice of ModuleMetadata the catalogue needs. */
export interface DashboardCardModule {
  id: string
  name: string
  dashboard?: { widgets?: boolean } | null
}

/** Shape of the generated registry maps (only the per-module counts matter here). */
export interface DashboardCardRegistry {
  statCards: Record<string, readonly unknown[]>
  widgets: Record<string, readonly unknown[]>
}

/** Per-user settings slice read by the visibility helpers. */
export interface HiddenCardsSettings {
  hiddenCards?: unknown
}

/**
 * Cards hidden until the user says otherwise. Only module-template's demo
 * cards start hidden — every real module's cards show in both layouts.
 * Applies only while the user has never saved a list.
 */
export const DEFAULT_HIDDEN_CARDS: readonly string[] = [
  'module-template-stat-0',
  'module-template-widget-0',
]

export function cardKey(moduleId: string, kind: 'stat' | 'widget', index: number): string {
  return `${moduleId}-${kind}-${index}`
}

/**
 * Every card the dashboard can show for the given (enabled) modules, in
 * module order — a module's stat cards first, then its widgets — followed by
 * the built-in System Status card. Labels are the module name, numbered from
 * the second card onwards.
 */
export function listDashboardCards(
  modules: readonly DashboardCardModule[],
  registry: DashboardCardRegistry,
): DashboardCardInfo[] {
  const cards: DashboardCardInfo[] = []

  for (const mod of modules) {
    if (!mod.dashboard?.widgets) continue
    const statCount = registry.statCards[mod.id]?.length ?? 0
    const widgetCount = registry.widgets[mod.id]?.length ?? 0
    let n = 0
    const label = () => (++n === 1 ? mod.name : `${mod.name} ${n}`)

    for (let i = 0; i < statCount; i++) {
      cards.push({
        key: cardKey(mod.id, 'stat', i),
        moduleId: mod.id,
        kind: 'stat',
        index: i,
        label: label(),
      })
    }
    for (let i = 0; i < widgetCount; i++) {
      cards.push({
        key: cardKey(mod.id, 'widget', i),
        moduleId: mod.id,
        kind: 'widget',
        index: i,
        label: label(),
      })
    }
  }

  cards.push({
    key: SYSTEM_STATUS_KEY,
    moduleId: null,
    kind: 'system',
    index: 0,
    label: 'System Status',
  })

  return cards
}

/**
 * The set of hidden card keys: the user's saved list when one exists (an
 * empty list is a real choice), otherwise the defaults. Anything that isn't a
 * string array (unset, or a shape from an older build) counts as unset.
 */
export function hiddenCardsFor(settings: HiddenCardsSettings | null | undefined): Set<string> {
  const saved = settings?.hiddenCards
  return new Set(
    Array.isArray(saved)
      ? saved.filter((k): k is string => typeof k === 'string')
      : DEFAULT_HIDDEN_CARDS,
  )
}

/** True when two hidden-card sets are equal (order-insensitive). */
export function sameHiddenCards(a: Iterable<string>, b: Iterable<string>): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const key of sa) if (!sb.has(key)) return false
  return true
}

/** Where the Default layout puts each visible card. */
export interface DefaultLayoutColumns {
  /** Left rail: Tasks stat card, System Status, then every other module's cards. */
  left: DashboardCardInfo[]
  /** Middle column: Today's Brief, then the Tasks widgets (Activity, Priority Radar). */
  middle: DashboardCardInfo[]
}

/**
 * Splits the visible cards into the Default layout's columns. The Tasks stat
 * card and System Status lead the left rail, Today's Brief and the Tasks
 * widgets fill the middle, and everything else lands in the left rail (stat
 * cards first, then widgets) in the order `listDashboardCards` gave.
 */
export function defaultLayoutColumns(
  cards: readonly DashboardCardInfo[],
  hidden: ReadonlySet<string>,
): DefaultLayoutColumns {
  const visible = cards.filter((c) => !hidden.has(c.key))
  const byKey = new Map(visible.map((c) => [c.key, c]))
  const placed = new Set<string>()
  const left: DashboardCardInfo[] = []
  const middle: DashboardCardInfo[] = []

  const place = (column: DashboardCardInfo[], key: string) => {
    const card = byKey.get(key)
    if (!card || placed.has(key)) return
    placed.add(key)
    column.push(card)
  }

  place(left, cardKey('tasks', 'stat', 0))
  place(left, SYSTEM_STATUS_KEY)
  place(middle, cardKey('todays-brief', 'widget', 0))
  for (const card of visible) {
    if (card.moduleId === 'tasks' && card.kind === 'widget') place(middle, card.key)
  }
  for (const card of visible) if (card.kind === 'stat') place(left, card.key)
  for (const card of visible) place(left, card.key)

  return { left, middle }
}

/** Where the Boxy layout puts each visible card. */
export interface BoxyLayoutSections {
  /** Quick Overview grid: every stat card plus System Status. */
  stats: DashboardCardInfo[]
  /** Two-column area below: every widget. */
  widgets: DashboardCardInfo[]
}

export function boxyLayoutSections(
  cards: readonly DashboardCardInfo[],
  hidden: ReadonlySet<string>,
): BoxyLayoutSections {
  const visible = cards.filter((c) => !hidden.has(c.key))
  return {
    stats: visible.filter((c) => c.kind !== 'widget'),
    widgets: visible.filter((c) => c.kind === 'widget'),
  }
}

/** Card counts per region, for the layout picker's sketches. */
export interface LayoutSketchCounts {
  default: { left: number; middle: number }
  boxy: { stats: number; widgets: number }
}

export function layoutSketchCounts(
  cards: readonly DashboardCardInfo[],
  hidden: ReadonlySet<string>,
): LayoutSketchCounts {
  const columns = defaultLayoutColumns(cards, hidden)
  const sections = boxyLayoutSections(cards, hidden)
  return {
    default: { left: columns.left.length, middle: columns.middle.length },
    boxy: { stats: sections.stats.length, widgets: sections.widgets.length },
  }
}
