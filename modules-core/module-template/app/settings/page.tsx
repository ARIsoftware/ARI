/**
 * Module Template Module - Settings Page
 *
 * Standalone settings page accessible from the sidebar submenu.
 * Reuses the existing ModuleTemplateSettingsPanel component.
 *
 * Route: /module-template/settings
 */

'use client'

import { ModuleTemplateSettingsPanel } from '../../components/settings-panel'

export default function ModuleTemplateSettingsPage() {
  return (
    <div className="p-6 space-y-6 w-full lg:w-3/4 lg:min-w-[700px]">
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your Module Template module preferences
        </p>
      </div>

      <ModuleTemplateSettingsPanel />
    </div>
  )
}
