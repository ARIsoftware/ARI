/**
 * Hello World Module - Settings Page
 *
 * Standalone settings page accessible from the sidebar submenu.
 * Reuses the existing HelloWorldSettingsPanel component.
 *
 * Route: /hello-world/settings
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { HelloWorldSettingsPanel } from '../../components/settings-panel'

export default function HelloWorldSettingsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your Hello World module preferences
        </p>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Module Settings</CardTitle>
          <CardDescription>
            Customize how the Hello World module works for you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HelloWorldSettingsPanel />
        </CardContent>
      </Card>
    </div>
  )
}
