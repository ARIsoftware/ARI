'use client'

import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DASHBOARD_LAYOUTS, type DashboardLayout } from '@/modules/dashboard/lib/validation'
import type { LayoutSketchCounts } from '@/modules/dashboard/lib/cards'

const LAYOUT_OPTIONS: { id: DashboardLayout; name: string; description: string }[] = [
  {
    id: 'default',
    name: 'Default',
    description: "Clean three-column layout with Today's Brief front and center.",
  },
  {
    id: 'boxy',
    name: 'Boxy',
    description: 'Stat-card grid with module widgets and a right-hand tasks rail.',
  },
]

/** Sketches cap how many blocks they draw so a long card list stays legible. */
const MAX_SKETCH_BLOCKS = 6

function Blocks({
  count,
  className,
  direction = 'col',
}: {
  count: number
  className: string
  direction?: 'col' | 'row'
}) {
  const shown = Math.min(count, MAX_SKETCH_BLOCKS)
  return (
    <>
      {Array.from({ length: shown }, (_, i) => (
        <div
          key={i}
          className={`${direction === 'col' ? 'min-h-1.5 flex-1' : 'h-4 flex-1'} rounded-sm ${className}`}
        />
      ))}
    </>
  )
}

/**
 * Tiny CSS sketch of each layout, drawn from the live card counts so hiding a
 * card (even before saving) is reflected in the picker. The tasks rail on the
 * right is part of the page itself, not a card, so it's always drawn.
 */
function LayoutSketch({ layout, counts }: { layout: DashboardLayout; counts: LayoutSketchCounts }) {
  if (layout === 'boxy') {
    const { stats, widgets } = counts.boxy
    return (
      <div className="flex h-20 w-full gap-1.5 rounded-md border bg-muted/40 p-2">
        <div className="flex flex-1 flex-col gap-1.5">
          {stats > 0 && (
            <div className="flex gap-1.5">
              <Blocks count={Math.min(stats, 4)} direction="row" className="bg-primary/25" />
            </div>
          )}
          {widgets > 0 && (
            <div className="grid flex-1 grid-cols-2 gap-1.5">
              <Blocks count={Math.min(widgets, 4)} className="bg-primary/15" />
            </div>
          )}
        </div>
        <div className="w-1/4 rounded-sm bg-primary/25" />
      </div>
    )
  }
  const { left, middle } = counts.default
  return (
    <div className="flex h-20 w-full gap-1.5 rounded-md border bg-muted/40 p-2">
      <div className="flex w-1/4 flex-col gap-1.5">
        <Blocks count={left} className="bg-primary/15" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Blocks count={middle} className="bg-primary/25" />
      </div>
      <div className="w-1/4 rounded-sm bg-primary/15" />
    </div>
  )
}

interface DashboardSettingsPanelProps {
  /** Layout to highlight — the unsaved pick when there is one, else the saved layout. */
  value: DashboardLayout
  /** True when `value` differs from what is saved. */
  dirty: boolean
  saving: boolean
  counts: LayoutSketchCounts
  onChange: (layout: DashboardLayout) => void
  onSave: () => void
  onDiscard: () => void
}

/**
 * Layout picker. Clicking a layout only highlights it; the parent page owns
 * the draft and persists it on Save (or through the unsaved-changes guard).
 */
export function DashboardSettingsPanel({
  value,
  dirty,
  saving,
  counts,
  onChange,
  onSave,
  onDiscard,
}: DashboardSettingsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>Layout</CardTitle>
          {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
        </div>
        <CardDescription>
          Choose how your dashboard is arranged. Applies only to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {LAYOUT_OPTIONS.map((option) => {
            const selected = DASHBOARD_LAYOUTS.includes(option.id) && option.id === value
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={saving}
                onClick={() => onChange(option.id)}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  selected
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <LayoutSketch layout={option.id} counts={counts} />
                <p className="mt-3 font-medium">{option.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
              </button>
            )
          })}
        </div>
        <div className="flex max-w-2xl items-center justify-end gap-2">
          {dirty && (
            <Button variant="ghost" onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button onClick={onSave} disabled={!dirty || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
