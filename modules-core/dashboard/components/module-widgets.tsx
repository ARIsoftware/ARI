'use client'

import { ComponentType, useEffect, useMemo, useState } from 'react'
import { useModules } from '@/lib/modules/module-hooks'
import {
  MODULE_DASHBOARD_STAT_CARDS,
  MODULE_DASHBOARD_WIDGETS,
} from '@/lib/generated/module-dashboard-registry'
import { SystemStatusCard } from '@/modules/dashboard/components/system-status-card'
import { useHiddenDashboardCards } from '@/modules/dashboard/hooks/use-dashboard-settings'
import {
  cardKey,
  defaultLayoutColumns,
  listDashboardCards,
  type DashboardCardInfo,
} from '@/modules/dashboard/lib/cards'
import type { DashboardCard } from './sortable-cards'

// Dynamic ESM imports have an unknown module shape; resolveComponent probes
// for `default` or any exported function (same pattern as the Boxy layout's
// dashboard-widgets.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicModule = any

function resolveComponent(mod: DynamicModule): ComponentType | null {
  if (mod.default) return mod.default
  for (const key of Object.keys(mod)) {
    if (typeof mod[key] === 'function') return mod[key]
  }
  return null
}

function DynamicWidget({ loader }: { loader: () => Promise<DynamicModule> }) {
  const [Component, setComponent] = useState<ComponentType | null>(null)

  useEffect(() => {
    let cancelled = false
    loader()
      .then((mod) => {
        if (cancelled) return
        const resolved = resolveComponent(mod)
        if (resolved) setComponent(() => resolved)
      })
      .catch((err) => {
        if (!cancelled) console.warn('Dashboard widget failed to load:', err)
      })
    return () => {
      cancelled = true
    }
  }, [loader])

  if (!Component) return null
  return (
    <div className="h-full [&>*]:h-full [&>*]:rounded-lg">
      <Component />
    </div>
  )
}

/**
 * Builds the Default layout's card lists as keyed items so the columns can be
 * reordered in drag mode. Keys match the Boxy layout's (`tasks-stat-0`,
 * `__system-status__`, `<module>-widget-<i>`, ...), so a card that appears in
 * both layouts shares one saved order and one visibility setting. Placement
 * rules live in `defaultLayoutColumns` (lib/cards.ts) so the settings page
 * can sketch the same arrangement.
 */
export function useDefaultLayoutCards(): {
  leftCards: DashboardCard[]
  middleCards: DashboardCard[]
} {
  const { modules } = useModules()
  const hidden = useHiddenDashboardCards()

  return useMemo(() => {
    const cards = listDashboardCards(modules, {
      statCards: MODULE_DASHBOARD_STAT_CARDS,
      widgets: MODULE_DASHBOARD_WIDGETS,
    })
    const { left, middle } = defaultLayoutColumns(cards, hidden)

    const toCard = (card: DashboardCardInfo): DashboardCard | null => {
      if (card.kind === 'system') {
        return { key: card.key, node: <SystemStatusCard className="rounded-lg" /> }
      }
      const registry = card.kind === 'stat' ? MODULE_DASHBOARD_STAT_CARDS : MODULE_DASHBOARD_WIDGETS
      const loader = registry[card.moduleId!]?.[card.index]
      if (!loader) return null
      let node: React.ReactNode = <DynamicWidget loader={loader} />
      // Today's Brief's own Listen button is hidden — the Default layout has
      // one in its header.
      if (card.key === cardKey('todays-brief', 'widget', 0)) {
        node = <div className="[&_[data-brief-listen]]:hidden">{node}</div>
      }
      return { key: card.key, node }
    }

    const notNull = (c: DashboardCard | null): c is DashboardCard => c !== null
    return {
      leftCards: left.map(toCard).filter(notNull),
      middleCards: middle.map(toCard).filter(notNull),
    }
  }, [modules, hidden])
}
