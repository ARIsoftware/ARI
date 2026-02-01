/**
 * Hello World Module - Settings Panel
 *
 * This component appears in Settings → Features when the module is enabled.
 * It demonstrates:
 * - TanStack Query for settings management
 * - Form controls (toggle, input, select)
 * - Optimistic updates with rollback
 * - ARI UI patterns
 *
 * IMPORTANT: Settings panel MUST be a client component.
 *
 * Integration: This panel is registered in module.json under
 * "settings.panel": "./components/settings-panel.tsx"
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import {
  useHelloWorldSettings,
  useUpdateHelloWorldSettings,
} from '../hooks/use-hello-world'
import type { HelloWorldSettings } from '../types'

/**
 * Default settings values
 * Used when user hasn't saved any settings yet
 */
const DEFAULT_SETTINGS: HelloWorldSettings = {
  // Onboarding fields (managed by main page, not settings panel)
  onboardingCompleted: true,
  sampleQuestion1: '',
  sampleQuestion2: '',
  sampleQuestion3: '',
  // Feature toggles
  enableNotifications: true,
  showInDashboard: true,
  defaultMessage: 'Hello, World!',
  userDisplayName: '',
  theme: 'auto',
  refreshInterval: '60'
}

/**
 * HelloWorldSettings Component
 *
 * Exported as a named export (not default) because it's imported
 * by the Settings page via dynamic import.
 */
export function HelloWorldSettingsPanel() {
  const { toast } = useToast()

  // TanStack Query hooks
  const { data: savedSettings, isLoading } = useHelloWorldSettings()
  const updateSettings = useUpdateHelloWorldSettings()

  // Local state for form (merged with defaults)
  const [settings, setSettings] = useState<HelloWorldSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  // Update local state when saved settings load
  useEffect(() => {
    if (savedSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
    }
  }, [savedSettings])

  /**
   * Save settings
   * Uses optimistic updates via TanStack Query mutation
   */
  const handleSave = () => {
    setSaved(false)

    updateSettings.mutate(settings, {
      onSuccess: () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      },
      onError: () => {
        toast({
          variant: 'destructive',
          title: 'Failed to save settings',
          description: 'Please try again.',
        })
      },
    })
  }

  /**
   * Helper to update settings
   */
  const updateSetting = <K extends keyof HelloWorldSettings>(
    key: K,
    value: HelloWorldSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading settings...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium">Hello World Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure your Hello World module preferences
        </p>
      </div>

      {/* Settings Form */}
      <div className="space-y-6">
        {/* Section 1: Feature Toggles */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Features</h4>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Notifications</Label>
              <div className="text-sm text-muted-foreground">
                Receive notifications for new entries
              </div>
            </div>
            <Switch
              checked={settings.enableNotifications}
              onCheckedChange={(checked) =>
                updateSetting('enableNotifications', checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show in Dashboard</Label>
              <div className="text-sm text-muted-foreground">
                Display widget on main dashboard
              </div>
            </div>
            <Switch
              checked={settings.showInDashboard}
              onCheckedChange={(checked) =>
                updateSetting('showInDashboard', checked)
              }
            />
          </div>
        </div>

        {/* Section 2: Text Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Customization</h4>

          <div className="space-y-2">
            <Label htmlFor="defaultMessage">Default Message</Label>
            <Input
              id="defaultMessage"
              value={settings.defaultMessage}
              onChange={(e) => updateSetting('defaultMessage', e.target.value)}
              placeholder="Enter default message"
            />
            <p className="text-xs text-muted-foreground">
              This message will be used as placeholder text
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={settings.userDisplayName}
              onChange={(e) => updateSetting('userDisplayName', e.target.value)}
              placeholder="Enter your display name"
            />
            <p className="text-xs text-muted-foreground">
              Optional: How you want to be addressed in the module
            </p>
          </div>
        </div>

        {/* Section 3: Dropdown Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Preferences</h4>

          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={settings.theme}
              onValueChange={(value: 'light' | 'dark' | 'auto') =>
                updateSetting('theme', value)
              }
            >
              <SelectTrigger id="theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="auto">Auto (System)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose your preferred color theme
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="refreshInterval">Refresh Interval</Label>
            <Select
              value={settings.refreshInterval}
              onValueChange={(value: '30' | '60' | '120') =>
                updateSetting('refreshInterval', value)
              }
            >
              <SelectTrigger id="refreshInterval">
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How often to refresh data in the dashboard widget
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-2 pt-4 border-t">
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>

        {saved && (
          <span className="text-sm text-green-600">
            Settings saved successfully
          </span>
        )}
      </div>

      {/* Developer Info */}
      <div className="pt-4 border-t">
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Developer Information
          </summary>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>• Settings stored in: <code>module_settings.settings</code> (JSONB)</p>
            <p>• API endpoint: <code>/api/modules/hello-world/settings</code></p>
            <p>• User-specific: Each user has their own settings</p>
            <p>• Default values: Defined in DEFAULT_SETTINGS constant</p>
            <p>• Auth: Better Auth cookies (no Authorization header needed)</p>
          </div>
        </details>
      </div>
    </div>
  )
}

/**
 * DEVELOPER NOTES:
 *
 * 1. Authentication:
 *    - Better Auth uses HTTP-only cookies
 *    - No need to pass Authorization headers
 *    - API routes read auth from cookies automatically
 *
 * 2. Settings Architecture:
 *    - Stored in module_settings table, settings column (JSONB)
 *    - Per-user settings (enforced via withRLS)
 *    - Always provide default values
 *    - Merge defaults with loaded settings
 *
 * 3. TanStack Query:
 *    - useHelloWorldSettings() - fetches current settings
 *    - useUpdateHelloWorldSettings() - saves with optimistic updates
 *    - Automatic cache invalidation on mutation
 *
 * 4. Form Controls:
 *    - Use Shadcn/ui components for consistency
 *    - Provide clear labels and descriptions
 *    - Show validation errors
 *    - Disable inputs while saving
 *
 * 5. User Feedback:
 *    - Show loading state while fetching
 *    - Show saving state while saving
 *    - Show success confirmation
 *    - Handle errors gracefully with toast
 */
