"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TopBar } from "@/components/top-bar"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  Lock,
  Package,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { LICENSE_CACHE_KEY, LIBRARY_CACHE_KEY, CACHE_TTL } from "@/lib/license-helpers"

// Icon mapping for known modules (external API doesn't provide icons)
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

const CACHE_KEY = LIBRARY_CACHE_KEY

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

export default function ModuleLibraryPage() {
  // License state
  const [licenseKey, setLicenseKey] = useState("")
  const [licenseLoading, setLicenseLoading] = useState(true)
  const [licenseActivating, setLicenseActivating] = useState(false)
  const [licenseStatus, setLicenseStatus] = useState<{
    active: boolean
    masked_key?: string
    customer_email?: string
    expires_at?: string
    env_key?: string
  } | null>(null)
  const [licenseError, setLicenseError] = useState<string | null>(null)

  // Library state
  const [modules, setModules] = useState<LibraryModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)
  const [modulesError, setModulesError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadResult, setDownloadResult] = useState<{ module: string, type: 'success' | 'error', message: string } | null>(null)

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

  // Load module library
  const loadLibrary = async (useCache = true) => {
    if (useCache) {
      const cached = getCached<{ modules: LibraryModule[], valid_license: boolean }>(CACHE_KEY)
      if (cached) {
        setModules(cached.modules || [])
        setModulesLoading(false)
        return
      }
    }

    try {
      setModulesLoading(true)
      setModulesError(null)
      const response = await fetch('/api/modules/library')
      if (response.ok) {
        const data = await response.json()
        setModules(data.modules || [])
        setCache(CACHE_KEY, data)
      } else {
        const err = await response.json().catch(() => ({}))
        setModulesError(err.error || 'Failed to load module library')
      }
    } catch (error) {
      console.error('Error loading module library:', error)
      setModulesError('Failed to connect to module library')
    } finally {
      setModulesLoading(false)
    }
  }

  useEffect(() => { loadLibrary() }, [])

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
      sessionStorage.removeItem(CACHE_KEY)
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
        sessionStorage.removeItem(LICENSE_CACHE_KEY)
        // Refresh library without license (bypass cache)
        sessionStorage.removeItem(CACHE_KEY)
        await loadLibrary(false)
      }
    } catch (error) {
      console.error('Error deactivating license:', error)
    }
  }

  const downloadModule = async (mod: LibraryModule) => {
    setDownloading(mod.name)
    setDownloadResult(null)

    try {
      const response = await fetch('/api/modules/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: mod.name,
          version: mod.latest_version,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setDownloadResult({ module: mod.name, type: 'error', message: data.error || 'Download failed' })
        return
      }

      setDownloadResult({
        module: mod.name,
        type: 'success',
        message: `${mod.title} v${mod.latest_version} installed to ${data.installed_to}`,
      })
    } catch (error) {
      console.error('Error downloading module:', error)
      setDownloadResult({ module: mod.name, type: 'error', message: 'Failed to download module' })
    } finally {
      setDownloading(null)
    }
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
                  <BreadcrumbLink href="/modules">Modules</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Module Library</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </TopBar>

          <main className="flex-1 bg-background">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8 pb-24">
              <div className="flex flex-col gap-3">
                <Link
                  href="/modules"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit group"
                >
                  <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                  Back to Modules
                </Link>
                <Badge className="w-fit text-sm font-medium">Browse & Install</Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Module Library</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Discover modules to extend your app. Free modules can be downloaded instantly. Premium modules require a license key.
                </p>
              </div>

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
                      <p className="text-xs text-muted-foreground">
                        Your license key was sent to your email after purchase.{' '}
                        <a
                          href="https://ari.software"
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
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}>
                  {downloadResult.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  {downloadResult.message}
                </div>
              )}

              {/* Module Grid */}
              {modulesLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading module library...</p>
                </div>
              ) : modulesError ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{modulesError}</p>
                  <Button variant="outline" size="sm" onClick={() => loadLibrary(false)}>
                    Try Again
                  </Button>
                </div>
              ) : modules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Package className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No modules available</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {modules.map((mod) => {
                    const iconName = MODULE_ICONS[mod.name] || "Package"
                    const Icon = getLucideIcon(iconName)
                    const isFree = mod.access === "free"
                    const isDownloading = downloading === mod.name

                    return (
                      <Card key={mod.name} className="flex flex-col transition-colors hover:border-foreground/20">
                        <CardHeader className="flex-1 pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <Icon className="h-5 w-5 text-foreground" />
                              </div>
                              <div>
                                <CardTitle className="text-sm font-semibold">{mod.title}</CardTitle>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 ${isFree ? 'border-green-500/40 text-green-600' : 'border-amber-500/40 text-amber-600'}`}
                                  >
                                    {isFree ? 'FREE' : 'PREMIUM'}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">v{mod.latest_version}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <CardDescription className="text-xs mt-2 leading-relaxed">
                            {mod.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {mod.download_enabled ? (
                            <Button
                              size="sm"
                              className="w-full bg-[#148962] hover:bg-[#117a56] text-white"
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
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-green-700 border-green-600/30 cursor-default hover:bg-transparent hover:text-green-700"
                              disabled
                            >
                              <Lock className="mr-2 h-4 w-4" />
                              License Required
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
