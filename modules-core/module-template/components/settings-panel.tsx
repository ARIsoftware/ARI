/**
 * Module Template Module - Settings Panel
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
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import {
  Loader2,
  Save,
  CheckCircle2,
  Check,
  Sparkles,
  Bot,
  Layers,
  Network,
  Atom,
  Wind,
  Search,
  Zap,
  Compass,
  Server,
  ExternalLink,
  Plug,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AI_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'
import { useApiKeysStatus } from '@/hooks/use-api-keys-status'
import {
  useModuleTemplateSettings,
  useUpdateModuleTemplateSettings,
} from '../hooks/use-module-template'
import type { ModuleTemplateSettings } from '../types'

const PROVIDER_ICONS: Record<AiProviderId, LucideIcon> = {
  openrouter: Network,
  claude: Sparkles,
  openai: Bot,
  gemini: Layers,
  xai: Atom,
  mistral: Wind,
  deepseek: Search,
  groq: Zap,
  perplexity: Compass,
  ollama: Server,
}

/**
 * Default settings values
 * Used when user hasn't saved any settings yet
 */
const DEFAULT_SETTINGS: ModuleTemplateSettings = {
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
  refreshInterval: '60',
  selectedAiProvider: null,
}

/**
 * ModuleTemplateSettings Component
 *
 * Exported as a named export (not default) because it's imported
 * by the Settings page via dynamic import.
 */
export function ModuleTemplateSettingsPanel() {
  const { toast } = useToast()

  // TanStack Query hooks
  const { data: savedSettings, isLoading } = useModuleTemplateSettings()
  const updateSettings = useUpdateModuleTemplateSettings()

  const [settings, setSettings] = useState<ModuleTemplateSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  const { data: providerKeys = {} } = useApiKeysStatus()

  useEffect(() => {
    if (savedSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
    }
  }, [savedSettings])

  // Only providers with an API key configured are offered for selection;
  // unconfigured ones are set up via Settings → Integrations first.
  const configuredProviders = AI_PROVIDERS.filter(
    p => providerKeys[p.primaryEnvKey]?.configured ?? false,
  )

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
  const updateSetting = <K extends keyof ModuleTemplateSettings>(
    key: K,
    value: ModuleTemplateSettings[K]
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
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>AI Providers</CardTitle>
              <CardDescription>
                Configure the AI Providers to use with this module.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
              <Button asChild size="sm">
                <Link href="/settings?tab=integrations">Manage Providers</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a
                  href="https://ari.software/docs/api-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Documentation
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {configuredProviders.length === 0 ? (
            // Empty state: no API keys configured anywhere in ARI yet.
            // Replaces the whole card body with a single clear call to action.
            <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Plug className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium">
                You have not setup any AI Providers yet.
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Add an API key for a provider and it will appear here, ready to
                use with this module.
              </p>
              <Button asChild className="mt-5">
                <Link href="/settings?tab=integrations">Set up AI Providers</Link>
              </Button>
            </div>
          ) : (
            <>
          <div className="rounded-xl border bg-muted/30 p-5">
            <p className="text-sm font-medium text-foreground">
              Choose the AI Provider that this module should use. You can add or manage additional AI Providers in{' '}
              <Link
                href="/settings?tab=integrations"
                className="underline underline-offset-4 hover:text-foreground/80"
              >
                ARI settings
              </Link>
              .
            </p>
          </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {configuredProviders.map(({ id, name, description }) => {
                const Icon = PROVIDER_ICONS[id]
                const selected = settings.selectedAiProvider === id
                // Selected: filled check. Otherwise an empty radio circle that
                // highlights on hover — signals "click to select".
                const badge = selected ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 transition-colors group-hover:border-green-600" />
                )

                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      updateSetting('selectedAiProvider', selected ? null : id)
                    }
                    className={cn(
                      'group relative flex flex-col gap-3 rounded-xl border p-4 text-left transition',
                      selected
                        ? // Same green as enabled provider cards on /settings?tab=integrations
                          'border-green-600/40 bg-green-600/40'
                        : 'cursor-pointer border-border bg-card shadow-sm hover:border-green-600/50 hover:shadow-md',
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-foreground/80" />
                      </div>
                      {badge}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2 border-t pt-4">
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
                    Save
                  </>
                )}
              </Button>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Module Settings</CardTitle>
          <CardDescription>
            Customize how the Module Template module works for you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

          <div className="pt-4 border-t">
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Developer Information
              </summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>• Settings stored in: <code>module_settings.settings</code> (JSONB)</p>
                <p>• API endpoint: <code>/api/modules/module-template/settings</code></p>
                <p>• User-specific: Each user has their own settings</p>
                <p>• Default values: Defined in DEFAULT_SETTINGS constant</p>
                <p>• Auth: Better Auth cookies (no Authorization header needed)</p>
              </div>
            </details>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * DEVELOPER NOTES:
 *
 * 1. Authentication:
 *    - Better Auth uses HTTP-only cookies — fetches inside the hook send
 *      them automatically. Do not pass `Authorization` headers.
 *    - Server-side, the API route calls `getAuthenticatedUser()` + `withRLS()`
 *      so tenant isolation holds even if a caller forgets a filter.
 *
 * 2. Settings Architecture:
 *    - Row lives in `public.module_settings`, column `settings` (JSONB),
 *      one row per `(user_id, module_id)`.
 *    - Row access is enforced by `withRLS()` — callers cannot read or write
 *      another user's settings even with a crafted payload.
 *    - Always ship a `DEFAULT_SETTINGS` constant and merge:
 *      `setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })`. This keeps
 *      controlled form inputs from flipping between undefined and a value.
 *
 * 3. TanStack Query (the optimistic-update pattern):
 *    - `useModuleTemplateSettings()` reads the `['module-template-settings']`
 *      cache; every consumer that uses the same key shares the same data.
 *    - `useUpdateModuleTemplateSettings()` follows the standard four-step
 *      optimistic update in `hooks/use-module-template.ts`:
 *        a. `onMutate`: `cancelQueries` → snapshot previous → `setQueryData`
 *           with the new value → return `{ previous }` for rollback.
 *        b. `onError`: restore the snapshot from context.
 *        c. `onSettled`: `invalidateQueries` to refetch the source of truth.
 *    - This means the UI reflects changes before the server responds, and
 *      automatically corrects itself if the save fails.
 *
 * 4. Form Controls:
 *    - Use Shadcn/ui components for consistency.
 *    - Provide a clear `<Label>` and a description line for every control.
 *    - Validation lives server-side (Zod in the API route); surface failures
 *      via `onError` + `toast({ variant: 'destructive' })` rather than
 *      building a parallel client-side schema.
 *    - Disable inputs while `updateSettings.isPending` — do not let users
 *      queue conflicting edits.
 *
 * 5. User Feedback:
 *    - Loading: render a spinner while `isLoading`.
 *    - Saving: swap the save button label while `isPending`.
 *    - Success: flip `saved=true` for a short window (3s) for inline
 *      confirmation. Avoid toasting success on every keystroke.
 *    - Failure: toast with `variant: 'destructive'` and keep the form
 *      editable so the user can retry.
 */
