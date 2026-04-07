/**
 * Module Template Module - Settings Page
 *
 * Standalone settings page accessible from the sidebar submenu.
 * Reuses the existing ModuleTemplateSettingsPanel component.
 *
 * Route: /module-template/settings
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ModuleTemplateSettingsPanel } from '../../components/settings-panel'

export default function ModuleTemplateSettingsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your Module Template module preferences
        </p>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Module Settings</CardTitle>
          <CardDescription>
            Customize how the Module Template module works for you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModuleTemplateSettingsPanel />
        </CardContent>
      </Card>
    </div>
  )
}
