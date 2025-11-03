/**
 * Major Projects Module - Settings Panel
 *
 * User-configurable settings for the Major Projects module.
 * Displayed in the main Settings page under the "Modules" section.
 *
 * Features:
 * - Show in dashboard toggle
 * - Due soon threshold configuration
 * - Default sort preferences
 * - Enable notifications toggle
 * - Settings persistence via API
 *
 * @module major-projects/components/settings-panel
 * @version 1.0.0
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, Briefcase, Check } from 'lucide-react'
import { useSupabase } from '@/components/providers'
import type { MajorProjectsSettings } from '../types'

/**
 * Default settings values
 * Used when no settings exist yet or on reset
 */
const DEFAULT_SETTINGS: MajorProjectsSettings = {
  showInDashboard: true,
  enableNotifications: false,
  defaultSortBy: 'due_date',
  defaultSortOrder: 'asc',
  dueSoonThreshold: 7
}

/**
 * Settings Panel Component
 *
 * Provides UI for configuring Major Projects module preferences.
 * Settings are saved to module_settings table in database.
 *
 * State:
 * - settings: Current settings values
 * - loading: Initial load state
 * - saving: Save operation in progress
 * - saved: Temporary flag to show success message
 *
 * @returns JSX.Element - Settings panel card
 */
export function MajorProjectsSettingsPanel() {
  const { session } = useSupabase()

  const [settings, setSettings] = useState<MajorProjectsSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  /**
   * Load settings from API on mount
   */
  useEffect(() => {
    async function loadSettings() {
      if (!session?.user?.id) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch('/api/modules/major-projects/settings')
        if (response.ok) {
          const data = await response.json()
          setSettings({ ...DEFAULT_SETTINGS, ...data })
        }
      } catch (error) {
        console.error('[MajorProjectsSettings] Error loading settings:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [session])

  /**
   * Save settings to API
   * Shows success indicator for 3 seconds after save
   */
  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    try {
      const response = await fetch('/api/modules/major-projects/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })

      if (response.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (error) {
      console.error('[MajorProjectsSettings] Error saving settings:', error)
    } finally {
      setSaving(false)
    }
  }

  /**
   * Reset settings to defaults
   */
  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  /**
   * Update a single setting field
   */
  const updateSetting = <K extends keyof MajorProjectsSettings>(
    key: K,
    value: MajorProjectsSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Delulu Projects Settings</CardTitle>
              <CardDescription>Loading settings...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <Card>
      {/* Header */}
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center shadow-sm">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle>Delulu Projects Settings</CardTitle>
            <CardDescription>
              Configure how Delulu Projects behaves and displays
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      {/* Settings Form */}
      <CardContent className="space-y-8">
        {/* ================================================================
            DISPLAY SETTINGS SECTION
            ================================================================ */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Display</h3>
            <p className="text-sm text-muted-foreground">
              Control where and how projects are displayed
            </p>
          </div>

          {/* Show in Dashboard */}
          <div className="flex items-center justify-between py-3 border-b">
            <div className="space-y-1">
              <Label htmlFor="showInDashboard" className="text-base font-medium cursor-pointer">
                Show in Dashboard
              </Label>
              <p className="text-sm text-muted-foreground">
                Display the Delulu Projects widget on your dashboard
              </p>
            </div>
            <Switch
              id="showInDashboard"
              checked={settings.showInDashboard}
              onCheckedChange={(checked) => updateSetting('showInDashboard', checked)}
            />
          </div>

          {/* Due Soon Threshold */}
          <div className="space-y-3 py-3 border-b">
            <div className="space-y-1">
              <Label htmlFor="dueSoonThreshold" className="text-base font-medium">
                "Due Soon" Threshold
              </Label>
              <p className="text-sm text-muted-foreground">
                Number of days to consider a project "due soon"
              </p>
            </div>
            <Select
              value={settings.dueSoonThreshold.toString()}
              onValueChange={(value) => updateSetting('dueSoonThreshold', parseInt(value))}
            >
              <SelectTrigger id="dueSoonThreshold" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="5">5 days</SelectItem>
                <SelectItem value="7">7 days (recommended)</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ================================================================
            SORTING SETTINGS SECTION
            ================================================================ */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Sorting</h3>
            <p className="text-sm text-muted-foreground">
              Default sort order for project list
            </p>
          </div>

          {/* Default Sort By */}
          <div className="space-y-3 py-3 border-b">
            <div className="space-y-1">
              <Label htmlFor="defaultSortBy" className="text-base font-medium">
                Sort By
              </Label>
              <p className="text-sm text-muted-foreground">
                Default field to sort projects by
              </p>
            </div>
            <Select
              value={settings.defaultSortBy}
              onValueChange={(value: 'name' | 'due_date' | 'created_at') =>
                updateSetting('defaultSortBy', value)
              }
            >
              <SelectTrigger id="defaultSortBy" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Project Name</SelectItem>
                <SelectItem value="due_date">Due Date (recommended)</SelectItem>
                <SelectItem value="created_at">Date Created</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Default Sort Order */}
          <div className="space-y-3 py-3 border-b">
            <div className="space-y-1">
              <Label htmlFor="defaultSortOrder" className="text-base font-medium">
                Sort Order
              </Label>
              <p className="text-sm text-muted-foreground">
                Direction to sort projects
              </p>
            </div>
            <Select
              value={settings.defaultSortOrder}
              onValueChange={(value: 'asc' | 'desc') =>
                updateSetting('defaultSortOrder', value)
              }
            >
              <SelectTrigger id="defaultSortOrder" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending (A-Z, earliest first)</SelectItem>
                <SelectItem value="desc">Descending (Z-A, latest first)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ================================================================
            NOTIFICATIONS SETTINGS SECTION
            ================================================================ */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Notifications</h3>
            <p className="text-sm text-muted-foreground">
              Get notified about important project updates
            </p>
          </div>

          {/* Enable Notifications */}
          <div className="flex items-center justify-between py-3 border-b">
            <div className="space-y-1">
              <Label htmlFor="enableNotifications" className="text-base font-medium cursor-pointer">
                Enable Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive reminders when projects are due soon
              </p>
            </div>
            <Switch
              id="enableNotifications"
              checked={settings.enableNotifications}
              onCheckedChange={(checked) => updateSetting('enableNotifications', checked)}
            />
          </div>

          {settings.enableNotifications && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Notifications will be sent based on your "Due Soon" threshold setting.
                You'll receive a reminder when a project enters the due soon period.
              </p>
            </div>
          )}
        </div>

        {/* ================================================================
            ACTION BUTTONS
            ================================================================ */}
        <div className="flex items-center justify-between pt-6 border-t">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving}
          >
            Reset to Defaults
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving || saved}
            className="min-w-[120px]"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Saved!
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>

        {/* ================================================================
            DEVELOPER INFO (Collapsible)
            ================================================================ */}
        <details className="pt-6 border-t">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Developer Information
          </summary>
          <div className="mt-4 space-y-2 text-sm bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="font-medium">Module ID:</span>
              <span className="text-muted-foreground font-mono">major-projects</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Version:</span>
              <span className="text-muted-foreground font-mono">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Settings Storage:</span>
              <span className="text-muted-foreground">module_settings table</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">API Endpoint:</span>
              <span className="text-muted-foreground font-mono text-xs">
                /api/modules/major-projects/settings
              </span>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}

// Named export required for dynamic import by settings page
export default MajorProjectsSettingsPanel

// ============================================================================
// DEVELOPER NOTES
// ============================================================================

/**
 * Settings Persistence:
 *
 * Settings are stored in the module_settings table with structure:
 * - user_id: UUID (foreign key to auth.users)
 * - module_id: string (e.g., "major-projects")
 * - settings: JSONB (flexible settings object)
 *
 * This allows each module to store arbitrary settings without schema changes.
 */

/**
 * Default Values Strategy:
 *
 * - Always provide sensible defaults (DEFAULT_SETTINGS const)
 * - Merge loaded settings with defaults (handles new settings added in updates)
 * - Reset button restores all defaults
 * - Never crash if settings are missing or malformed
 */

/**
 * Save Behavior:
 *
 * - Settings saved immediately on "Save Settings" button click
 * - No auto-save (user must explicitly save)
 * - Success indicator shown for 3 seconds after save
 * - Saving state prevents multiple simultaneous saves
 */

/**
 * Validation:
 *
 * - Client-side: Type-safe via TypeScript
 * - Server-side: Should validate in settings API endpoint (not shown here)
 * - Invalid values rejected by Select components (can't enter invalid options)
 */

/**
 * Future Enhancements:
 *
 * - Add "unsaved changes" warning when navigating away
 * - Add import/export settings functionality
 * - Add settings search/filter for modules with many options
 * - Add settings presets (e.g., "Minimal", "Power User")
 */

/**
 * Related Files:
 * - ../types/index.ts - MajorProjectsSettings interface
 * - ../api/settings/route.ts - GET/PUT endpoints for settings
 * - module.json - Settings panel registration
 */
