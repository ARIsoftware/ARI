'use client'

import { ComponentType, useEffect, useMemo, useState } from 'react'
import { useModules } from '@/lib/modules/module-hooks'
import {
  MODULE_DASHBOARD_STAT_CARDS,
  MODULE_DASHBOARD_WIDGETS,
} from '@/lib/generated/module-dashboard-registry'

// Modules whose data is already hand-built into the Default layout — their
// generic dashboard cards would duplicate what the page shows.
// module-template is a developer demo and never belongs on a real dashboard.
const EXCLUDED_MODULES = new Set([
  'tasks',
  'morning-brief',
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
 * The Morning Brief module's own dashboard widget, loaded from the generated
 * registry. Renders nothing when the module is disabled.
 */
export function MorningBriefWidget() {
  const { modules } = useModules()
  const enabled = modules.some((m) => m.id === 'morning-brief' && m.dashboard?.widgets)
  const loader = MODULE_DASHBOARD_WIDGETS['morning-brief']?.[0]
  if (!enabled || !loader) return null
  // Hide the widget's own Listen button — the Default layout has one in its header.
  return (
    <div className="[&_[data-brief-listen]]:hidden">
      <DynamicWidget loader={loader} />
    </div>
  )
}

/**
 * The Tasks module's Task Activity chart widget. The registry lists tasks
 * widgets as [dashboard-activity-widget, dashboard-radar-widget] — index 0
 * is Activity.
 */
export function TaskActivityWidget() {
  const { modules } = useModules()
  const enabled = modules.some((m) => m.id === 'tasks' && m.dashboard?.widgets)
  const loader = MODULE_DASHBOARD_WIDGETS['tasks']?.[0]
  if (!enabled || !loader) return null
  return <DynamicWidget loader={loader} />
}

/**
 * Renders the dashboard stat cards and widgets contributed by every other
 * enabled module (portfolio, daily-fitness, ...), straight from the generated
 * registry — new modules appear here with no changes to this page.
 */
export function ModuleWidgets() {
  const { modules } = useModules()

  const enabledIds = useMemo(
    () => new Set(modules.filter((m) => m.dashboard?.widgets).map((m) => m.id)),
    [modules],
  )

  const statLoaders = useMemo(
    () => collectLoaders(MODULE_DASHBOARD_STAT_CARDS, enabledIds, 'stat'),
    [enabledIds],
  )
  const widgetLoaders = useMemo(
    () => collectLoaders(MODULE_DASHBOARD_WIDGETS, enabledIds, 'widget'),
    [enabledIds],
  )

  if (statLoaders.length === 0 && widgetLoaders.length === 0) return null

  // A single vertical stack: rendered inside the page's narrow left column,
  // where the widgets stay compact instead of sprawling across the page.
  return (
    <>
      {statLoaders.map(({ key, loader }) => (
        <DynamicWidget key={key} loader={loader} />
      ))}
      {widgetLoaders.map(({ key, loader }) => (
        <DynamicWidget key={key} loader={loader} />
      ))}
    </>
  )
}
