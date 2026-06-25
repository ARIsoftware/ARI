"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertCircle,
  ArrowRight,
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
import type { SchemaInstallResult } from "@/lib/modules/schema-installer"
import { TARGET_EXISTS_CODE, type ConflictType } from "@/lib/modules/install-types"

type SchemaStatus = 'success' | 'skipped' | 'failed' | 'none'

function decodeSchemaStatus(s: SchemaInstallResult | null | undefined): SchemaStatus {
  if (!s) return 'none'
  if (s.ok) return 'success'
  if (s.alreadyExisted) return 'skipped'
  return 'failed'
}

const SCHEMA_DISPLAY: Record<Exclude<SchemaStatus, 'none'>, { Icon: typeof CheckCircle2; iconClass: string; label: string }> = {
  success: { Icon: CheckCircle2, iconClass: 'text-green-600', label: 'Database schema installed' },
  skipped: { Icon: Info, iconClass: 'text-blue-500', label: 'Database already up to date' },
  failed: { Icon: AlertCircle, iconClass: 'text-red-600', label: 'Schema install failed' },
}

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
  /**
   * Optional. Set by the marketplace upstream when a module declares
   * npmDependencies in its module.json. When present and non-empty, the
   * install flow shows a confirmation dialog listing the packages before
   * pnpm runs. Absent on older marketplace responses — install proceeds
   * without a dialog in that case (graceful degrade).
   */
  npm_dependencies?: Record<string, string>
}

type StageKey = 'extract' | 'npm' | 'github' | 'schema'
type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'

type InstallProgress = {
  moduleId: string
  moduleName: string
  stages: {
    extract: { status: StageStatus }
    npm: {
      status: StageStatus
      packages?: string[]
      detail?: string
      installed?: string[]
      error?: string
      conflict?: { name: string; declared: string; existing: string }
    }
    github: { status: StageStatus; commitSha?: string; filesCommitted?: number; error?: string }
    schema: { status: StageStatus; alreadyExisted?: boolean; error?: string }
  }
  log: string[]      // recent stderr/spawn lines from the installer
  fatalError?: string
  finished?: boolean
  vercel?: boolean
  firstRoute?: string
}

const STAGE_LABELS: Record<StageKey, string> = {
  extract: 'Extracting module files',
  npm: 'Installing dependencies',
  github: 'Saving to GitHub',
  schema: 'Setting up database',
}

type ApiErrorPayload = { code?: string; message?: string } | string | undefined

function parseApiError(raw: ApiErrorPayload, fallbackMessage: string): { code: string | null; message: string } {
  if (!raw) return { code: null, message: fallbackMessage }
  if (typeof raw === 'string') return { code: null, message: raw }
  return { code: raw.code ?? null, message: raw.message ?? fallbackMessage }
}

function getErrorCopy(code: string, fallback: string): string {
  if (code === 'UPSTREAM_UNAVAILABLE') {
    return "We couldn't validate your license right now, please try again in a few minutes."
  }
  if (code === 'RATE_LIMITED') {
    return `${fallback}, try again in a few minutes.`
  }
  return fallback
}

const PAGE_ERROR_CODES = new Set(['UPSTREAM_UNAVAILABLE', 'RATE_LIMITED'])

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

  // Welcome popup state — shows every visit until user explicitly dismisses it
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [welcomeStep, setWelcomeStep] = useState<1 | 2>(1)

  const dismissWelcomeForever = () => {
    try {
      localStorage.setItem('ari:modules:welcomeDismissed', '1')
    } catch {
      /* ignore storage errors */
    }
    setWelcomeOpen(false)
    setWelcomeStep(1)
  }

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
  const [pageError, setPageError] = useState<{ code: string; message: string } | null>(null)

  // Install success screen state
  const [installSuccess, setInstallSuccess] = useState<{
    moduleId: string
    moduleName: string
    moduleDir: string
    vercel?: boolean
    githubSync?: { success: boolean; commitSha?: string; error?: string; message?: string } | null
    schemaInstallResult?: {
      status: SchemaStatus
      error?: string
    }
    npmInstall?: {
      installed: string[]
      alreadySatisfied?: string[]
    }
    firstRoute?: string
  } | null>(null)
  const router = useRouter()
  // Pre-install confirmation dialog state. When non-null, an AlertDialog
  // listing the module's declared npm packages is shown. Confirming kicks
  // off runInstall(); cancelling clears.
  const [pendingInstall, setPendingInstall] = useState<UnifiedModule | null>(null)
  const [conflictDialog, setConflictDialog] = useState<{
    mod: UnifiedModule
    type: ConflictType
    moduleDir: string
  } | null>(null)
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null)
  const installAbortRef = useRef<AbortController | null>(null)
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

  const syncLicenseKeyFromStatus = (status: NonNullable<typeof licenseStatus>) => {
    if (status.active && status.masked_key) setLicenseKey(status.masked_key)
    else if (!status.active && status.env_key) setLicenseKey(status.env_key)
  }

  // Load license status
  useEffect(() => {
    async function loadLicenseStatus() {
      const cached = getCached<typeof licenseStatus>(LICENSE_CACHE_KEY)
      if (cached) {
        setLicenseStatus(cached)
        syncLicenseKeyFromStatus(cached)
        setLicenseLoading(false)
        return
      }

      try {
        const response = await fetch('/api/license/status')
        if (response.ok) {
          const data = await response.json()
          setLicenseStatus(data)
          syncLicenseKeyFromStatus(data)
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

  // Show welcome popup on every visit unless the user explicitly dismissed it
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('ari:modules:welcomeDismissed')
      if (!dismissed) {
        setWelcomeStep(1)
        setWelcomeOpen(true)
      }
    } catch {
      /* localStorage disabled — default to showing it */
      setWelcomeStep(1)
      setWelcomeOpen(true)
    }
  }, [])

  const activateLicense = async () => {
    if (!licenseKey.trim()) return
    setLicenseActivating(true)
    setLicenseError(null)
    setPageError(null)

    try {
      const response = await fetch('/api/license/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseKey.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        const { code, message } = parseApiError(data.error, 'Failed to validate license key')
        if (code && PAGE_ERROR_CODES.has(code)) {
          setPageError({ code, message: getErrorCopy(code, message) })
        } else {
          setLicenseError(message)
        }
        return
      }

      // Refresh license status
      const statusResponse = await fetch('/api/license/status')
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        setLicenseStatus(statusData)
        setCache(LICENSE_CACHE_KEY, statusData)
        syncLicenseKeyFromStatus(statusData)
      }

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
        setLicenseKey("")
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
      setPageError(null)
      const response = await fetch('/api/modules/library')
      if (response.ok) {
        const data = await response.json()
        setLibraryModules(data.modules || [])
        setCache(LIBRARY_CACHE_KEY, data)
      } else {
        const err = await response.json().catch(() => ({}))
        const { code, message } = parseApiError(err.error, 'Failed to load module library')
        if (code && PAGE_ERROR_CODES.has(code)) {
          setPageError({ code, message: getErrorCopy(code, message) })
          // Fail-closed: keep whatever is already in libraryModules (empty or stale cache)
          // so commercial modules remain locked from their prior render.
        } else {
          setLibraryError(message)
        }
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

  /**
   * Entry point for installing a downloadable module. Performs pre-flight
   * checks (Vercel+GitHub guard, license), then either:
   *   - opens the npm-dependency confirmation dialog (if the module declares
   *     non-empty npm_dependencies in the library response), OR
   *   - calls runInstall directly (for dep-less modules, or marketplace
   *     responses that haven't yet been extended with the npm field).
   */
  const downloadModule = async (mod: UnifiedModule) => {
    if (!mod.libraryModule) return

    if (isVercel && githubConfigured === false) {
      setShowVercelGithubWarning(true)
      return
    }

    const declaredDeps = mod.libraryModule.npm_dependencies
    if (declaredDeps && Object.keys(declaredDeps).length > 0) {
      setPendingInstall(mod)
      return
    }

    await runInstall(mod)
  }

  /**
   * Stream the install over NDJSON. The route emits one JSON object per line
   * across five stages: extract, npm, github, schema, finalize. We update
   * per-stage state as events arrive and roll the final state into
   * `installSuccess` so the existing success modal renders without changes.
   */
  const runInstall = async (mod: UnifiedModule, force: boolean = false) => {
    if (!mod.libraryModule) return

    setDownloading(mod.id)
    setDownloadResult(null)
    setPageError(null)

    const initialProgress: InstallProgress = {
      moduleId: mod.id,
      moduleName: sanitizeDisplayName(mod.name),
      stages: {
        extract: { status: 'pending' },
        npm: { status: 'pending' },
        github: { status: 'pending' },
        schema: { status: 'pending' },
      },
      log: [],
    }
    setInstallProgress(initialProgress)

    // Capture start time so we can hold the progress overlay open for a
    // minimum duration when the install is faster than the human eye.
    // Without this, all-deps-already-satisfied installs flash by in <200ms.
    const installStartedAt = Date.now()
    const MIN_OVERLAY_MS = 1500

    const controller = new AbortController()
    installAbortRef.current = controller

    // Local mutable copy mirroring state. Avoids the "stale state in async
    // loop" trap — every NDJSON event reads/writes this object, then we sync
    // it into React state.
    const progress: InstallProgress = JSON.parse(JSON.stringify(initialProgress))
    const syncProgress = () => setInstallProgress({ ...progress, stages: { ...progress.stages }, log: [...progress.log] })

    const finalize = async (event: any) => {
      progress.finished = true
      progress.vercel = !!event.vercel
      progress.firstRoute = event.firstRoute
      // Push the finished state to the overlay so the spinner becomes a
      // checkmark and the header swaps to "Module Installed" *before* we
      // hold for the minimum display duration below.
      syncProgress()
      // Roll the streamed state into the existing installSuccess shape so
      // the existing success modal (with GitHub sync flow, etc.) keeps working.
      const schemaState = progress.stages.schema
      const githubState = progress.stages.github
      const successPayload = {
        moduleId: mod.id,
        moduleName: sanitizeDisplayName(mod.name),
        moduleDir: event.moduleDir || `modules-custom/${mod.id}`,
        vercel: !!event.vercel,
        githubSync:
          githubState.status === 'done'
            ? {
                success: true,
                commitSha: githubState.commitSha,
                message: `Module committed to GitHub${githubState.filesCommitted ? ` (${githubState.filesCommitted} files)` : ''}.`,
              }
            : githubState.status === 'error'
              ? { success: false, error: githubState.error || 'Failed to commit module to GitHub.' }
              : null,
        schemaInstallResult: {
          status: (
            schemaState.status === 'done'
              ? (schemaState.alreadyExisted ? 'skipped' : 'success')
              : schemaState.status === 'error'
                ? 'failed'
                : 'none'
          ) as SchemaStatus,
          error: schemaState.error,
        },
        npmInstall:
          progress.stages.npm.status === 'done' || progress.stages.npm.status === 'skipped'
            ? {
                installed: progress.stages.npm.installed ?? [],
              }
            : undefined,
        firstRoute: event.firstRoute,
      }

      // Hold the progress overlay visible for at least MIN_OVERLAY_MS total.
      // Fast installs (deps already satisfied) would otherwise blip past
      // before the user can read the stages.
      const elapsed = Date.now() - installStartedAt
      const remaining = MIN_OVERLAY_MS - elapsed
      if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining))
      }

      setInstallSuccess(successPayload)
      setSyncResult(null)
      if (event.vercel) setGithubSyncEnabled(true)
      sessionStorage.removeItem(LIBRARY_CACHE_KEY)
      await Promise.all([loadInstalledModules(), loadLibrary(false)])
    }

    try {
      const response = await fetch('/api/modules/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: mod.libraryModule.name,
          version: mod.libraryModule.latest_version,
          ...(force ? { force: true } : {}),
        }),
        signal: controller.signal,
      })

      // Pre-stream errors come back as JSON, not NDJSON. The route uses
      // proper HTTP status codes for auth/validation/upstream failures.
      const contentType = response.headers.get('content-type') || ''
      if (!response.ok || !contentType.includes('application/x-ndjson')) {
        const data = await response.json().catch(() => ({} as any))
        // Surface the confirmation dialog instead of a generic error toast.
        if (response.status === 409 && data?.error?.code === TARGET_EXISTS_CODE && data?.conflict) {
          setInstallProgress(null)
          setDownloading(null)
          setConflictDialog({ mod, type: data.conflict.type, moduleDir: data.conflict.moduleDir })
          return
        }
        const { code, message } = parseApiError(data?.error, 'Download failed')
        if (code && PAGE_ERROR_CODES.has(code)) {
          setPageError({ code, message: getErrorCopy(code, message) })
        } else {
          setDownloadResult({ module: mod.id, type: 'error', message })
        }
        setInstallProgress(null)
        return
      }

      if (!response.body) {
        setDownloadResult({ module: mod.id, type: 'error', message: 'Empty response from install route' })
        setInstallProgress(null)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIdx
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim()
          buffer = buffer.slice(newlineIdx + 1)
          if (!line) continue
          let event: any
          try {
            event = JSON.parse(line)
          } catch {
            console.warn('[install] Could not parse NDJSON line:', line)
            continue
          }

          // Translate the stream event into our progress shape.
          if (event.stage === 'extract') {
            progress.stages.extract.status = event.status === 'done' ? 'done' : 'running'
          } else if (event.stage === 'npm') {
            const s = progress.stages.npm
            if (event.status === 'start') {
              s.status = 'running'
              s.packages = event.packages ?? []
            } else if (event.status === 'progress') {
              s.status = 'running'
              if (event.detail) {
                progress.log.push(event.detail)
                if (progress.log.length > 8) progress.log.shift()
              }
            } else if (event.status === 'done') {
              s.status = 'done'
              s.installed = event.packages ?? s.installed
              s.detail = event.detail
            } else if (event.status === 'skipped') {
              s.status = 'skipped'
              s.detail = event.detail
            } else if (event.status === 'error') {
              s.status = 'error'
              s.error = event.error
              s.conflict = event.conflict
            }
          } else if (event.stage === 'github') {
            const s = progress.stages.github
            if (event.status === 'start') s.status = 'running'
            else if (event.status === 'done') {
              s.status = 'done'
              s.commitSha = event.commitSha
              s.filesCommitted = event.filesCommitted
            } else if (event.status === 'skipped') s.status = 'skipped'
            else if (event.status === 'error') {
              s.status = 'error'
              s.error = event.error
            }
          } else if (event.stage === 'schema') {
            const s = progress.stages.schema
            if (event.status === 'start') s.status = 'running'
            else if (event.status === 'done') {
              s.status = 'done'
              s.alreadyExisted = event.alreadyExisted
            } else if (event.status === 'skipped') s.status = 'skipped'
            else if (event.status === 'error') {
              s.status = 'error'
              s.error = event.error
            }
          } else if (event.stage === 'finalize') {
            await finalize(event)
          } else if (event.stage === 'fatal') {
            progress.fatalError = event.error
            progress.finished = true
          }

          syncProgress()
        }
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        // User aborted; quietly clear UI.
        setInstallProgress(null)
        return
      }
      console.error('Error downloading module:', error)
      setDownloadResult({ module: mod.id, type: 'error', message: 'Failed to download module' })
      setInstallProgress(null)
    } finally {
      setDownloading(null)
      installAbortRef.current = null
    }
  }

  const abortInstall = () => {
    installAbortRef.current?.abort()
  }

  const handleInstallDone = async (opts?: { openRoute?: string }) => {
    // If already synced server-side (Vercel auto-sync), skip client-side github-sync call
    if (installSuccess?.githubSync?.success) {
      try { await fetch('/api/modules/refresh', { method: 'POST' }) } catch (err) { console.warn('Failed to refresh module registry:', err) }
      setInstallSuccess(null)
      setInstallProgress(null)
      if (opts?.openRoute) router.push(opts.openRoute)
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
    setInstallProgress(null)
    if (opts?.openRoute) router.push(opts.openRoute)
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
        badgeText = 'CUSTOM MODULE'
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
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-8">
                <div className="flex flex-col gap-3">
                  <Badge className="w-fit text-sm font-medium bg-accent hover:bg-accent/90 text-accent-foreground">Browse & Install</Badge>
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground">Module Library</h1>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Discover, install, and manage modules to extend your app. Free modules can be downloaded instantly. Premium modules require a license key.
                    <br /><span className="text-red-600">Note: Always assess third-party modules to ensure they are trustworthy and secure.</span>
                  </p>
                </div>

                <a
                  href="https://ari.software/docs/creating-modules"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex h-[138px] w-full shrink-0 flex-col justify-between gap-3 overflow-hidden rounded-xl bg-accent p-5 text-accent-foreground transition-all hover:shadow-md md:w-80"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-accent-foreground">Build your own modules</p>
                    <p className="text-xs leading-relaxed text-accent-foreground/80">
                      Create your own modules in modules custom modules tailored to your workflow - no coding required!
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground transition-transform group-hover:translate-x-0.5">
                    Learn how
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </a>
              </div>

              {pageError && (
                <div
                  role="alert"
                  className="relative rounded-md"
                  style={{ backgroundColor: '#c00', color: '#fff', fontSize: '1rem', padding: '20px' }}
                >
                  <span className="pr-8">{pageError.message}</span>
                  <button
                    type="button"
                    aria-label="Dismiss error"
                    onClick={() => setPageError(null)}
                    className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <X className="h-4 w-4" color="#fff" />
                  </button>
                </div>
              )}

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
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="XXXX-XXXX-XXXX-XXXX"
                            value={licenseKey}
                            readOnly={!!licenseStatus?.active}
                            onChange={(e) => {
                              setLicenseKey(e.target.value)
                              setLicenseError(null)
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && !licenseStatus?.active && activateLicense()}
                            className="pl-9"
                          />
                        </div>
                        {licenseStatus?.active ? (
                          <Button
                            variant="outline"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={deactivateLicense}
                          >
                            Deactivate
                          </Button>
                        ) : (
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
                        )}
                      </div>
                      {!licenseStatus?.active && licenseError && (
                        <p className="text-sm text-destructive">{licenseError}</p>
                      )}
                      <p className="mt-[20px]" style={{ color: '#222', fontSize: '.85rem' }}>
                        {licenseStatus?.active ? (
                          'License key valid.'
                        ) : (
                          <>
                            Your license key was sent to your email after purchase.{' '}
                            <a
                              href="https://ari.software/#download"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-foreground"
                            >
                              Need a license key?
                            </a>
                          </>
                        )}
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
                        key={mod.path || mod.id}
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
                        key={mod.path || mod.id}
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
                  {/* npm install row — only when the module declared deps */}
                  {installSuccess?.npmInstall && (installSuccess.npmInstall.installed.length > 0 || installSuccess.npmInstall.alreadySatisfied?.length) ? (
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {installSuccess.npmInstall.installed.length > 0
                              ? `Installed ${installSuccess.npmInstall.installed.length} npm package${installSuccess.npmInstall.installed.length === 1 ? '' : 's'}`
                              : 'Dependencies already satisfied'}
                          </span>
                        </div>
                        {installSuccess.npmInstall.installed.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {installSuccess.npmInstall.installed.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

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
                                : `This module lives in modules-custom/${installSuccess?.moduleId}/ on disk. Optionally save to GitHub for backup and version control.`
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

                  {/* Schema Install Section */}
                  {installSuccess?.schemaInstallResult && installSuccess.schemaInstallResult.status !== 'none' && (() => {
                    const { status, error } = installSuccess.schemaInstallResult
                    const display = SCHEMA_DISPLAY[status]
                    const { Icon, iconClass, label } = display
                    return (
                      <div className="flex items-center gap-3">
                        <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            <span className="text-sm font-medium">{label}</span>
                          </div>
                          {status === 'failed' && error && (
                            <p className="text-xs text-red-600 mt-0.5">{error}</p>
                          )}
                        </div>
                      </div>
                    )
                  })()}

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
                      setInstallProgress(null)
                      const mod = moduleId ? unifiedModules.find(m => m.id === moduleId) : null
                      if (mod) downloadModule(mod)
                    }}
                  >
                    Retry Install
                  </Button>
                ) : (
                  <div className="w-full flex gap-2">
                    {installSuccess?.firstRoute && (
                      <Button
                        className="flex-1 bg-[#148962] hover:bg-[#117a56] text-white"
                        onClick={() => handleInstallDone({ openRoute: installSuccess.firstRoute })}
                        disabled={syncing}
                      >
                        Open module
                      </Button>
                    )}
                    <Button
                      className={`${installSuccess?.firstRoute ? 'flex-1' : 'w-full'} bg-foreground text-background hover:bg-foreground/90`}
                      onClick={() => handleInstallDone()}
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
                  </div>
                )}
              </div>
            </div>
          )}

          {/* npm Dependency Confirmation */}
          <AlertDialog
            open={!!pendingInstall}
            onOpenChange={(open) => { if (!open) setPendingInstall(null) }}
          >
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Install Module</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      <span className="font-medium text-foreground">{pendingInstall ? sanitizeDisplayName(pendingInstall.name) : ''}</span>{' '}
                      will add the following npm packages to your project:
                    </p>
                    <div className="rounded-md bg-muted p-3 space-y-1 text-xs font-mono">
                      {pendingInstall?.libraryModule?.npm_dependencies && Object.entries(pendingInstall.libraryModule.npm_dependencies).map(([name, version]) => (
                        <p key={name}>{name}@{version}</p>
                      ))}
                    </div>
                    {isVercel ? (
                      <p className="text-xs text-muted-foreground">
                        On Vercel, these packages will be added to your repository&apos;s <code className="px-1 py-0.5 bg-muted rounded">package.json</code> via the same GitHub commit as the module files. Vercel will auto-deploy.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Packages are installed with <code className="px-1 py-0.5 bg-muted rounded">pnpm add</code>. If any conflict with versions already in your project, the install will abort safely before changing anything.
                      </p>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-[#148962] hover:bg-[#117a56] text-white"
                  onClick={() => {
                    const mod = pendingInstall
                    setPendingInstall(null)
                    if (mod) void runInstall(mod)
                  }}
                >
                  Install
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Install Target Conflict Confirmation */}
          <AlertDialog
            open={!!conflictDialog}
            onOpenChange={(open) => { if (!open) setConflictDialog(null) }}
          >
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {conflictDialog?.type === 'custom_exists'
                    ? 'Module directory already exists'
                    : 'Override built-in module?'}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    {conflictDialog?.type === 'custom_exists' ? (
                      <>
                        <p>
                          The directory <code className="px-1 py-0.5 bg-muted rounded text-[11px]">{conflictDialog.moduleDir}</code> already exists.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Continuing will replace its contents on disk. Any local edits to that module will be lost. Database tables from a previous install are kept.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          A module with this ID already ships with ARI in <code className="px-1 py-0.5 bg-muted rounded text-[11px]">modules-core/{conflictDialog?.mod.id}</code>.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Continuing will create <code className="px-1 py-0.5 bg-muted rounded text-[11px]">{conflictDialog?.moduleDir}</code>, which automatically overrides the built-in version. The built-in copy stays on disk but becomes inactive.
                        </p>
                      </>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-[#148962] hover:bg-[#117a56] text-white"
                  onClick={() => {
                    const mod = conflictDialog!.mod
                    setConflictDialog(null)
                    void runInstall(mod, true)
                  }}
                >
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Live Install Progress (visible while running OR after a fatal error) */}
          {installProgress && !installSuccess && (
            <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
              <div className="flex flex-col items-center text-center w-full max-w-md px-6">
                {installProgress.fatalError ? (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 ring-4 ring-red-200/50 dark:ring-red-800/30 shadow-lg mb-6">
                    <AlertCircle className="h-10 w-10 text-red-600" />
                  </div>
                ) : installProgress.finished ? (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 ring-4 ring-green-200/50 dark:ring-green-800/30 shadow-lg mb-6">
                    <CheckCircle2 className="h-10 w-10 text-green-600" />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 ring-4 ring-blue-200/50 dark:ring-blue-800/30 shadow-lg mb-6">
                    <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                  </div>
                )}

                <h1 className="text-2xl font-bold tracking-tight mb-2">
                  {installProgress.fatalError
                    ? 'Install Failed'
                    : installProgress.finished
                      ? 'Module Installed'
                      : 'Installing Module'}
                </h1>
                <p className="text-muted-foreground mb-6">{installProgress.moduleName}</p>

                <div className="w-full rounded-lg border p-4 space-y-2 mb-6">
                  {(['extract', 'npm', 'github', 'schema'] as const).map((key) => {
                    const stage = installProgress.stages[key]
                    const label = STAGE_LABELS[key]
                    let Icon = Loader2
                    let iconClass = 'text-muted-foreground'
                    let spin = false
                    if (stage.status === 'done') { Icon = CheckCircle2; iconClass = 'text-green-600' }
                    else if (stage.status === 'error') { Icon = AlertCircle; iconClass = 'text-red-600' }
                    else if (stage.status === 'skipped') { Icon = Info; iconClass = 'text-muted-foreground/60' }
                    else if (stage.status === 'running') { spin = true; iconClass = 'text-blue-600' }
                    else { Icon = Info; iconClass = 'text-muted-foreground/40' }

                    return (
                      <div key={key} className="flex items-start gap-3 text-left">
                        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconClass} ${spin ? 'animate-spin' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${stage.status === 'pending' ? 'text-muted-foreground/60' : ''}`}>{label}</p>
                          {key === 'npm' && stage.status === 'running' && (stage as any).packages && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {((stage as any).packages as string[]).join(', ')}
                            </p>
                          )}
                          {(stage as any).detail && stage.status !== 'error' && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{(stage as any).detail}</p>
                          )}
                          {(stage as any).error && (
                            <p className="text-xs text-red-600 mt-0.5">{(stage as any).error}</p>
                          )}
                          {key === 'npm' && (stage as any).conflict && (
                            <p className="text-xs text-red-600 mt-0.5">
                              Needs {(stage as any).conflict.name}@{(stage as any).conflict.declared}, you have {(stage as any).conflict.existing}.
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {installProgress.log.length > 0 && !installProgress.fatalError && (
                  <div className="w-full rounded-md bg-muted/40 p-3 mb-6 max-h-32 overflow-y-auto">
                    {installProgress.log.map((line, i) => (
                      <p key={i} className="text-[11px] font-mono text-muted-foreground text-left truncate">{line}</p>
                    ))}
                  </div>
                )}

                {installProgress.fatalError ? (
                  <div className="w-full flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setInstallProgress(null); setDownloadResult(null) }}
                    >
                      Close
                    </Button>
                    <Button
                      className="flex-1 bg-[#148962] hover:bg-[#117a56] text-white"
                      onClick={() => {
                        const mod = unifiedModules.find(m => m.id === installProgress.moduleId)
                        if (mod) {
                          setInstallProgress(null)
                          void runInstall(mod)
                        }
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                ) : installProgress.finished ? (
                  // Brief "finishing up" state — the hold timer will switch
                  // to the full success modal in ~1.5s. No action needed
                  // from the user during this window.
                  <p className="text-xs text-muted-foreground">Finishing up…</p>
                ) : (
                  <Button variant="outline" className="w-full" onClick={abortInstall}>
                    Cancel install
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

      <Dialog
        open={welcomeOpen}
        onOpenChange={(open) => {
          if (!open) {
            setWelcomeOpen(false)
            setWelcomeStep(1)
          }
        }}
      >
        <DialogContent className="sm:max-w-[36.4rem]">
          {welcomeStep === 1 ? (
            <>
              <div className="-mx-6 -mt-6 mb-2 overflow-hidden rounded-t-lg bg-[#212121]">
                <img
                  src="/ari-create-module-terminal.svg"
                  alt="Terminal showing the /ari-create-module command"
                  className="block h-auto w-full"
                />
              </div>
              <DialogHeader>
                <DialogTitle className="text-xl">Welcome to the Module Library</DialogTitle>
                <DialogDescription className="pt-2 text-base">
                  This is where you discover, install, and manage modules that extend ARI.
                  Free modules install instantly. Premium modules require a license key,
                  which you can activate at the top of the page.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-6 rounded-full bg-[#148962]" />
                  <span className="h-1.5 w-6 rounded-full bg-muted" />
                </div>
                <Button onClick={() => setWelcomeStep(2)}>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <button
                type="button"
                onClick={dismissWelcomeForever}
                className="mx-auto -mb-2 mt-1 block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Don't show this again
              </button>
            </>
          ) : (
            <>
              <div className="-mx-6 -mt-6 mb-2 overflow-hidden rounded-t-lg bg-[#212121]">
                <img
                  src="/ari-create-module-terminal.svg"
                  alt="Terminal showing the /ari-create-module command"
                  className="block h-auto w-full"
                />
              </div>
              <DialogHeader>
                <DialogTitle className="text-xl">Build your own modules</DialogTitle>
                <DialogDescription className="pt-2 text-base">
                  You're not limited to what's in the library — ARI lets you easily
                  create/fork/modify/share modules and build your very own modules!{' '}
                  <a
                    href="https://ari.software/docs/creating-modules"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#148962] underline-offset-4 hover:underline"
                  >
                    Learn more.
                  </a>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-6 rounded-full bg-muted" />
                  <span className="h-1.5 w-6 rounded-full bg-[#148962]" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setWelcomeStep(1)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      setWelcomeOpen(false)
                      setWelcomeStep(1)
                    }}
                  >
                    Done
                  </Button>
                </div>
              </DialogFooter>
              <button
                type="button"
                onClick={dismissWelcomeForever}
                className="mx-auto -mb-2 mt-1 block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Don't show this again
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
