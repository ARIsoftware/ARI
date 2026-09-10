'use client'

import { useMemo } from 'react'
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDragDropMode } from '@/components/drag-drop-mode-context'

export const SYSTEM_STATUS_KEY = '__system-status__'

// Blue outline + glow shown on every draggable card while drag mode is active.
// Radius is passed per call site so the outline hugs the card's own corners.
export const DRAG_MODE_CLASS =
  'outline outline-[3px] outline-[#60a5fa80] shadow-[0_0_12px_rgba(96,165,250,0.2)] cursor-grab'

export function SortableItem({
  id,
  isDragMode,
  fullHeight,
  radiusClass = 'rounded-[0.8rem]',
  children,
}: {
  id: string
  isDragMode: boolean
  fullHeight?: boolean
  radiusClass?: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

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
      className={`${fullHeight ? 'h-full' : ''} ${
        isDragMode ? `${DRAG_MODE_CLASS} ${radiusClass}` : ''
      }`.trim()}
    >
      {children}
    </div>
  )
}

export interface DashboardCard {
  key: string
  node: React.ReactNode
}

/**
 * A vertical stack of dashboard cards that becomes sortable in drag mode.
 * Order persists through the shared drag-drop context: `kind="stat"` uses
 * statCardOrder, `kind="widget"` uses widgetOrder — the same maps the Boxy
 * layout saves, so cards that appear in both layouts share one saved order.
 */
export function SortableCardStack({
  items,
  kind,
  className,
}: {
  items: DashboardCard[]
  kind: 'stat' | 'widget'
  className?: string
}) {
  const {
    isDragMode,
    statCardOrder,
    pendingStatCardOrder,
    setPendingStatCardOrder,
    widgetOrder,
    pendingWidgetOrder,
    setPendingWidgetOrder,
  } = useDragDropMode()

  const order =
    kind === 'stat' ? pendingStatCardOrder || statCardOrder : pendingWidgetOrder || widgetOrder
  const setPendingOrder = kind === 'stat' ? setPendingStatCardOrder : setPendingWidgetOrder

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const sorted = useMemo(() => {
    if (!order) return items
    return [...items].sort((a, b) => (order[a.key] ?? 9999) - (order[b.key] ?? 9999))
  }, [items, order])

  const itemIds = useMemo(() => sorted.map((item) => item.key), [sorted])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const reordered = arrayMove(
      itemIds,
      itemIds.indexOf(active.id as string),
      itemIds.indexOf(over.id as string),
    )
    const newOrder: Record<string, number> = {}
    reordered.forEach((key, i) => {
      newOrder[key] = i
    })
    setPendingOrder(newOrder)
  }

  if (!isDragMode) {
    return (
      <div className={className}>
        {sorted.map(({ key, node }) => (
          <div key={key}>{node}</div>
        ))}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {sorted.map(({ key, node }) => (
            <SortableItem key={key} id={key} isDragMode radiusClass="rounded-lg">
              {node}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
