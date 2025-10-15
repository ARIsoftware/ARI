"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { getAllFeatures } from "@/lib/menu-config"
import { useModules } from "@/lib/modules/module-hooks"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Database,
  Download,
  Grid3x3,
  Loader2,
  Lock,
  Package,
  Palette,
  Plug,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Upload,
} from "lucide-react"

interface NotificationSettings {
  taskReminders: boolean
  productUpdates: boolean
  securityAlerts: boolean
  weeklySummary: boolean
}

interface BetaFeatureSettings {
  smartPriorities: boolean
  predictiveScheduling: boolean
  aiMeetingNotes: boolean
}

interface FeaturePreference {
  id: string
  user_id: string
  feature_name: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export default function SettingsPage() {
  const [isSaving, setIsSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [themePreference, setThemePreference] = useState("system")

  // Backup state
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [backupStats, setBackupStats] = useState<{ tables: number, totalRows: number } | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number, total: number } | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[]; warnings: string[]; metadata?: any } | null>(null)
  const [workspaceName, setWorkspaceName] = useState("Ari Operations")
  const [workspaceTagline, setWorkspaceTagline] = useState("Resilient workflows for focused teams")
  const [landingView, setLandingView] = useState("dashboard")
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    taskReminders: true,
    productUpdates: false,
    securityAlerts: true,
    weeklySummary: true,
  })
  const [pushNotifications, setPushNotifications] = useState(true)
  const [betaFeatures, setBetaFeatures] = useState<BetaFeatureSettings>({
    smartPriorities: true,
    predictiveScheduling: false,
    aiMeetingNotes: false,
  })
  const [sessionTimeout, setSessionTimeout] = useState("30")
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true)
  const [deviceApprovals, setDeviceApprovals] = useState(true)
  const [featurePreferences, setFeaturePreferences] = useState<Record<string, boolean>>({})
  const [loadingFeatures, setLoadingFeatures] = useState(true)

  // Get all menu features dynamically from menu config
  const menuFeatures = getAllFeatures()

  // Load ALL modules (including disabled ones) for settings page
  const [allModules, setAllModules] = useState<any[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)

  // Load all modules (not just enabled) for settings management
  useEffect(() => {
    async function loadAllModules() {
      try {
        setModulesLoading(true)
        // This endpoint needs to return ALL modules, not just enabled
        const response = await fetch('/api/modules/all')
        if (response.ok) {
          const data = await response.json()
          setAllModules(data.modules || [])
        }
      } catch (error) {
        console.error('Error loading all modules:', error)
      } finally {
        setModulesLoading(false)
      }
    }
    loadAllModules()
  }, [])

  const toggleNotification = (key: keyof NotificationSettings) => {
    setNotificationSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const toggleBetaFeature = (key: keyof BetaFeatureSettings) => {
    setBetaFeatures((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const toggleFeature = async (featureName: string) => {
    const currentState = featurePreferences[featureName] ?? true
    const newState = !currentState

    // Optimistically update UI
    setFeaturePreferences((prev) => ({
      ...prev,
      [featureName]: newState
    }))

    try {
      const response = await fetch('/api/features', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feature_name: featureName,
          enabled: newState
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update feature preference')
      }
    } catch (error) {
      console.error('Error updating feature:', error)
      // Revert on error
      setFeaturePreferences((prev) => ({
        ...prev,
        [featureName]: currentState
      }))
      setMessage({ type: 'error', text: 'Failed to update feature preference' })
    }
  }

  const toggleModule = async (moduleId: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled

    try {
      const response = await fetch('/api/modules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moduleId,
          enabled: newEnabled
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update module')
      }

      // Refresh page to update module registry
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error) {
      console.error('Error updating module:', error)
      setMessage({ type: 'error', text: 'Failed to update module. Please try again.' })
    }
  }

  // Load feature preferences on mount
  useEffect(() => {
    const loadFeaturePreferences = async () => {
      try {
        const response = await fetch('/api/features')
        if (response.ok) {
          const data: FeaturePreference[] = await response.json()
          const preferences: Record<string, boolean> = {}
          data.forEach(pref => {
            preferences[pref.feature_name] = pref.enabled
          })
          setFeaturePreferences(preferences)
        }
      } catch (error) {
        console.error('Error loading feature preferences:', error)
      } finally {
        setLoadingFeatures(false)
      }
    }
    loadFeaturePreferences()
  }, [])

  const handleSaveChanges = () => {
    setIsSaving(true)
    setSavedMessage(null)

    window.setTimeout(() => {
      setIsSaving(false)
      setSavedMessage("Your preferences are synced across devices.")
    }, 800)
  }

  // Backup functions
  const handleExport = async () => {
    try {
      setExportLoading(true)
      setMessage(null)
      setBackupStats(null)

      const response = await fetch('/api/backup/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Export failed')
      }

      const metadataHeader = response.headers.get('X-Backup-Metadata')
      let metadata: any = {}
      if (metadataHeader) {
        try {
          metadata = JSON.parse(metadataHeader)
        } catch (e) {
          console.warn('Could not parse backup metadata')
        }
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `database-backup-${new Date().toISOString().split('T')[0]}.sql`
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (metadata.tables && metadata.rows) {
        setBackupStats({ tables: metadata.tables, totalRows: metadata.rows })

        let message = `Database exported successfully! ${metadata.rows} rows from ${metadata.tables} tables.`
        if (metadata.errors > 0) {
          message += ` Warning: ${metadata.errors} errors occurred during export.`
        }
        setMessage({ type: 'success', text: message })
      } else {
        setMessage({ type: 'success', text: 'Database exported successfully!' })
      }

    } catch (error: any) {
      console.error('Export error:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to export database' })
    } finally {
      setExportLoading(false)
    }
  }

  const handleImportClick = async () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please select a file to import' })
      return
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File too large. Maximum size is 50MB.' })
      return
    }

    try {
      setMessage({ type: 'success', text: 'Validating SQL file...' })

      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/backup/import', {
        method: 'PUT',
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Validation failed')
      }

      const validation = await response.json()
      setValidationResult(validation)

      if (!validation.valid) {
        setMessage({ type: 'error', text: `SQL validation failed: ${validation.errors[0]}` })
        return
      }

      if (validation.warnings && validation.warnings.length > 0) {
        setMessage({ type: 'success', text: `File validated with ${validation.warnings.length} warnings. Ready to import.` })
      } else {
        setMessage({ type: 'success', text: 'SQL file validated successfully. Ready to import.' })
      }

      setShowConfirmDialog(true)
    } catch (error: any) {
      setMessage({ type: 'error', text: `Failed to validate file: ${error.message}` })
    }
  }

  const handleConfirmedImport = async () => {
    setShowConfirmDialog(false)

    try {
      setImportLoading(true)
      setMessage(null)
      setImportProgress({ current: 0, total: 100 })

      if (!selectedFile) {
        throw new Error('No file selected')
      }

      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/backup/import', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        if (error.rollback) {
          throw new Error(`Import failed and was rolled back: ${error.details?.[0] || error.error}`)
        }
        throw new Error(error.error || 'Import failed')
      }

      const result = await response.json()

      setImportProgress({ current: 100, total: 100 })

      let message = result.message
      if (result.stats) {
        message += ` (Duration: ${result.stats.duration}, Tables: ${result.stats.tablesCreated}, Records: ${result.stats.recordsImported})`

        if (result.stats.warnings && result.stats.warnings.length > 0) {
          message += ` Warning: ${result.stats.warnings.length} validation warnings.`
        }
      }

      if (result.integrityCheck !== 'passed') {
        message += ` Data integrity check: ${result.integrityCheck.failures?.length || 0} issues detected.`
      }

      const messageType = result.integrityCheck === 'passed' ? 'success' : 'error'
      setMessage({ type: messageType, text: message })

      setSelectedFile(null)

      setTimeout(() => {
        window.location.reload()
      }, 3000)

    } catch (error: any) {
      console.error('Import error:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to import database' })
    } finally {
      setImportLoading(false)
      setImportProgress(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex-1 bg-slate-50">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8">
              <div className="flex flex-col gap-3">
                <Badge className="w-fit text-sm font-medium">Crafted for focus-first teams</Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Settings</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Personalize Ari to match the rhythm of your team. Adjust themes, notifications, security, and integrations—everything stays synced across web and mobile.
                </p>
              </div>

              <Tabs defaultValue="general" className="w-full">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                  <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="features">Features</TabsTrigger>
                    <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    <TabsTrigger value="security">Security</TabsTrigger>
                    <TabsTrigger value="integrations">Integrations</TabsTrigger>
                    <TabsTrigger value="backups">Backups</TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.location.href = '/debug'}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Run Diagnostics
                    </Button>
                    <Button size="sm" onClick={handleSaveChanges} disabled={isSaving}>
                      {isSaving ? (
                        <span className="flex items-center gap-2">
                          <TimerReset className="h-4 w-4 animate-spin" />
                          Saving
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          Save changes
                        </span>
                      )}
                    </Button>
                  </div>
                </div>

                <TabsContent value="general" className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Palette className="h-5 w-5 text-purple-500" />
                          Appearance
                        </CardTitle>
                        <CardDescription>
                          Switch between light, dark, and system-aware palettes.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <RadioGroup
                          value={themePreference}
                          onValueChange={(value) => setThemePreference(value)}
                          className="grid gap-3"
                        >
                          <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                              <Label htmlFor="theme-light" className="text-base">Light mode</Label>
                              <p className="text-sm text-muted-foreground">Bright and clear, perfect for daylight work.</p>
                            </div>
                            <RadioGroupItem id="theme-light" value="light" />
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                              <Label htmlFor="theme-dark" className="text-base">Dark mode</Label>
                              <p className="text-sm text-muted-foreground">Reduce glare and stay focused during late sessions.</p>
                            </div>
                            <RadioGroupItem id="theme-dark" value="dark" />
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                              <Label htmlFor="theme-system" className="text-base">Match system</Label>
                              <p className="text-sm text-muted-foreground">Automatically adapts to your device setting.</p>
                            </div>
                            <RadioGroupItem id="theme-system" value="system" />
                          </div>
                        </RadioGroup>
                        <div className="rounded-lg bg-muted p-4">
                          <p className="text-sm text-muted-foreground">
                            Appearance updates are instant and persist across all Ari surfaces.
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Sparkles className="h-5 w-5 text-blue-500" />
                          Workspace identity
                        </CardTitle>
                        <CardDescription>
                          Fine tune your workspace branding and global defaults.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="workspace-name">Workspace name</Label>
                          <Input
                            id="workspace-name"
                            value={workspaceName}
                            onChange={(event) => setWorkspaceName(event.target.value)}
                            placeholder="Give your workspace a friendly name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="workspace-tagline">Tagline</Label>
                          <Textarea
                            id="workspace-tagline"
                            value={workspaceTagline}
                            onChange={(event) => setWorkspaceTagline(event.target.value)}
                            placeholder="Describe your team's mission"
                            rows={3}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Default landing view</Label>
                          <Select value={landingView} onValueChange={setLandingView}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose your home view" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dashboard">Dashboard</SelectItem>
                              <SelectItem value="tasks">Tasks</SelectItem>
                              <SelectItem value="daily-fitness">Daily fitness</SelectItem>
                              <SelectItem value="assist">Assist</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-muted-foreground">
                            Everyone in this workspace uses this view after sign-in.
                          </p>
                        </div>
                      </CardContent>
                      <CardFooter className="border-t bg-muted/60">
                        <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
                          <span>Brand updates go live instantly.</span>
                          <Badge variant="secondary">Synced</Badge>
                        </div>
                      </CardFooter>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="h-5 w-5 text-rose-500" />
                        Beta lab
                      </CardTitle>
                      <CardDescription>
                        Experiment with upcoming intelligence features before general release.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start justify-between rounded-lg border p-4">
                        <div className="pr-4">
                          <p className="text-sm font-medium">Smart priorities</p>
                          <p className="text-sm text-muted-foreground">AI reorders tasks based on urgency, dependencies, and team load.</p>
                        </div>
                        <Switch
                          checked={betaFeatures.smartPriorities}
                          onCheckedChange={() => toggleBetaFeature("smartPriorities")}
                        />
                      </div>
                      <div className="flex items-start justify-between rounded-lg border p-4">
                        <div className="pr-4">
                          <p className="text-sm font-medium">Predictive scheduling</p>
                          <p className="text-sm text-muted-foreground">Auto-distribute open tasks across the week with sprint-friendly pacing.</p>
                        </div>
                        <Switch
                          checked={betaFeatures.predictiveScheduling}
                          onCheckedChange={() => toggleBetaFeature("predictiveScheduling")}
                        />
                      </div>
                      <div className="flex items-start justify-between rounded-lg border p-4">
                        <div className="pr-4">
                          <p className="text-sm font-medium">AI meeting notes</p>
                          <p className="text-sm text-muted-foreground">Attach transcripts, highlights, and follow-ups to meeting records.</p>
                        </div>
                        <Switch
                          checked={betaFeatures.aiMeetingNotes}
                          onCheckedChange={() => toggleBetaFeature("aiMeetingNotes")}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="features" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Grid3x3 className="h-5 w-5 text-blue-500" />
                        Menu Features
                      </CardTitle>
                      <CardDescription>
                        Enable or disable features to customize your navigation menu and available pages.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {loadingFeatures ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        menuFeatures.map((feature) => {
                          const isEnabled = featurePreferences[feature.name] ?? true
                          return (
                            <div key={feature.name} className="flex items-start justify-between rounded-lg border p-4">
                              <div className="pr-4 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">{feature.label}</p>
                                  {!feature.canBeDisabled && (
                                    <Badge variant="secondary" className="text-xs">Required</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{feature.description}</p>
                                <p className="text-xs text-muted-foreground mt-1">URL: {feature.url}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                {feature.canBeDisabled ? (
                                  <>
                                    <span className="text-sm font-medium text-muted-foreground">
                                      {isEnabled ? 'On' : 'Off'}
                                    </span>
                                    <Switch
                                      checked={isEnabled}
                                      onCheckedChange={() => toggleFeature(feature.name)}
                                    />
                                  </>
                                ) : (
                                  <span className="text-sm font-medium text-muted-foreground">
                                    Always On
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </CardContent>
                    <CardFooter className="border-t bg-muted/60">
                      <div className="flex w-full items-center text-sm text-muted-foreground">
                        <AlertCircle className="mr-2 h-4 w-4" />
                        <span>Disabled features will be hidden from the menu and their URLs will be inaccessible.</span>
                      </div>
                    </CardFooter>
                  </Card>

                  {/* Modules Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Package className="h-5 w-5 text-purple-500" />
                        Modules
                      </CardTitle>
                      <CardDescription>
                        Enable or disable installed modules to extend your app functionality.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {modulesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : allModules.length === 0 ? (
                        <div className="text-center py-8">
                          <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                          <p className="text-sm text-muted-foreground">
                            No modules installed. Place modules in the <code className="px-1 py-0.5 bg-muted rounded text-xs">/modules</code> directory.
                          </p>
                        </div>
                      ) : (
                        allModules.map((module) => {
                          const Icon = getLucideIcon(module.icon)
                          const isEnabled = module.isEnabled

                          return (
                            <div key={module.id} className="flex items-start justify-between rounded-lg border p-4">
                              <div className="pr-4 flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <Icon className="h-5 w-5 text-blue-600" />
                                  <div>
                                    <p className="text-sm font-medium">{module.name}</p>
                                    <p className="text-xs text-muted-foreground">v{module.version} by {module.author}</p>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground">{module.description}</p>
                                {module.routes && module.routes.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Routes: {module.routes.map(r => r.path).join(', ')}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-muted-foreground">
                                  {isEnabled ? 'On' : 'Off'}
                                </span>
                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={() => toggleModule(module.id, isEnabled)}
                                />
                              </div>
                            </div>
                          )
                        })
                      )}
                    </CardContent>
                    <CardFooter className="border-t bg-muted/60">
                      <div className="flex w-full items-center text-sm text-muted-foreground">
                        <AlertCircle className="mr-2 h-4 w-4" />
                        <span>Disabled modules won't appear in navigation. Toggling requires page refresh.</span>
                      </div>
                    </CardFooter>
                  </Card>
                </TabsContent>

                <TabsContent value="notifications" className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Bell className="h-5 w-5 text-blue-500" />
                          Email alerts
                        </CardTitle>
                        <CardDescription>
                          Decide which summaries and nudges land in your inbox.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4">
                            <p className="text-sm font-medium">Task reminders</p>
                            <p className="text-sm text-muted-foreground">Deadline nudges and follow-up prompts.</p>
                          </div>
                          <Switch
                            checked={notificationSettings.taskReminders}
                            onCheckedChange={() => toggleNotification("taskReminders")}
                          />
                        </div>
                        <div className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4">
                            <p className="text-sm font-medium">Product updates</p>
                            <p className="text-sm text-muted-foreground">Release highlights, tips, and changelog notes.</p>
                          </div>
                          <Switch
                            checked={notificationSettings.productUpdates}
                            onCheckedChange={() => toggleNotification("productUpdates")}
                          />
                        </div>
                        <div className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4">
                            <p className="text-sm font-medium">Security alerts</p>
                            <p className="text-sm text-muted-foreground">New device sign-ins and policy changes.</p>
                          </div>
                          <Switch
                            checked={notificationSettings.securityAlerts}
                            onCheckedChange={() => toggleNotification("securityAlerts")}
                          />
                        </div>
                        <div className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4">
                            <p className="text-sm font-medium">Weekly summary</p>
                            <p className="text-sm text-muted-foreground">Digest of accomplishments, blockers, and fitness wins.</p>
                          </div>
                          <Switch
                            checked={notificationSettings.weeklySummary}
                            onCheckedChange={() => toggleNotification("weeklySummary")}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Bell className="h-5 w-5 text-purple-500" />
                          Push & in-app
                        </CardTitle>
                        <CardDescription>
                          Quick nudges when you are active in Ari or on mobile.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4">
                            <p className="text-sm font-medium">Push notifications</p>
                            <p className="text-sm text-muted-foreground">Mirrors urgent alerts to your paired devices.</p>
                          </div>
                          <Switch
                            checked={pushNotifications}
                            onCheckedChange={setPushNotifications}
                          />
                        </div>
                        <div className="space-y-3">
                          <Label htmlFor="digest-day">Weekly digest day</Label>
                          <Select defaultValue="friday">
                            <SelectTrigger id="digest-day">
                              <SelectValue placeholder="Choose weekday" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monday">Monday</SelectItem>
                              <SelectItem value="wednesday">Wednesday</SelectItem>
                              <SelectItem value="friday">Friday</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-muted-foreground">
                            Digest arrives at 8AM in your timezone with highlights, trends, and focus recs.
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                          Mute mode detected? Ari pauses push alerts automatically when Focus Timer is active.
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="security" className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <ShieldCheck className="h-5 w-5 text-emerald-500" />
                          Two-factor authentication
                        </CardTitle>
                        <CardDescription>
                          Keep your account fortified with a second factor.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4">
                            <p className="text-sm font-medium">OTP via authenticator</p>
                            <p className="text-sm text-muted-foreground">Use any TOTP app for rotating six-digit codes.</p>
                          </div>
                          <Switch
                            checked={twoFactorEnabled}
                            onCheckedChange={setTwoFactorEnabled}
                          />
                        </div>
                        <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-sm">
                          <p className="font-medium text-emerald-700">Recovery codes available</p>
                          <p className="mt-1 text-emerald-600">
                            Store these offline. If you lose your device, they keep you signed in.
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Lock className="h-5 w-5 text-slate-500" />
                          Session controls
                        </CardTitle>
                        <CardDescription>
                          Calibrate how long sessions stay active on trusted devices.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="session-timeout">Session timeout</Label>
                          <Select value={sessionTimeout} onValueChange={setSessionTimeout}>
                            <SelectTrigger id="session-timeout">
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="15">15 minutes</SelectItem>
                              <SelectItem value="30">30 minutes</SelectItem>
                              <SelectItem value="60">1 hour</SelectItem>
                              <SelectItem value="120">2 hours</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4">
                            <p className="text-sm font-medium">Trusted device approvals</p>
                            <p className="text-sm text-muted-foreground">Require admin consent before new devices gain access.</p>
                          </div>
                          <Switch
                            checked={deviceApprovals}
                            onCheckedChange={setDeviceApprovals}
                          />
                        </div>
                        <div className="space-y-3">
                          <p className="text-sm font-medium">Active devices</p>
                          <div className="space-y-3 rounded-lg border p-4 text-sm">
                            <div className="flex items-center justify-between">
                              <span>Macbook Pro · Safari</span>
                              <Badge variant="secondary">Now</Badge>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span>iPhone 15 · Ari Mobile</span>
                              <span>2h ago</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span>iPad · Ari Mobile</span>
                              <span>Yesterday</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CheckCircle2 className="h-5 w-5 text-sky-500" />
                        Compliance pulse
                      </CardTitle>
                      <CardDescription>
                        Snapshot of your workspace posture across the core security benchmarks.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-3">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span>Role hygiene</span>
                          <span>92%</span>
                        </div>
                        <Progress value={92} />
                        <p className="text-xs text-muted-foreground">
                          Review role drift every sprint to keep access minimal.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span>RLS coverage</span>
                          <span>100%</span>
                        </div>
                        <Progress value={100} />
                        <p className="text-xs text-muted-foreground">
                          RLS policies verified across all customer-facing tables.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span>Secrets rotation</span>
                          <span>35 days</span>
                        </div>
                        <Progress value={70} />
                        <p className="text-xs text-muted-foreground">
                          Schedule next rotation before hitting the 45-day window.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="integrations" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Plug className="h-5 w-5 text-indigo-500" />
                        Connected apps
                      </CardTitle>
                      <CardDescription>
                        Manage the tools that sync data into Ari.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Supabase</p>
                            <p className="text-xs text-muted-foreground">Realtime tasks & auth</p>
                          </div>
                          <Badge variant="secondary">Connected</Badge>
                        </div>
                        <Separator className="my-4" />
                        <p className="text-sm text-muted-foreground">
                          Syncs tasks, fitness logs, and motivation content via secured service role.
                        </p>
                        <Button variant="outline" size="sm" className="mt-4 w-full">
                          Manage keys
                        </Button>
                      </div>
                      <div className="rounded-xl border p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Notion</p>
                            <p className="text-xs text-muted-foreground">Docs & rituals</p>
                          </div>
                          <Badge variant="outline">Available</Badge>
                        </div>
                        <Separator className="my-4" />
                        <p className="text-sm text-muted-foreground">
                          Mirror rituals, handbooks, and SOPs directly into Ari dashboards.
                        </p>
                        <Button size="sm" className="mt-4 w-full">
                          Connect
                        </Button>
                      </div>
                      <div className="rounded-xl border p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Linear</p>
                            <p className="text-xs text-muted-foreground">Engineering backlog</p>
                          </div>
                          <Badge variant="outline">Available</Badge>
                        </div>
                        <Separator className="my-4" />
                        <p className="text-sm text-muted-foreground">
                          Auto-link shipped tickets to Ari milestones with status mirroring.
                        </p>
                        <Button size="sm" className="mt-4 w-full">
                          Connect
                        </Button>
                      </div>
                      <div className="rounded-xl border p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Slack</p>
                            <p className="text-xs text-muted-foreground">Channel digests</p>
                          </div>
                          <Badge variant="outline">Available</Badge>
                        </div>
                        <Separator className="my-4" />
                        <p className="text-sm text-muted-foreground">
                          Send curated notifications into team channels with context-aware summaries.
                        </p>
                        <Button size="sm" className="mt-4 w-full">
                          Connect
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold">Automation recipes</CardTitle>
                      <CardDescription>
                        Kick-start automation with prebuilt flows. Toggle to activate instantly.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      <div className="flex flex-col justify-between rounded-xl border p-5">
                        <div>
                          <p className="text-sm font-medium">Quiet hours</p>
                          <p className="mt-2 text-sm text-muted-foreground">Mute notifications nightly and resurface blockers each morning.</p>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <Badge variant="outline">Recommended</Badge>
                          <Switch defaultChecked />
                        </div>
                      </div>
                      <div className="flex flex-col justify-between rounded-xl border p-5">
                        <div>
                          <p className="text-sm font-medium">Post-meeting recap</p>
                          <p className="mt-2 text-sm text-muted-foreground">Collect action items after calendar events tagged “Ari”.</p>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <Badge variant="secondary">Active</Badge>
                          <Switch defaultChecked />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="backups" className="space-y-6">
                  {/* Alert Messages */}
                  {message && (
                    <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
                      {message.type === 'error' ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <AlertTitle>{message.type === 'error' ? 'Error' : 'Success'}</AlertTitle>
                      <AlertDescription>{message.text}</AlertDescription>
                    </Alert>
                  )}

                  {/* Backup Statistics */}
                  {backupStats && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Last Export Statistics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Tables Exported:</span>
                            <span className="ml-2">{backupStats.tables}</span>
                          </div>
                          <div>
                            <span className="font-medium">Total Records:</span>
                            <span className="ml-2">{backupStats.totalRows}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Import Progress */}
                  {importProgress && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Import Progress</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Processing records...</span>
                            <span>{importProgress.current} / {importProgress.total}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Import Confirmation Dialog */}
                  <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-red-500" />
                          Confirm Database Import
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                          <p>
                            <strong>⚠️ WARNING:</strong> This action will permanently delete all existing data in your database and replace it with the backup data.
                          </p>
                          <p>This includes:</p>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            <li>All tasks and their completion history</li>
                            <li>All fitness activities and records</li>
                            <li>All contacts and their information</li>
                            <li>All fitness completion history</li>
                            <li>ALL tables and data in your database (automatically discovered)</li>
                          </ul>
                          <p>
                            <strong>File to import:</strong> {selectedFile?.name}
                          </p>

                          {/* Validation Results */}
                          {validationResult && (
                            <div className="border rounded p-3 space-y-2">
                              <h4 className="font-medium text-sm">📋 Validation Results:</h4>

                              {validationResult.valid && (
                                <div className="flex items-center gap-2 text-green-600 text-sm">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>SQL file passed all validation checks</span>
                                </div>
                              )}

                              {validationResult.warnings && validationResult.warnings.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-yellow-600 font-medium text-sm">⚠️ Warnings ({validationResult.warnings.length}):</p>
                                  <ul className="text-xs text-yellow-700 ml-4">
                                    {validationResult.warnings.slice(0, 3).map((warning, idx) => (
                                      <li key={idx}>• {warning}</li>
                                    ))}
                                    {validationResult.warnings.length > 3 && (
                                      <li>• ... and {validationResult.warnings.length - 3} more</li>
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          <p className="text-red-600 font-medium">
                            This action cannot be undone. Are you sure you want to continue?
                          </p>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowConfirmDialog(false)}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleConfirmedImport}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          Yes, Replace All Data
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Export Card */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Download className="h-5 w-5" />
                          Export Database
                        </CardTitle>
                        <CardDescription>
                          Automatically discovers and exports ALL tables in your database as an SQL file
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={handleExport}
                          disabled={exportLoading}
                          className="w-full"
                        >
                          {exportLoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Exporting...
                            </>
                          ) : (
                            <>
                              <Download className="mr-2 h-4 w-4" />
                              Export Database
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-3">
                          This will automatically discover and export ALL tables in your database
                        </p>
                      </CardContent>
                    </Card>

                    {/* Import Card */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Upload className="h-5 w-5" />
                          Import Database
                        </CardTitle>
                        <CardDescription>
                          Restore your database from a previously exported SQL file
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <Input
                            type="file"
                            accept=".sql"
                            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                            disabled={importLoading}
                          />
                          <Button
                            onClick={handleImportClick}
                            disabled={importLoading || !selectedFile}
                            className="w-full"
                            variant="outline"
                          >
                            {importLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importing...
                              </>
                            ) : (
                              <>
                                <Upload className="mr-2 h-4 w-4" />
                                Import Database
                              </>
                            )}
                          </Button>
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Warning</AlertTitle>
                            <AlertDescription>
                              Importing will replace all existing data in your database
                            </AlertDescription>
                          </Alert>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                </TabsContent>
              </Tabs>

              {savedMessage && (
                <div className="sticky bottom-6 flex items-center justify-between rounded-xl border border-emerald-500/50 bg-emerald-50 px-6 py-4 text-sm text-emerald-700 shadow-lg shadow-emerald-500/10">
                  <span>{savedMessage}</span>
                  <Button variant="outline" size="sm" onClick={() => setSavedMessage(null)}>
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
