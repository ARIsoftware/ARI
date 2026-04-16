"use client"

import { useState, useEffect, useMemo } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TopBar } from "@/components/top-bar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Github,
  Grid3X3,
  Info,
  KeyRound,
  LayoutList,
  Loader2,
  Lock,
  Package,
  Plus,
  Save,
  X,
} from "lucide-react"
import { LICENSE_CACHE_KEY, LIBRARY_CACHE_KEY, CACHE_TTL } from "@/lib/license-helpers"

// Strip HTML tags from module names for safe display
function sanitizeDisplayName(name: string): string {
  // Iteratively strip tags to handle partial/nested tags like "<scr<script>ipt>"
  let sanitized = name
  let prev = ''
  while (sanitized !== prev) {
    prev = sanitized
    sanitized = sanitized.replace(/<[^>]*>/g, '')
  }
  return sanitized.trim() || 'Unknown'
}

// Icon mapping for library modules (external API doesn't provide icons)
const MODULE_ICONS: Record<string, string> = {
  "tasks": "CheckSquare",
  "dashboard": "BarChart3",
  "contacts": "Users",
  "notepad": "StickyNote",
  "daily-fitness": "Dumbbell",
  "world-clock": "Clock",
  "northstar": "Compass",
  "assist": "Bot",
  "hyrox": "Timer",
  "knowledge-manager": "BookOpen",
  "documents": "FileText",
  "motivation": "Flame",
  "gratitude": "Heart",
  "quotes": "Quote",
  "shipments": "Package",
  "mail-stream": "Mail",
  "major-projects": "FolderKanban",
  "memento": "Camera",
  "my-prospects": "Target",
  "radar": "Radar",
}

interface LibraryModule {
  name: string
  title: string
  description: string
  access: "free" | "commercial"
  latest_version: string
  download_enabled: boolean
  locked: boolean
}

function getCached<T>(key: string): T | null {
  try {
    const cached = sessionStorage.getItem(key)
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp > CACHE_TTL) {
      sessionStorage.removeItem(key)
      return null
    }
    return data
  } catch { return null }
}

function setCache(key: string, data: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }))
  } catch { /* ignore storage errors */ }
}

type UnifiedModule = {
  id: string
  name: string
  description: string
  icon: string
  version: string
  author?: string
  status: "installed" | "downloadable" | "locked"
  // Installed module fields
  isEnabled?: boolean
  path?: string
  isOverridden?: boolean
  isCustomModule?: boolean
  routes?: any[]
  // Library module fields
  access?: "free" | "commercial"
  libraryModule?: LibraryModule
}

export default function ModulesPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [installedModules, setInstalledModules] = useState<any[]>([])
  const [libraryModules, setLibraryModules] = useState<LibraryModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [viewMode, setViewMode] = useState<"card" | "list">("list")

  // Download state
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadResult, setDownloadResult] = useState<{ module: string, type: 'success' | 'error', message: string } | null>(null)

  // License state
  const [licenseKey, setLicenseKey] = useState("")
  const [licenseLoading, setLicenseLoading] = useState(true)
  const [licenseActivating, setLicenseActivating] = useState(false)
  const [licenseStatus, setLicenseStatus] = useState<{
    active: boolean
    masked_key?: string
    customer_email?: string
    expires_at?: string
    status?: string
    env_key?: string
  } | null>(null)
  const [licenseError, setLicenseError] = useState<string | null>(null)

  // Install success screen state
  const [installSuccess, setInstallSuccess] = useState<{
    moduleId: string
    moduleName: string
    moduleDir: string
    vercel?: boolean
    githubSync?: { success: boolean; commitSha?: string; error?: string; message?: string } | null
    migrationResult?: {
      status: 'running' | 'success' | 'skipped' | 'failed' | 'none'
      results?: Array<{ name: string; status: string; error?: string }>
      error?: string
    }
  } | null>(null)
  const [githubSyncEnabled, setGithubSyncEnabled] = useState(true)
  const [githubConfigured, setGithubConfigured] = useState<boolean | null>(null)
  const [githubConfig, setGithubConfig] = useState<{ owner?: string; repo?: string; branch?: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isVercel, setIsVercel] = useState(false)
  const [showVercelGithubWarning, setShowVercelGithubWarning] = useState(false)

  // Track original enabled states (from server)
  const [originalStates, setOriginalStates] = useState<Record<string, boolean>>({})
  // Track current toggle states (local, may differ from server)
  const [toggleStates, setToggleStates] = useState<Record<string, boolean>>({})

  // Load license status
  useEffect(() => {
    async function loadLicenseStatus() {
      const cached = getCached<typeof licenseStatus>(LICENSE_CACHE_KEY)
      if (cached) {
        setLicenseStatus(cached)
        if (!cached.active && cached.env_key) setLicenseKey(cached.env_key)
        setLicenseLoading(false)
        return
      }

      try {
        const response = await fetch('/api/license/status')
        if (response.ok) {
          const data = await response.json()
          setLicenseStatus(data)
          if (!data.active && data.env_key) setLicenseKey(data.env_key)
          setCache(LICENSE_CACHE_KEY, data)
        }
      } catch (error) {
        console.error('Error loading license status:', error)
      } finally {
        setLicenseLoading(false)
      }
    }
    loadLicenseStatus()
  }, [])

  const activateLicense = async () => {
    if (!licenseKey.trim()) return
    setLicenseActivating(true)
    setLicenseError(null)

    try {
      const response = await fetch('/api/license/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseKey.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        setLicenseError(data.error || 'Failed to validate license key')
        return
      }

      // Refresh license status
      const statusResponse = await fetch('/api/license/status')
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        setLicenseStatus(statusData)
        setCache(LICENSE_CACHE_KEY, statusData)
      }
      setLicenseKey("")

      // Refresh library with new license (bypass cache)
      sessionStorage.removeItem(LIBRARY_CACHE_KEY)
      await loadLibrary(false)
    } catch (error) {
      console.error('Error activating license:', error)
      setLicenseError('Failed to activate license. Please try again.')
    } finally {
      setLicenseActivating(false)
    }
  }

  const deactivateLicense = async () => {
    try {
      const response = await fetch('/api/license/status', { method: 'DELETE' })
      if (response.ok) {
        setLicenseStatus({ active: false })
        setLicenseError(null)
        try {
          sessionStorage.removeItem(LICENSE_CACHE_KEY)
          sessionStorage.removeItem(LIBRARY_CACHE_KEY)
        } catch { /* ignore */ }
        // Refresh library without license
        await loadLibrary(false)
      }
    } catch (error) {
      console.error('Error deactivating license:', error)
    }
  }

  // Load installed modules
  const loadInstalledModules = async () => {
    try {
      setModulesLoading(true)
      const response = await fetch('/api/modules/all')
      if (response.ok) {
        const data = await response.json()
        const modules = data.modules || []
        setInstalledModules(modules)

        const initialStates: Record<string, boolean> = {}
        modules.forEach((module: any) => {
          initialStates[module.id] = module.isEnabled
        })
        setOriginalStates(initialStates)
        setToggleStates(initialStates)
      }
    } catch (error) {
      console.error('Error loading installed modules:', error)
    } finally {
      setModulesLoading(false)
    }
  }

  // Load library modules
  const loadLibrary = async (useCache = true) => {
    if (useCache) {
      const cached = getCached<{ modules: LibraryModule[], valid_license: boolean }>(LIBRARY_CACHE_KEY)
      if (cached) {
        setLibraryModules(cached.modules || [])
        setLibraryLoading(false)
        return
      }
    }

    try {
      setLibraryLoading(true)
      setLibraryError(null)
      const response = await fetch('/api/modules/library')
      if (response.ok) {
        const data = await response.json()
        setLibraryModules(data.modules || [])
        setCache(LIBRARY_CACHE_KEY, data)
      } else {
        const err = await response.json().catch(() => ({}))
        setLibraryError(err.error || 'Failed to load module library')
      }
    } catch (error) {
      console.error('Error loading module library:', error)
      setLibraryError('Failed to connect to module library')
    } finally {
      setLibraryLoading(false)
    }
  }

  // Check GitHub configuration
  useEffect(() => {
    async function checkGitHub() {
      try {
        const response = await fetch('/api/modules/github-sync')
        if (response.ok) {
          const data = await response.json()
          setGithubConfigured(data.configured)
          if (data.isVercel) setIsVercel(true)
          if (data.configured) {
            setGithubConfig({ owner: data.owner, repo: data.repo, branch: data.branch })
          }
        }
      } catch {
        setGithubConfigured(false)
      }
    }
    checkGitHub()
  }, [])

  useEffect(() => {
    loadInstalledModules()
    loadLibrary()
  }, [])

  // Build unified module list
  const unifiedModules = useMemo((): UnifiedModule[] => {
    const installedIds = new Set(installedModules.map((m: any) => m.id))

    // Map installed modules
    const installed: UnifiedModule[] = installedModules.map((m: any) => {
      const libraryMatch = libraryModules.find(lm => lm.name === m.id)
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        icon: m.icon,
        version: m.version,
        author: m.author,
        status: "installed" as const,
        isEnabled: m.isEnabled,
        path: m.path,
        isOverridden: m.isOverridden,
        isCustomModule: m.path?.includes('/modules-custom/'),
        routes: m.routes,
        access: libraryMatch?.access,
      }
    })

    // Library-only modules (not installed)
    const libraryOnly: UnifiedModule[] = libraryModules
      .filter(lm => !installedIds.has(lm.name))
      .map(lm => ({
        id: lm.name,
        name: lm.title,
        description: lm.description,
        icon: MODULE_ICONS[lm.name] || "Package",
        version: lm.latest_version,
        status: (lm.download_enabled ? "downloadable" : "locked") as "downloadable" | "locked",
        access: lm.access,
        libraryModule: lm,
      }))

    // Sort: installed first (alphabetical), then downloadable (alphabetical), then locked (alphabetical)
    const statusOrder = { installed: 0, downloadable: 1, locked: 2 }
    return [...installed, ...libraryOnly].sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status]
      if (orderDiff !== 0) return orderDiff
      return a.name.localeCompare(b.name)
    })
  }, [installedModules, libraryModules])

  const totalCount = unifiedModules.length
  const isLoading = modulesLoading || libraryLoading

  // Compute pending changes
  const pendingChanges = useMemo(() => {
    return Object.entries(toggleStates).filter(
      ([moduleId, enabled]) => originalStates[moduleId] !== enabled
    )
  }, [originalStates, toggleStates])

  const hasChanges = pendingChanges.length > 0

  const toggleModule = (moduleId: string) => {
    setToggleStates(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }))
    setMessage(null)
  }

  const discardChanges = () => {
    setToggleStates(originalStates)
    setMessage(null)
  }

  const saveChanges = async () => {
    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/modules/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: pendingChanges.map(([moduleId, enabled]) => ({ moduleId, enabled }))
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Extract specific per-module errors from batch response
        const moduleErrors = data.results
          ?.filter((r: any) => !r.success && r.error)
          .map((r: any) => r.error)
        const errorDetail = moduleErrors?.length > 0
          ? moduleErrors.join('; ')
          : (data.error || 'Failed to save changes')
        throw new Error(errorDetail)
      }

      // Log schema warnings (e.g. "relation already exists") but still reload
      if (data.warnings?.length > 0) {
        console.warn('Module schema warnings:', data.warnings)
      }

      window.location.reload()
    } catch (error) {
      console.error('Error saving module changes:', error)
      const errorText = error instanceof Error ? error.message : 'Failed to save changes'
      setMessage({ type: 'error', text: `${errorText}. Please try again.` })
      setIsSaving(false)
    }
  }

  const downloadModule = async (mod: UnifiedModule) => {
    if (!mod.libraryModule) return

    // On Vercel without GitHub configured, show warning instead of proceeding
    if (isVercel && githubConfigured === false) {
      setShowVercelGithubWarning(true)
      return
    }

    setDownloading(mod.id)
    setDownloadResult(null)

    try {
      const response = await fetch('/api/modules/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: mod.libraryModule.name,
          version: mod.libraryModule.latest_version,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setDownloadResult({ module: mod.id, type: 'error', message: data.error || 'Download failed' })
        return
      }

      // Clear download banner — the success modal replaces it
      setDownloadResult(null)

      const hasMigrations = data.sqlMigrations && data.sqlMigrations.length > 0

      // Show install success screen
      setInstallSuccess({
        moduleId: mod.id,
        moduleName: sanitizeDisplayName(mod.name),
        moduleDir: data.moduleDir || `modules-core/${mod.id}`,
        vercel: data.vercel,
        githubSync: data.githubSync || null,
        migrationResult: hasMigrations
          ? { status: 'running' }
          : { status: 'none' },
      })
      setSyncResult(null)

      // Auto-run database migrations if present
      if (hasMigrations) {
        try {
          const migrateResponse = await fetch('/api/modules/migrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              moduleId: mod.id,
              migrations: data.sqlMigrations,
            }),
          })
          const migrateData = await migrateResponse.json()

          if (!migrateResponse.ok) {
            setInstallSuccess(prev => prev ? {
              ...prev,
              migrationResult: { status: 'failed', error: migrateData.error || 'Migration request failed' },
            } : null)
          } else {
            const allSkipped = migrateData.results?.every((r: any) => r.status === 'skipped')
            setInstallSuccess(prev => prev ? {
              ...prev,
              migrationResult: {
                status: migrateData.success ? (allSkipped ? 'skipped' : 'success') : 'failed',
                results: migrateData.results,
                error: migrateData.results?.find((r: any) => r.status === 'failed')?.error,
              },
            } : null)
          }
        } catch (err: unknown) {
          setInstallSuccess(prev => prev ? {
            ...prev,
            migrationResult: { status: 'failed', error: 'Failed to connect to migration endpoint' },
          } : null)
        }
      }

      // On Vercel, GitHub sync is required to persist the module
      if (data.vercel) {
        setGithubSyncEnabled(true)
      }

      // Re-fetch both APIs to reflect the newly installed module
      sessionStorage.removeItem(LIBRARY_CACHE_KEY)
      await Promise.all([loadInstalledModules(), loadLibrary(false)])
    } catch (error) {
      console.error('Error downloading module:', error)
      setDownloadResult({ module: mod.id, type: 'error', message: 'Failed to download module' })
    } finally {
      setDownloading(null)
    }
  }

  const handleInstallDone = async () => {
    // If already synced server-side (Vercel auto-sync), skip client-side github-sync call
    if (installSuccess?.githubSync?.success) {
      try { await fetch('/api/modules/refresh', { method: 'POST' }) } catch (err) { console.warn('Failed to refresh module registry:', err) }
      setInstallSuccess(null)
      return
    }

    // On Vercel without GitHub configured, warn user
    if (installSuccess?.vercel && !githubConfigured) {
      setSyncResult({ type: 'error', message: 'GitHub is not configured. This module will not persist after the next Vercel deployment. Configure GITHUB_TOKEN to save modules permanently.' })
      return
    }

    if (githubSyncEnabled && githubConfigured && installSuccess) {
      setSyncing(true)
      setSyncResult(null)
      try {
        const response = await fetch('/api/modules/github-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moduleId: installSuccess.moduleId,
            moduleDir: installSuccess.moduleDir,
          }),
        })
        const data = await response.json()
        if (!response.ok) {
          setSyncResult({ type: 'error', message: data.error || 'Failed to sync to GitHub' })
          return // Keep modal open so user can see the error
        }
        setSyncResult({ type: 'success', message: data.message })
      } catch {
        setSyncResult({ type: 'error', message: 'Failed to connect to GitHub' })
        return // Keep modal open so user can see the error
      } finally {
        setSyncing(false)
      }
    }
    // Trigger registry refresh
    try {
      await fetch('/api/modules/refresh', { method: 'POST' })
    } catch (err) { console.warn('Failed to refresh module registry:', err) }

    setInstallSuccess(null)
  }

  const renderModuleAction = (mod: UnifiedModule) => {
    if (mod.status === "installed") {
      const isEnabled = toggleStates[mod.id] ?? mod.isEnabled
      const hasChanged = originalStates[mod.id] !== toggleStates[mod.id]
      const isOverridden = mod.isOverridden === true

      return (
        <div className={`flex items-center gap-3 ${isOverridden ? 'opacity-30' : ''}`}>
          <span className={`text-sm font-medium ${hasChanged ? 'text-amber-600' : 'text-muted-foreground'}`}>
            {isEnabled ? 'On' : 'Off'}
          </span>
          <Switch
            checked={isEnabled}
            onCheckedChange={() => toggleModule(mod.id)}
            disabled={isOverridden}
          />
        </div>
      )
    }

    if (mod.status === "downloadable") {
      const isDownloading = downloading === mod.id
      return (
        <Button
          size="sm"
          className="bg-[#148962] hover:bg-[#117a56] text-white"
          disabled={isDownloading}
          onClick={() => downloadModule(mod)}
        >
          {isDownloading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Install
            </>
          )}
        </Button>
      )
    }

    // Locked
    return (
      <Button
        size="sm"
        variant="outline"
        className="text-muted-foreground border-muted cursor-default hover:bg-transparent hover:text-muted-foreground"
        disabled
      >
        <Lock className="mr-2 h-4 w-4" />
        Locked
      </Button>
    )
  }

  const AccessBadge = ({ access }: { access?: string }) => {
    if (!access) return null
    const isFree = access === "free"
    return (
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 ${isFree ? 'border-green-500/40 text-green-600' : 'border-amber-500/40 text-amber-600'}`}
      >
        {isFree ? 'FREE' : 'PREMIUM'}
      </Badge>
    )
  }

  const renderAccessBadge = (mod: UnifiedModule) => {
    if (mod.status === "installed") {
      let badgeColor: string | null = null
      let badgeText: string | null = null
      if (mod.isOverridden) {
        badgeColor = '#dc2626'
        badgeText = 'OVERRIDDEN'
      } else if (mod.isCustomModule) {
        badgeColor = '#07be07'
        badgeText = 'USER MODULE'
      } else {
        badgeColor = '#000000'
        badgeText = 'CORE MODULE'
      }

      return (
        <div className="flex items-center gap-1.5">
          {badgeColor && badgeText && (
            <Badge
              className="text-[10px] px-1.5 py-0 text-white"
              style={{ backgroundColor: badgeColor }}
            >
              {badgeText}
            </Badge>
          )}
          <AccessBadge access={mod.access} />
        </div>
      )
    }

    return <AccessBadge access={mod.access} />
  }

  return (
    <div className="min-h-screen bg-background">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Modules</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </TopBar>

          <main className="flex-1 bg-background">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8 pb-24">
              {/* Header */}
              <div className="flex flex-col gap-3">
                <Badge className="w-fit text-sm font-medium bg-[#148962] hover:bg-[#117a56] text-white">Browse & Install</Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Module Library</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Discover, install, and manage modules to extend your app. Free modules can be downloaded instantly. Premium modules require a license key.
                  <br /><span className="text-red-600">Note: Always assess third-party modules to ensure they are trustworthy and secure.</span>
                </p>
              </div>

              {message && (
                <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{message.text}</AlertDescription>
                </Alert>
              )}

              {/* License Activation Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <KeyRound className="h-5 w-5 text-amber-500" />
                    {licenseStatus?.active ? 'License Active' : 'Activate Your License'}
                  </CardTitle>
                  {!licenseStatus?.active && (
                    <CardDescription>
                      Enter your license key to unlock all premium modules
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {licenseLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking license status...
                    </div>
                  ) : licenseStatus?.active ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="text-sm font-medium">License is active</span>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Key: <code className="px-1 py-0.5 bg-muted rounded text-xs">{licenseStatus.masked_key}</code></p>
                        {licenseStatus.customer_email && (
                          <p>Email: {licenseStatus.customer_email}</p>
                        )}
                        {licenseStatus.expires_at && (
                          <p>Expires: {new Date(licenseStatus.expires_at).toLocaleDateString()}</p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={deactivateLicense}
                      >
                        Deactivate
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="XXXX-XXXX-XXXX-XXXX"
                            value={licenseKey}
                            onChange={(e) => {
                              setLicenseKey(e.target.value)
                              setLicenseError(null)
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && activateLicense()}
                            className="pl-9"
                          />
                        </div>
                        <Button
                          onClick={activateLicense}
                          disabled={licenseActivating || !licenseKey.trim()}
                        >
                          {licenseActivating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Validating...
                            </>
                          ) : (
                            'Activate'
                          )}
                        </Button>
                      </div>
                      {licenseError && (
                        <p className="text-sm text-destructive">{licenseError}</p>
                      )}
                      <p className="mt-[20px]" style={{ color: '#222', fontSize: '.85rem' }}>
                        Your license key was sent to your email after purchase.{' '}
                        <a
                          href="https://ari.software/#download"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-foreground"
                        >
                          Need a license key?
                        </a>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Download Result Banner */}
              {downloadResult && (
                <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                  downloadResult.type === 'success'
                    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
                    : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
                }`}>
                  {downloadResult.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  {downloadResult.message}
                  <button
                    className="ml-auto"
                    onClick={() => setDownloadResult(null)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* View Toggle Bar */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {isLoading ? 'Loading...' : `${totalCount} module${totalCount !== 1 ? 's' : ''}`}
                </span>
                <div className="flex items-center gap-1 rounded-lg border p-1">
                  <button
                    onClick={() => setViewMode("card")}
                    className={`rounded-md p-1.5 transition-colors ${viewMode === "card" ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <LayoutList className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Modules */}
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading modules...</p>
                </div>
              ) : unifiedModules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Package className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No modules found</p>
                </div>
              ) : viewMode === "card" ? (
                /* Card View */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {unifiedModules.map((mod) => {
                    const Icon = getLucideIcon(mod.icon)
                    const hasChanged = mod.status === "installed" && originalStates[mod.id] !== toggleStates[mod.id]

                    return (
                      <Card
                        key={mod.id}
                        className={`flex flex-col transition-colors ${
                          hasChanged ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20' : 'hover:border-foreground/20'
                        } ${mod.status === "locked" ? 'opacity-60' : ''}`}
                      >
                        <CardHeader className="flex-1 pb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                              <Icon className="h-5 w-5 text-foreground" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-sm font-semibold">{mod.name}</CardTitle>
                                {hasChanged && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">
                                    UNSAVED
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {renderAccessBadge(mod)}
                                <span className="text-[10px] text-muted-foreground">v{mod.version}</span>
                              </div>
                            </div>
                          </div>
                          <CardDescription className="text-xs mt-2 leading-relaxed">
                            {mod.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {renderModuleAction(mod)}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                /* List View */
                <div className="flex flex-col gap-2">
                  {unifiedModules.map((mod) => {
                    const Icon = getLucideIcon(mod.icon)
                    const hasChanged = mod.status === "installed" && originalStates[mod.id] !== toggleStates[mod.id]

                    return (
                      <div
                        key={mod.id}
                        className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
                          hasChanged ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20' : ''
                        } ${mod.status === "locked" ? 'opacity-60' : ''}`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icon className="h-5 w-5 text-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{mod.name}</p>
                            {renderAccessBadge(mod)}
                            <span className="text-[10px] text-muted-foreground">v{mod.version}</span>
                            {hasChanged && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">
                                UNSAVED
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{mod.description}</p>
                        </div>
                        <div className="shrink-0">
                          {renderModuleAction(mod)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Library error with retry */}
              {libraryError && !libraryLoading && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <AlertCircle className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{libraryError}</p>
                  <Button variant="outline" size="sm" onClick={() => loadLibrary(false)}>
                    Retry
                  </Button>
                </div>
              )}
            </div>
          </main>

          {/* Install Success Full-Screen Overlay */}
          {!!installSuccess && (
            <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
              <div className="flex flex-col items-center text-center w-full max-w-md px-6">
                {/* Large green checkmark */}
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 ring-4 ring-green-200/50 dark:ring-green-800/30 shadow-lg mb-6">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>

                {/* Title and subtitle */}
                <h1 className="text-3xl font-bold tracking-tight mb-2">Module Installed</h1>
                <p className="text-muted-foreground mb-8">Your installation was successful</p>

                {/* Status card */}
                <div className="w-full rounded-lg border p-4 space-y-3 mb-8">
                  {/* GitHub Sync Section — three states */}
                  {installSuccess?.githubSync?.success === true ? (
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <Github className="h-4 w-4" />
                          <span className="text-sm font-medium">Saved to GitHub</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {installSuccess.githubSync.message || 'Module committed successfully.'}
                        </p>
                      </div>
                    </div>
                  ) : installSuccess?.githubSync?.success === false ? (
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <Github className="h-4 w-4" />
                          <span className="text-sm font-medium">GitHub Sync Failed</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {installSuccess.githubSync.error || 'Failed to commit module to GitHub.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={githubSyncEnabled && !!githubConfigured}
                        onChange={(e) => setGithubSyncEnabled(e.target.checked)}
                        disabled={!githubConfigured || !!installSuccess?.vercel}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <Github className="h-4 w-4" />
                          <span className="text-sm font-medium">Save to GitHub</span>
                          {installSuccess?.vercel && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Required</Badge>
                          )}
                        </div>
                        {githubConfigured ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Commit module files to{' '}
                            <code className="px-1 py-0.5 bg-muted rounded text-[11px]">
                              {githubConfig?.owner}/{githubConfig?.repo}
                            </code>
                            {installSuccess?.vercel
                              ? '. This is required on Vercel — modules are not persisted without a GitHub commit.'
                              : ' for backup and version control.'
                            }
                          </p>
                        ) : (
                          <div className="mt-1 space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {installSuccess?.vercel
                                ? 'GitHub sync is required on Vercel to persist modules. Without it, this module will be lost on the next deployment.'
                                : 'To keep this module permanently, save it to GitHub. Otherwise it will be removed the next time your app rebuilds from GitHub.'
                              }
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Set <code className="px-1 py-0.5 bg-muted rounded text-[11px]">GITHUB_TOKEN</code> and repo details in your environment variables to enable.{' '}
                              <a
                                href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                Learn how
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </p>
                          </div>
                        )}
                      </div>
                    </label>
                  )}

                  {/* Database Migration Section */}
                  {installSuccess?.migrationResult?.status && installSuccess.migrationResult.status !== 'none' && (
                    <div className="flex items-center gap-3">
                      {installSuccess.migrationResult.status === 'running' ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
                      ) : installSuccess.migrationResult.status === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      ) : installSuccess.migrationResult.status === 'skipped' ? (
                        <Info className="h-5 w-5 text-blue-500 shrink-0" />
                      ) : installSuccess.migrationResult.status === 'failed' ? (
                        <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                      ) : null}
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {installSuccess.migrationResult.status === 'running'
                              ? 'Running database migrations...'
                              : installSuccess.migrationResult.status === 'success'
                              ? 'Database updated'
                              : installSuccess.migrationResult.status === 'skipped'
                              ? 'Database already up to date'
                              : installSuccess.migrationResult.status === 'failed'
                              ? 'Database migration failed'
                              : ''}
                          </span>
                        </div>
                        {installSuccess.migrationResult.status === 'success' && installSuccess.migrationResult.results && (() => {
                          const appliedCount = installSuccess.migrationResult!.results!.filter(r => r.status === 'applied').length
                          return (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {appliedCount} migration{appliedCount !== 1 ? 's' : ''} applied
                            </p>
                          )
                        })()}
                        {installSuccess.migrationResult.status === 'failed' && installSuccess.migrationResult.error && (
                          <p className="text-xs text-red-600 mt-0.5">
                            {installSuccess.migrationResult.error}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Vercel rebuilding notice */}
                  {installSuccess?.vercel && installSuccess?.githubSync?.success === true && (
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 shrink-0 flex items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-muted-foreground">
                          Vercel is rebuilding. Module will be ready once Vercel rebuild has completed.
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Estimated time 1 to 2 minutes.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sync Result (for client-side sync attempts) */}
                {syncResult && (
                  <div className="w-full mb-6">
                    <Alert variant={syncResult.type === 'error' ? 'destructive' : 'default'}>
                      {syncResult.type === 'success' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      <AlertDescription className="text-xs">{syncResult.message}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {/* Separator and close text */}
                <div className="w-full border-t mb-4" />
                <p className="text-sm text-muted-foreground mb-4">You can close this window.</p>

                {/* Action Button */}
                {installSuccess?.githubSync?.success === false ? (
                  <Button
                    className="w-full"
                    variant="destructive"
                    onClick={() => {
                      const moduleId = installSuccess?.moduleId
                      setInstallSuccess(null)
                      const mod = moduleId ? unifiedModules.find(m => m.id === moduleId) : null
                      if (mod) downloadModule(mod)
                    }}
                  >
                    Retry Install
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-foreground text-background hover:bg-foreground/90"
                    onClick={handleInstallDone}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing to GitHub...
                      </>
                    ) : (
                      'Close Window'
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Vercel GitHub Warning */}
          <AlertDialog open={showVercelGithubWarning} onOpenChange={setShowVercelGithubWarning}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>GitHub Token Required</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      Module installation on Vercel requires a GitHub token. Without it, modules cannot be installed because Vercel&apos;s filesystem is read-only.
                    </p>
                    <p>
                      To enable module installation, add these environment variables in your Vercel project settings:
                    </p>
                    <div className="rounded-md bg-muted p-3 space-y-1 text-xs font-mono">
                      <p>GITHUB_TOKEN</p>
                      <p>GITHUB_REPO_OWNER</p>
                      <p>GITHUB_REPO_NAME</p>
                    </div>
                    <p>
                      <a
                        href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        Learn how to create a GitHub token
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Sticky Save Bar */}
          {hasChanges && (
            <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg">
              <div className="mx-auto max-w-6xl px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-sm text-muted-foreground">
                      {pendingChanges.length} module{pendingChanges.length !== 1 ? 's' : ''} will be {pendingChanges.some(([, enabled]) => enabled) && pendingChanges.some(([, enabled]) => !enabled) ? 'changed' : pendingChanges[0]?.[1] ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={discardChanges}
                      disabled={isSaving}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Discard
                    </Button>
                    <Button
                      onClick={saveChanges}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
