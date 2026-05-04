/**
 * Quotes Module - Settings Panel
 *
 * This component appears in Settings → Features when the module is enabled.
 *
 * IMPORTANT: Settings panel MUST be a client component.
 *
 * Integration: This panel is registered in module.json under
 * "settings.panel": "./components/settings-panel.tsx"
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import type { QuotesSettings } from '../types'
import { defaultQuotesSettings } from '../types'

/**
 * QuotesSettingsPanel Component
 *
 * Exported as a named export (not default) because it's imported
 * by the Settings page via dynamic import.
 */
export function QuotesSettingsPanel() {
  const [settings, setSettings] = useState<QuotesSettings>(defaultQuotesSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  /**
   * Load settings from API
   */
  const loadSettings = async () => {
    try {
      setLoading(true)

      const response = await fetch('/api/modules/quotes/settings')

      if (response.ok) {
        const data = await response.json()
        setSettings({ ...defaultQuotesSettings, ...data })
      } else {
        // Use defaults if no settings saved yet
        setSettings(defaultQuotesSettings)
      }
    } catch (err) {
      console.error('Error loading settings:', err)
      // Use defaults on error
      setSettings(defaultQuotesSettings)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Save settings to API
   */
  const handleSave = async () => {
    try {
      setSaving(true)
      setSaved(false)

      const response = await fetch('/api/modules/quotes/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      // Show success indicator
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Error saving settings:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Helper to update settings
   */
  const updateSetting = <K extends keyof QuotesSettings>(
    key: K,
    value: QuotesSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // Loading state
  if (loading) {
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
        <h3 className="text-lg font-medium">Quotes Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure your quotes module preferences
        </p>
      </div>

      {/* Settings Form */}
      <div className="space-y-6">
        {/* Display Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Display</h4>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Author</Label>
              <div className="text-sm text-muted-foreground">
                Display author name on quote cards
              </div>
            </div>
            <Switch
              checked={settings.showAuthor}
              onCheckedChange={(checked) =>
                updateSetting('showAuthor', checked)
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cardsPerRow">Cards Per Row</Label>
            <Select
              value={settings.cardsPerRow.toString()}
              onValueChange={(value) =>
                updateSetting('cardsPerRow', parseInt(value))
              }
            >
              <SelectTrigger id="cardsPerRow">
                <SelectValue placeholder="Select cards per row" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 card</SelectItem>
                <SelectItem value="2">2 cards</SelectItem>
                <SelectItem value="3">3 cards</SelectItem>
                <SelectItem value="4">4 cards</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Number of quote cards displayed per row
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sortOrder">Sort Order</Label>
            <Select
              value={settings.defaultSortOrder}
              onValueChange={(value: 'asc' | 'desc') =>
                updateSetting('defaultSortOrder', value)
              }
            >
              <SelectTrigger id="sortOrder">
                <SelectValue placeholder="Select sort order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Newest first</SelectItem>
                <SelectItem value="asc">Oldest first</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Default sorting for your quotes collection
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-2 pt-4 border-t">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
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
            <p>• API endpoint: <code>/api/modules/quotes/settings</code></p>
            <p>• User-specific: Each user has their own settings</p>
            <p>• Default values: Defined in types/index.ts</p>
          </div>
        </details>
      </div>
    </div>
  )
}
