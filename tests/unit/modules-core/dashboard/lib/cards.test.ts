import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HIDDEN_CARDS,
  SYSTEM_STATUS_KEY,
  boxyLayoutSections,
  cardKey,
  defaultLayoutColumns,
  hiddenCardsFor,
  layoutSketchCounts,
  listDashboardCards,
  sameHiddenCards,
} from '@/modules-core/dashboard/lib/cards'

const registry = {
  statCards: {
    tasks: [() => 0],
    brainstorm: [() => 0],
    'module-template': [() => 0],
  },
  widgets: {
    tasks: [() => 0, () => 0],
    portfolio: [() => 0],
    'module-template': [() => 0],
  },
}

const modules = [
  { id: 'tasks', name: 'Tasks', dashboard: { widgets: true } },
  { id: 'portfolio', name: 'Portfolio', dashboard: { widgets: true } },
  { id: 'contacts', name: 'Contacts', dashboard: { widgets: false } },
  { id: 'notes', name: 'Notes' },
  { id: 'brainstorm', name: 'Brainstorm', dashboard: { widgets: true } },
]

describe('cardKey', () => {
  it('matches the drag-order id format', () => {
    expect(cardKey('tasks', 'stat', 0)).toBe('tasks-stat-0')
    expect(cardKey('portfolio', 'widget', 3)).toBe('portfolio-widget-3')
  })
})

describe('listDashboardCards', () => {
  it('lists stat cards then widgets per module, in module order, then System Status', () => {
    const cards = listDashboardCards(modules, registry)
    expect(cards.map((c) => c.key)).toEqual([
      'tasks-stat-0',
      'tasks-widget-0',
      'tasks-widget-1',
      'portfolio-widget-0',
      'brainstorm-stat-0',
      SYSTEM_STATUS_KEY,
    ])
  })

  it('labels cards with the module name, numbering from the second card', () => {
    const cards = listDashboardCards(modules, registry)
    expect(cards.map((c) => c.label)).toEqual([
      'Tasks',
      'Tasks 2',
      'Tasks 3',
      'Portfolio',
      'Brainstorm',
      'System Status',
    ])
  })

  it('records module id, kind and index on each card', () => {
    const cards = listDashboardCards(modules, registry)
    expect(cards[2]).toEqual({
      key: 'tasks-widget-1',
      moduleId: 'tasks',
      kind: 'widget',
      index: 1,
      label: 'Tasks 3',
    })
    expect(cards.at(-1)).toEqual({
      key: SYSTEM_STATUS_KEY,
      moduleId: null,
      kind: 'system',
      index: 0,
      label: 'System Status',
    })
  })

  it('skips modules without dashboard.widgets and modules missing from the registry', () => {
    const cards = listDashboardCards(
      [
        { id: 'contacts', name: 'Contacts', dashboard: { widgets: false } },
        { id: 'notes', name: 'Notes' },
        { id: 'ghost', name: 'Ghost', dashboard: { widgets: true } },
      ],
      registry,
    )
    expect(cards.map((c) => c.key)).toEqual([SYSTEM_STATUS_KEY])
  })

  it('always includes System Status even with no modules', () => {
    expect(listDashboardCards([], registry)).toHaveLength(1)
  })
})

describe('hiddenCardsFor', () => {
  it('falls back to the defaults when nothing is saved', () => {
    expect([...hiddenCardsFor(undefined)]).toEqual(DEFAULT_HIDDEN_CARDS)
    expect([...hiddenCardsFor({})]).toEqual(DEFAULT_HIDDEN_CARDS)
    expect([...hiddenCardsFor(null)]).toEqual(DEFAULT_HIDDEN_CARDS)
  })

  it('uses the saved list, dropping non-string entries', () => {
    expect([...hiddenCardsFor({ hiddenCards: ['portfolio-widget-0', 3, null] })]).toEqual([
      'portfolio-widget-0',
    ])
  })

  it('treats an empty saved list as "show everything"', () => {
    expect(hiddenCardsFor({ hiddenCards: [] }).size).toBe(0)
  })

  it('treats a non-array value (older per-layout shape) as unset', () => {
    expect([...hiddenCardsFor({ hiddenCards: { default: ['x'] } })]).toEqual(DEFAULT_HIDDEN_CARDS)
    expect([...hiddenCardsFor({ hiddenCards: 'x' })]).toEqual(DEFAULT_HIDDEN_CARDS)
  })

  it('only hides the module-template demo cards by default', () => {
    expect(DEFAULT_HIDDEN_CARDS).toEqual(['module-template-stat-0', 'module-template-widget-0'])
  })
})

describe('sameHiddenCards', () => {
  it('compares as sets, ignoring order and duplicates', () => {
    expect(sameHiddenCards(['a', 'b'], ['b', 'a', 'a'])).toBe(true)
    expect(sameHiddenCards([], new Set())).toBe(true)
  })

  it('detects a differing size or member', () => {
    expect(sameHiddenCards(['a'], ['a', 'b'])).toBe(false)
    expect(sameHiddenCards(['a', 'c'], ['a', 'b'])).toBe(false)
  })
})

describe('defaultLayoutColumns', () => {
  const full = [
    { id: 'portfolio', name: 'Portfolio', dashboard: { widgets: true } },
    { id: 'todays-brief', name: "Today's Brief", dashboard: { widgets: true } },
    { id: 'tasks', name: 'Tasks', dashboard: { widgets: true } },
    { id: 'brainstorm', name: 'Brainstorm', dashboard: { widgets: true } },
  ]
  const fullRegistry = {
    statCards: { tasks: [0], brainstorm: [0] },
    widgets: { tasks: [0, 0], portfolio: [0], 'todays-brief': [0] },
  }
  const cards = listDashboardCards(full, fullRegistry)
  const keys = (list: { key: string }[]) => list.map((c) => c.key)

  it('leads the left rail with Tasks stat + System Status, then other stats, then widgets', () => {
    const { left, middle } = defaultLayoutColumns(cards, new Set())
    expect(keys(left)).toEqual([
      'tasks-stat-0',
      SYSTEM_STATUS_KEY,
      'brainstorm-stat-0',
      'portfolio-widget-0',
    ])
    expect(keys(middle)).toEqual(['todays-brief-widget-0', 'tasks-widget-0', 'tasks-widget-1'])
  })

  it('drops hidden cards without disturbing the rest', () => {
    const hidden = new Set(['tasks-stat-0', SYSTEM_STATUS_KEY, 'tasks-widget-1'])
    const { left, middle } = defaultLayoutColumns(cards, hidden)
    expect(keys(left)).toEqual(['brainstorm-stat-0', 'portfolio-widget-0'])
    expect(keys(middle)).toEqual(['todays-brief-widget-0', 'tasks-widget-0'])
  })

  it('never places a card twice', () => {
    const { left, middle } = defaultLayoutColumns(cards, new Set())
    const all = [...keys(left), ...keys(middle)]
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(cards.length)
  })

  it('copes with the anchor cards being absent', () => {
    const only = listDashboardCards(
      [{ id: 'portfolio', name: 'Portfolio', dashboard: { widgets: true } }],
      fullRegistry,
    )
    const { left, middle } = defaultLayoutColumns(only, new Set())
    expect(keys(left)).toEqual([SYSTEM_STATUS_KEY, 'portfolio-widget-0'])
    expect(middle).toEqual([])
  })
})

describe('boxyLayoutSections', () => {
  it('splits stats (incl. System Status) from widgets and drops hidden cards', () => {
    const cards = listDashboardCards(modules, registry)
    const { stats, widgets } = boxyLayoutSections(cards, new Set(['tasks-widget-0']))
    expect(stats.map((c) => c.key)).toEqual([
      'tasks-stat-0',
      'brainstorm-stat-0',
      SYSTEM_STATUS_KEY,
    ])
    expect(widgets.map((c) => c.key)).toEqual(['tasks-widget-1', 'portfolio-widget-0'])
  })
})

describe('layoutSketchCounts', () => {
  it('reports per-region counts for both layouts', () => {
    const cards = listDashboardCards(modules, registry)
    expect(layoutSketchCounts(cards, new Set())).toEqual({
      default: { left: 4, middle: 2 },
      boxy: { stats: 3, widgets: 3 },
    })
    expect(layoutSketchCounts(cards, new Set(cards.map((c) => c.key)))).toEqual({
      default: { left: 0, middle: 0 },
      boxy: { stats: 0, widgets: 0 },
    })
  })
})
