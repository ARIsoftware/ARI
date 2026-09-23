'use client'

import { useEffect, useState, useMemo, ComponentType } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { Activity } from 'lucide-react'
import { useModules } from '@/lib/modules/module-hooks'
import { useDragDropMode } from '@/components/drag-drop-mode-context'
import {
  MODULE_DASHBOARD_STAT_CARDS,
  MODULE_DASHBOARD_WIDGETS,
} from '@/lib/generated/module-dashboard-registry'
import { SystemStatusCard } from '@/modules/dashboard/components/system-status-card'
import { useHiddenDashboardCards } from '@/modules/dashboard/hooks/use-dashboard-settings'
import { boxyLayoutSections, listDashboardCards } from '@/modules/dashboard/lib/cards'
import { SortableItem, SYSTEM_STATUS_KEY } from './sortable-cards'

// Dynamic ESM imports have an unknown module shape; resolveComponent probes for `default` or any exported function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicModule = any

/** Visible cards split into Boxy's two sections (lib/cards.ts owns the rules). */
function useBoxySections() {
  const { modules } = useModules()
  // Cards the user switched off at /dashboard/settings — never mounted.
  const hidden = useHiddenDashboardCards()
  return useMemo(() => {
    const cards = listDashboardCards(modules, {
      statCards: MODULE_DASHBOARD_STAT_CARDS,
      widgets: MODULE_DASHBOARD_WIDGETS,
    })
    return boxyLayoutSections(cards, hidden)
  }, [modules, hidden])
}

/**
 * Resolves the component from a dynamic import module.
 * Handles both `export default` and named-only exports (takes the first exported function).
 */
function resolveComponent(mod: DynamicModule): ComponentType | null {
  if (mod.default) return mod.default
  for (const key of Object.keys(mod)) {
    if (typeof mod[key] === 'function') return mod[key]
  }
  return null
}

function DynamicWidget({ loader }: { loader: () => Promise<DynamicModule> }) {
  const [Component, setComponent] = useState<ComponentType | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loader()
      .then((mod) => {
        if (cancelled) return
        const resolved = resolveComponent(mod)
        if (resolved) {
          setComponent(() => resolved)
        } else {
          console.warn('Dashboard widget: no exportable component found in module')
          setFailed(true)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Dashboard widget failed to load:', err)
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [loader])

  if (failed) return null
  // Render nothing while the chunk loads — widget pops in when ready.
  // Chunks are cached after first load, so this is invisible on warm navigations.
  if (!Component) return null
  return (
    <div className="h-full [&>*]:h-full [&>*]:rounded-[0.8rem]">
      <Component />
    </div>
  )
}

// --- Stat cards with sorting + dynamic grid ---

export function DashboardStatCards() {
  const { stats } = useBoxySections()
  const { isDragMode, statCardOrder, pendingStatCardOrder, setPendingStatCardOrder } =
    useDragDropMode()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loaders = useMemo(() => {
    const result: { key: string; loader: (() => Promise<DynamicModule>) | null }[] = []
    for (const card of stats) {
      // System Status card (no loader, rendered inline)
      if (card.kind === 'system') {
        result.push({ key: card.key, loader: null })
        continue
      }
      // Index access isn't checked by TS — a stale saved key can miss.
      const loader = MODULE_DASHBOARD_STAT_CARDS[card.moduleId!]?.[card.index] as
        (() => Promise<DynamicModule>) | undefined
      if (loader) result.push({ key: card.key, loader })
    }
    return result
  }, [stats])

  // Sort items by saved order
  const sortedLoaders = useMemo(() => {
    const order = pendingStatCardOrder || statCardOrder
    if (!order) return loaders
    return [...loaders].sort((a, b) => {
      const pa = order[a.key] ?? 9999
      const pb = order[b.key] ?? 9999
      return pa - pb
    })
  }, [loaders, statCardOrder, pendingStatCardOrder])

  const itemIds = useMemo(() => sortedLoaders.map((l) => l.key), [sortedLoaders])
  const totalItems = sortedLoaders.length

  // Tailwind requires full class names at build time — use a static map
  const lgColsClass =
    totalItems <= 1
      ? 'lg:grid-cols-1'
      : totalItems === 2
        ? 'lg:grid-cols-2'
        : totalItems === 3
          ? 'lg:grid-cols-3'
          : 'lg:grid-cols-4'

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = itemIds.indexOf(active.id as string)
    const newIndex = itemIds.indexOf(over.id as string)
    const reordered = arrayMove(itemIds, oldIndex, newIndex)

    const newOrder: Record<string, number> = {}
    reordered.forEach((key, i) => {
      newOrder[key] = i
    })
    setPendingStatCardOrder(newOrder)
  }

  const gridClassName = `grid grid-cols-1 md:grid-cols-2 ${lgColsClass} gap-4`

  // Every stat card hidden — drop the whole Quick Overview section rather
  // than leave its heading over an empty grid.
  if (sortedLoaders.length === 0) return null

  const content = sortedLoaders.map(({ key, loader }) => {
    const card =
      key === SYSTEM_STATUS_KEY ? (
        <SystemStatusCard className="rounded-[0.8rem] h-full" />
      ) : (
        <DynamicWidget loader={loader!} />
      )

    if (isDragMode) {
      return (
        <SortableItem key={key} id={key} isDragMode fullHeight>
          {card}
        </SortableItem>
      )
    }
    return (
      <div key={key} className="h-full">
        {card}
      </div>
    )
  })

  const grid = isDragMode ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        <div className={gridClassName}>{content}</div>
      </SortableContext>
    </DndContext>
  ) : (
    <div className={gridClassName}>{content}</div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-emerald-600" />
        <h2 className="text-xl font-medium">Quick Overview</h2>
      </div>
      {grid}
    </div>
  )
}

// --- Widget area with sorting ---

export function DashboardWidgetArea() {
  const { widgets } = useBoxySections()
  const { isDragMode, widgetOrder, pendingWidgetOrder, setPendingWidgetOrder } = useDragDropMode()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loaders = useMemo(() => {
    const result: { key: string; loader: () => Promise<DynamicModule> }[] = []
    for (const card of widgets) {
      const loader = MODULE_DASHBOARD_WIDGETS[card.moduleId!]?.[card.index] as
        (() => Promise<DynamicModule>) | undefined
      if (loader) result.push({ key: card.key, loader })
    }
    return result
  }, [widgets])

  // Sort items by saved order
  const sortedLoaders = useMemo(() => {
    const order = pendingWidgetOrder || widgetOrder
    if (!order) return loaders
    return [...loaders].sort((a, b) => {
      const pa = order[a.key] ?? 9999
      const pb = order[b.key] ?? 9999
      return pa - pb
    })
  }, [loaders, widgetOrder, pendingWidgetOrder])

  const itemIds = useMemo(() => sortedLoaders.map((l) => l.key), [sortedLoaders])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = itemIds.indexOf(active.id as string)
    const newIndex = itemIds.indexOf(over.id as string)
    const reordered = arrayMove(itemIds, oldIndex, newIndex)

    const newOrder: Record<string, number> = {}
    reordered.forEach((key, i) => {
      newOrder[key] = i
    })
    setPendingWidgetOrder(newOrder)
  }

  if (loaders.length === 0) return null

  const widgetContent = sortedLoaders.map(({ key, loader }) => {
    if (isDragMode) {
      return (
        <SortableItem key={key} id={key} isDragMode>
          <DynamicWidget loader={loader} />
        </SortableItem>
      )
    }
    return <DynamicWidget key={key} loader={loader} />
  })

  if (isDragMode) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{widgetContent}</div>
        </SortableContext>
      </DndContext>
    )
  }

  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{widgetContent}</div>
}
