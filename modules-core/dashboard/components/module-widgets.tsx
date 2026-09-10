'use client'

import { ComponentType, useEffect, useMemo, useState } from 'react'
import { useModules } from '@/lib/modules/module-hooks'
import {
  MODULE_DASHBOARD_STAT_CARDS,
  MODULE_DASHBOARD_WIDGETS,
} from '@/lib/generated/module-dashboard-registry'
import { SystemStatusCard } from '@/modules/dashboard/components/system-status-card'
import { SYSTEM_STATUS_KEY, type DashboardCard } from './sortable-cards'

// Modules whose data is already hand-built into the Default layout — their
// generic dashboard cards would duplicate what the page shows.
// module-template is a developer demo and never belongs on a real dashboard.
const EXCLUDED_MODULES = new Set([
  'tasks',
  'todays-brief',
  'agents',
  'brainstorm',
  'module-template',
])

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

function collectLoaders(
  registry: Record<string, (() => Promise<DynamicModule>)[]>,
  enabledIds: Set<string>,
  kind: string,
) {
  const result: { key: string; loader: () => Promise<DynamicModule> }[] = []
  for (const [moduleId, loaders] of Object.entries(registry)) {
    if (!enabledIds.has(moduleId) || EXCLUDED_MODULES.has(moduleId)) continue
    loaders.forEach((loader, i) => result.push({ key: `${moduleId}-${kind}-${i}`, loader }))
  }
  return result
}

/**
 * Builds the Default layout's card lists as keyed items so the columns can be
 * reordered in drag mode. Keys match the Boxy layout's (`tasks-stat-0`,
 * `__system-status__`, `<module>-widget-<i>`, ...), so a card that appears in
 * both layouts shares one saved order.
 */
export function useDefaultLayoutCards(): {
  leftCards: DashboardCard[]
  middleCards: DashboardCard[]
} {
  const { modules } = useModules()

  const enabledIds = useMemo(
    () => new Set(modules.filter((m) => m.dashboard?.widgets).map((m) => m.id)),
    [modules],
  )

  return useMemo(() => {
    const leftCards: DashboardCard[] = []

    // The Tasks module's Total Tasks stat card (registry index 0)
    const tasksStatLoader = MODULE_DASHBOARD_STAT_CARDS['tasks']?.[0]
    if (enabledIds.has('tasks') && tasksStatLoader) {
      leftCards.push({ key: 'tasks-stat-0', node: <DynamicWidget loader={tasksStatLoader} /> })
    }

    // System health at a glance — badge links to /health
    leftCards.push({
      key: SYSTEM_STATUS_KEY,
      node: <SystemStatusCard className="rounded-lg" />,
    })

    // Dashboard cards from every other enabled module (portfolio, ...),
    // straight from the generated registry — new modules appear here with no
    // changes to this page.
    for (const { key, loader } of collectLoaders(MODULE_DASHBOARD_STAT_CARDS, enabledIds, 'stat')) {
      leftCards.push({ key, node: <DynamicWidget loader={loader} /> })
    }
    for (const { key, loader } of collectLoaders(MODULE_DASHBOARD_WIDGETS, enabledIds, 'widget')) {
      leftCards.push({ key, node: <DynamicWidget loader={loader} /> })
    }

    const middleCards: DashboardCard[] = []

    // The Today's Brief module's own dashboard widget — its Listen button is
    // hidden because the Default layout has one in its header.
    const briefLoader = MODULE_DASHBOARD_WIDGETS['todays-brief']?.[0]
    if (enabledIds.has('todays-brief') && briefLoader) {
      middleCards.push({
        key: 'todays-brief-widget-0',
        node: (
          <div className="[&_[data-brief-listen]]:hidden">
            <DynamicWidget loader={briefLoader} />
          </div>
        ),
      })
    }

    // The Tasks module's Task Activity chart widget. The registry lists tasks
    // widgets as [dashboard-activity-widget, dashboard-radar-widget] — index 0
    // is Activity.
    const taskActivityLoader = MODULE_DASHBOARD_WIDGETS['tasks']?.[0]
    if (enabledIds.has('tasks') && taskActivityLoader) {
      middleCards.push({
        key: 'tasks-widget-0',
        node: <DynamicWidget loader={taskActivityLoader} />,
      })
    }

    return { leftCards, middleCards }
  }, [enabledIds])
}
