'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { DASHBOARD_LAYOUTS, type DashboardLayout } from '@/modules/dashboard/lib/validation'
import {
  useDashboardSettings,
  useUpdateDashboardSettings,
} from '@/modules/dashboard/hooks/use-dashboard-settings'

const LAYOUT_OPTIONS: { id: DashboardLayout; name: string; description: string }[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Clean three-column layout with the Morning Brief front and center.',
  },
  {
    id: 'boxy',
    name: 'Boxy',
    description: 'Stat-card grid with module widgets and a right-hand tasks rail.',
  },
]

/** Tiny CSS sketch of each layout so the picker reads at a glance. */
function LayoutSketch({ layout }: { layout: DashboardLayout }) {
  if (layout === 'boxy') {
    return (
      <div className="flex h-20 w-full gap-1.5 rounded-md border bg-muted/40 p-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex gap-1.5">
            <div className="h-4 flex-1 rounded-sm bg-primary/25" />
            <div className="h-4 flex-1 rounded-sm bg-primary/25" />
            <div className="h-4 flex-1 rounded-sm bg-primary/25" />
          </div>
          <div className="flex-1 rounded-sm bg-primary/15" />
        </div>
        <div className="w-1/4 rounded-sm bg-primary/25" />
      </div>
    )
  }
  return (
    <div className="flex h-20 w-full gap-1.5 rounded-md border bg-muted/40 p-2">
      <div className="w-1/4 rounded-sm bg-primary/15" />
      <div className="flex-1 rounded-sm bg-primary/25" />
      <div className="w-1/4 rounded-sm bg-primary/15" />
    </div>
  )
}

export function DashboardSettingsPanel() {
  const { data: settings } = useDashboardSettings()
  const updateSettings = useUpdateDashboardSettings()
  const { toast } = useToast()

  const activeLayout: DashboardLayout = settings?.layout ?? 'default'

  const selectLayout = (layout: DashboardLayout) => {
    if (layout === activeLayout) return
    updateSettings.mutate(
      { layout },
      {
        onError: (err) =>
          toast({
            variant: 'destructive',
            title: 'Could not save layout',
            description: err instanceof Error ? err.message : 'Please try again.',
          }),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Layout</CardTitle>
        <CardDescription>
          Choose how your dashboard is arranged. Applies instantly and only to your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {LAYOUT_OPTIONS.map((option) => {
            const selected = DASHBOARD_LAYOUTS.includes(option.id) && option.id === activeLayout
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectLayout(option.id)}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  selected
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <LayoutSketch layout={option.id} />
                <p className="mt-3 font-medium">{option.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
