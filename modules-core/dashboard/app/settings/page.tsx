'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { DashboardSettingsPanel } from '../../components/settings-panel'

export default function DashboardSettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="mt-1 text-muted-foreground">Choose your dashboard layout.</p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
          </div>
        }
      >
        <DashboardSettingsPanel />
      </Suspense>
    </div>
  )
}
