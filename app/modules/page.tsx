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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TopBar } from "@/components/top-bar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Package,
  Loader2,
  Save,
  X,
} from "lucide-react"

export default function ModulesPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [allModules, setAllModules] = useState<any[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

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
  } | null>(null)
  const [licenseError, setLicenseError] = useState<string | null>(null)

  // Track original enabled states (from server)
  const [originalStates, setOriginalStates] = useState<Record<string, boolean>>({})
  // Track current toggle states (local, may differ from server)
  const [toggleStates, setToggleStates] = useState<Record<string, boolean>>({})

  // Load license status
  useEffect(() => {
    async function loadLicenseStatus() {
      try {
        const response = await fetch('/api/license/status')
        if (response.ok) {
          const data = await response.json()
          setLicenseStatus(data)
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
        setLicenseStatus(await statusResponse.json())
      }
      setLicenseKey("")
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
      }
    } catch (error) {
      console.error('Error deactivating license:', error)
    }
  }

  // Load all modules (not just enabled) for settings management
  useEffect(() => {
    async function loadAllModules() {
      try {
        setModulesLoading(true)
        // This endpoint needs to return ALL modules, not just enabled
        const response = await fetch('/api/modules/all')
        if (response.ok) {
          const data = await response.json()
          // Sort modules alphabetically by name
          const sortedModules = (data.modules || []).sort((a: any, b: any) =>
            a.name.localeCompare(b.name)
          )
          setAllModules(sortedModules)

          // Initialize both original and toggle states from server data
          const initialStates: Record<string, boolean> = {}
          sortedModules.forEach((module: any) => {
            initialStates[module.id] = module.isEnabled
          })
          setOriginalStates(initialStates)
          setToggleStates(initialStates)
        }
      } catch (error) {
        console.error('Error loading all modules:', error)
      } finally {
        setModulesLoading(false)
      }
    }
    loadAllModules()
  }, [])

  // Compute pending changes
  const pendingChanges = useMemo(() => {
    return Object.entries(toggleStates).filter(
      ([moduleId, enabled]) => originalStates[moduleId] !== enabled
    )
  }, [originalStates, toggleStates])

  const hasChanges = pendingChanges.length > 0

  // Toggle module locally (no API call)
  const toggleModule = (moduleId: string) => {
    setToggleStates(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }))
    // Clear any previous messages when user makes changes
    setMessage(null)
  }

  // Discard all pending changes
  const discardChanges = () => {
    setToggleStates(originalStates)
    setMessage(null)
  }

  // Save all pending changes
  const saveChanges = async () => {
    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/modules/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changes: pendingChanges.map(([moduleId, enabled]) => ({ moduleId, enabled }))
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save changes')
      }

      // Reload page to update sidebar navigation
      window.location.reload()
    } catch (error) {
      console.error('Error saving module changes:', error)
      setMessage({ type: 'error', text: 'Failed to save changes. Please try again.' })
      setIsSaving(false)
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
                  <BreadcrumbPage>Modules</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </TopBar>

          <main className="flex-1 bg-background">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8 pb-24">
              <div className="flex flex-col gap-3">
                <Badge className="w-fit text-sm font-medium">Extend your app functionality</Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Modules</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Enable or disable installed modules to extend your app functionality. <br /><span className="text-red-600">Note: Always assess third-party modules to ensure they are trustworthy and secure.</span>
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

              {/* Modules Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Package className="h-5 w-5 text-purple-500" />
                    Modules
                  </CardTitle>
                  <CardDescription>
                    Toggle modules on or off below, then click "Save Changes" to apply.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {modulesLoading ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">Loading modules...</p>
                    </div>
                  ) : allModules.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground">
                        No modules installed. Place custom modules in the <code className="px-1 py-0.5 bg-muted rounded text-xs">/modules-custom</code> directory.
                      </p>
                    </div>
                  ) : (
                    allModules.map((module) => {
                      const Icon = getLucideIcon(module.icon)
                      const isEnabled = toggleStates[module.id] ?? module.isEnabled
                      const hasChanged = originalStates[module.id] !== toggleStates[module.id]
                      const isCustomModule = module.path?.includes('/modules-custom/')
                      const isOverridden = module.isOverridden === true

                      // Determine badge color and text
                      let badgeColor = '#000000' // CORE MODULE (black)
                      let badgeText = 'CORE MODULE'
                      if (isOverridden) {
                        badgeColor = '#dc2626' // OVERRIDDEN (red)
                        badgeText = 'OVERRIDDEN'
                      } else if (isCustomModule) {
                        badgeColor = '#07be07' // USER MODULE (green)
                        badgeText = 'USER MODULE'
                      }

                      return (
                        <div
                          key={`${module.id}-${module.path}`}
                          className={`flex items-start justify-between rounded-lg border p-4 transition-colors ${
                            hasChanged ? 'border-amber-400 bg-amber-50/50' : ''
                          }`}
                        >
                          <div className="pr-4 flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Icon className="h-5 w-5 text-blue-600" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">{module.name}</p>
                                  <Badge
                                    className="text-[10px] px-1.5 py-0 text-white"
                                    style={{ backgroundColor: badgeColor }}
                                  >
                                    {badgeText}
                                  </Badge>
                                  {hasChanged && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">
                                      UNSAVED
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">v{module.version} by {module.author}</p>
                                <p className="text-xs text-muted-foreground">ID: {module.id}</p>
                                {module.routes && module.routes.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Routes: {module.routes.map((r: any) => r.path).join(', ')}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">Path: /{isCustomModule ? 'modules-custom' : 'modules-core'}/{module.path?.split('/').pop()}</p>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">{module.description}</p>
                          </div>
                          <div className={`flex items-center gap-3 ${isOverridden ? 'opacity-30' : ''}`}>
                            <span className={`text-sm font-medium ${hasChanged ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              {isEnabled ? 'On' : 'Off'}
                            </span>
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={() => toggleModule(module.id)}
                              disabled={isOverridden}
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
                    <span>Disabled modules won't appear in navigation.</span>
                  </div>
                </CardFooter>
              </Card>
            </div>
          </main>

          {/* Sticky Save Bar */}
          {hasChanges && (
            <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white shadow-lg">
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
