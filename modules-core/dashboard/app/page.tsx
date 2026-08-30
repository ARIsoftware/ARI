'use client'

import { useDashboardSettings } from '@/modules/dashboard/hooks/use-dashboard-settings'
import { DefaultDashboardLayout } from '@/modules/dashboard/components/default-layout'
import { BoxyDashboardLayout } from '@/modules/dashboard/components/boxy-layout'

export default function DashboardPage() {
  const { data: settings, isPending } = useDashboardSettings()

  // Neutral shell while the layout preference loads so the wrong layout never
  // flashes. Cached for 5 minutes, so only the cold load pays this round-trip.
  if (isPending) return <div className="min-h-[calc(100svh-4rem)]" />

  if ((settings?.layout ?? 'default') === 'boxy') return <BoxyDashboardLayout />
  return <DefaultDashboardLayout />
}
