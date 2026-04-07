'use client'

import { useEffect, useState, useMemo, ComponentType } from 'react'
import { Loader2 } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useModules } from '@/lib/modules/module-hooks'
import { useDragDropMode } from '@/components/drag-drop-mode-context'
import {
  MODULE_DASHBOARD_STAT_CARDS,
  MODULE_DASHBOARD_WIDGETS,
} from '@/lib/generated/module-dashboard-registry'

// Dynamic ESM imports have an unknown module shape; resolveComponent probes for `default` or any exported function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicModule = any

function WidgetSkeleton() {
  return (
    <div className="flex items-center justify-center h-[120px]">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function useEnabledDashboardModuleIds(): Set<string> {
  const { modules } = useModules()
  return useMemo(
    () => new Set(modules.filter((m) => m.dashboard?.widgets).map((m) => m.id)),
    [modules]
  )
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
    return () => { cancelled = true }
  }, [loader])

  if (failed) return null
  if (!Component) return <WidgetSkeleton />
  return <div className="h-full [&>*]:h-full"><Component /></div>
}

// --- Sortable wrapper ---

const DRAG_MODE_CLASS = 'outline outline-[3px] outline-[#60a5fa80] shadow-[0_0_12px_rgba(96,165,250,0.2)] rounded-lg cursor-grab'

function SortableItem({ id, isDragMode, fullHeight, children }: { id: string; isDragMode: boolean; fullHeight?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 9999 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`${fullHeight ? 'h-full' : ''} ${isDragMode ? DRAG_MODE_CLASS : ''}`.trim()}
    >
      {children}
    </div>
  )
}

// --- System Status card (always shown) ---

function SystemStatusCard() {
  return (
    <Card className="hover:shadow-md transition-shadow h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">System Status</CardTitle>
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-medium">Online</div>
        <p className="text-xs text-muted-foreground">all systems operational</p>
        <Badge variant="secondary" className="mt-2 text-xs">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
          Healthy
        </Badge>
      </CardContent>
    </Card>
  )
}

const SYSTEM_STATUS_KEY = '__system-status__'

// --- Stat cards with sorting + dynamic grid ---

export function DashboardStatCards() {
  const enabledIds = useEnabledDashboardModuleIds()
  const { isDragMode, statCardOrder, pendingStatCardOrder, setPendingStatCardOrder } = useDragDropMode()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const loaders = useMemo(() => {
    const result: { key: string; loader: (() => Promise<DynamicModule>) | null }[] = []
    for (const [moduleId, moduleLoaders] of Object.entries(MODULE_DASHBOARD_STAT_CARDS)) {
      if (!enabledIds.has(moduleId)) continue
      moduleLoaders.forEach((loader, i) => {
        result.push({ key: `${moduleId}-stat-${i}`, loader })
      })
    }
    // System Status card (no loader, rendered inline)
    result.push({ key: SYSTEM_STATUS_KEY, loader: null })
    return result
  }, [enabledIds])

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

  const itemIds = useMemo(() => sortedLoaders.map(l => l.key), [sortedLoaders])
  const totalItems = sortedLoaders.length

  // Tailwind requires full class names at build time — use a static map
  const lgColsClass = totalItems <= 1 ? 'lg:grid-cols-1'
    : totalItems === 2 ? 'lg:grid-cols-2'
    : totalItems === 3 ? 'lg:grid-cols-3'
    : 'lg:grid-cols-4'

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = itemIds.indexOf(active.id as string)
    const newIndex = itemIds.indexOf(over.id as string)
    const reordered = arrayMove(itemIds, oldIndex, newIndex)

    const newOrder: Record<string, number> = {}
    reordered.forEach((key, i) => { newOrder[key] = i })
    setPendingStatCardOrder(newOrder)
  }

  const gridClassName = `grid grid-cols-1 md:grid-cols-2 ${lgColsClass} gap-4`

  const content = sortedLoaders.map(({ key, loader }) => {
    const card = key === SYSTEM_STATUS_KEY
      ? <SystemStatusCard />
      : <DynamicWidget loader={loader!} />

    if (isDragMode) {
      return (
        <SortableItem key={key} id={key} isDragMode fullHeight>
          {card}
        </SortableItem>
      )
    }
    return <div key={key} className="h-full">{card}</div>
  })

  if (isDragMode) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className={gridClassName}>
            {content}
          </div>
        </SortableContext>
      </DndContext>
    )
  }

  return <div className={gridClassName}>{content}</div>
}

// --- Widget area with sorting ---

export function DashboardWidgetArea() {
  const enabledIds = useEnabledDashboardModuleIds()
  const { isDragMode, widgetOrder, pendingWidgetOrder, setPendingWidgetOrder } = useDragDropMode()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const loaders = useMemo(() => {
    const result: { key: string; loader: () => Promise<DynamicModule> }[] = []
    for (const [moduleId, moduleLoaders] of Object.entries(MODULE_DASHBOARD_WIDGETS)) {
      if (!enabledIds.has(moduleId)) continue
      moduleLoaders.forEach((loader, i) => {
        result.push({ key: `${moduleId}-widget-${i}`, loader })
      })
    }
    return result
  }, [enabledIds])

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

  const itemIds = useMemo(() => sortedLoaders.map(l => l.key), [sortedLoaders])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = itemIds.indexOf(active.id as string)
    const newIndex = itemIds.indexOf(over.id as string)
    const reordered = arrayMove(itemIds, oldIndex, newIndex)

    const newOrder: Record<string, number> = {}
    reordered.forEach((key, i) => { newOrder[key] = i })
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {widgetContent}
          </div>
        </SortableContext>
      </DndContext>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {widgetContent}
    </div>
  )
}
