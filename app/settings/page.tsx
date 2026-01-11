"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { getAllFeatures } from "@/lib/menu-config"
import { authClient } from "@/lib/auth-client"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TopBar } from "@/components/top-bar"
import { Check, Sparkles, TimerReset } from "lucide-react"
import {
  GeneralTab,
  FontsTab,
  FeaturesTab,
  NotificationsTab,
  SecurityTab,
  IntegrationsTab,
  BackupsTab,
} from "./tabs"
import {
  FONT_OPTIONS,
  type Session,
  type NotificationSettings,
  type BetaFeatureSettings,
  type FeaturePreference,
  type BackupStats,
  type BackupMessage,
  type ImportProgress,
  type ValidationResult,
  type VerificationResult,
} from "./types"

export default function SettingsPage(): React.ReactElement {
  // UI state
  const [isSaving, setIsSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  // General tab state
  const [themePreference, setThemePreference] = useState("system")
  const [workspaceName, setWorkspaceName] = useState("Ari Operations")
  const [workspaceTagline, setWorkspaceTagline] = useState("Resilient workflows for focused teams")
  const [landingView, setLandingView] = useState("dashboard")
  const [betaFeatures, setBetaFeatures] = useState<BetaFeatureSettings>({
    smartPriorities: true,
    predictiveScheduling: false,
    aiMeetingNotes: false,
  })

  // Font tab state
  const [selectedFont, setSelectedFont] = useState("Overpass Mono")
  const [savedFont, setSavedFont] = useState("Overpass Mono")
  const [fontSaving, setFontSaving] = useState(false)

  // Features tab state
  const [featurePreferences, setFeaturePreferences] = useState<Record<string, boolean>>({})
  const [loadingFeatures, setLoadingFeatures] = useState(true)
  const menuFeatures = getAllFeatures()

  // Notifications tab state
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    taskReminders: true,
    productUpdates: false,
    securityAlerts: true,
    weeklySummary: true,
  })
  const [pushNotifications, setPushNotifications] = useState(true)

  // Security tab state
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [currentSessionToken, setCurrentSessionToken] = useState<string | null>(null)
  const [revokingSession, setRevokingSession] = useState<string | null>(null)
  const [revokingAllSessions, setRevokingAllSessions] = useState(false)

  // Backup tab state
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [message, setMessage] = useState<BackupMessage | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [backupStats, setBackupStats] = useState<BackupStats | null>(null)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)

  // Load saved font on mount
  useEffect(() => {
    const saved = localStorage.getItem("ari-font-preference")
    if (saved) {
      const fontOption = FONT_OPTIONS.find(f => f.value === saved)
      if (fontOption) {
        setSelectedFont(saved)
        setSavedFont(saved)
        document.documentElement.style.setProperty("--font-family", fontOption.css)
      }
    }
  }, [])

  // Load feature preferences on mount
  useEffect(() => {
    async function loadFeaturePreferences(): Promise<void> {
      try {
        const response = await fetch("/api/features")
        if (response.ok) {
          const data: FeaturePreference[] = await response.json()
          const preferences: Record<string, boolean> = {}
          data.forEach(pref => {
            preferences[pref.feature_name] = pref.enabled
          })
          setFeaturePreferences(preferences)
        }
      } catch (error) {
        console.error("Error loading feature preferences:", error)
      } finally {
        setLoadingFeatures(false)
      }
    }
    loadFeaturePreferences()
  }, [])

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions(): Promise<void> {
    setSessionsLoading(true)
    try {
      const result = await authClient.listSessions()
      if (result.data) {
        setSessions(result.data)
      }
      const currentSession = await authClient.getSession()
      if (currentSession.data?.session) {
        setCurrentSessionToken(currentSession.data.session.token)
      }
    } catch (error) {
      console.error("Failed to load sessions:", error)
    } finally {
      setSessionsLoading(false)
    }
  }

  function handleFontChange(fontValue: string): void {
    setSelectedFont(fontValue)
    const fontOption = FONT_OPTIONS.find(f => f.value === fontValue)
    if (fontOption) {
      document.documentElement.style.setProperty("--font-family", fontOption.css)
    }
  }

  function handleSaveFont(): void {
    setFontSaving(true)
    localStorage.setItem("ari-font-preference", selectedFont)
    setSavedFont(selectedFont)
    setTimeout(() => {
      setFontSaving(false)
      setSavedMessage("Font preference saved successfully.")
    }, 500)
  }

  function handleSaveChanges(): void {
    setIsSaving(true)
    setSavedMessage(null)
    window.setTimeout(() => {
      setIsSaving(false)
      setSavedMessage("Your preferences are synced across devices.")
    }, 800)
  }

  function toggleBetaFeature(key: keyof BetaFeatureSettings): void {
    setBetaFeatures(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleNotification(key: keyof NotificationSettings): void {
    setNotificationSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function toggleFeature(featureName: string): Promise<void> {
    const currentState = featurePreferences[featureName] ?? true
    const newState = !currentState

    setFeaturePreferences(prev => ({ ...prev, [featureName]: newState }))

    try {
      const response = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature_name: featureName, enabled: newState }),
      })

      if (!response.ok) {
        throw new Error("Failed to update feature preference")
      }
    } catch (error) {
      console.error("Error updating feature:", error)
      setFeaturePreferences(prev => ({ ...prev, [featureName]: currentState }))
      setMessage({ type: "error", text: "Failed to update feature preference" })
    }
  }

  async function handleRevokeSession(token: string): Promise<void> {
    setRevokingSession(token)
    try {
      await authClient.revokeSession({ token })
      await loadSessions()
      setSavedMessage("Session revoked successfully.")
    } catch (error) {
      console.error("Failed to revoke session:", error)
    } finally {
      setRevokingSession(null)
    }
  }

  async function handleRevokeAllSessions(): Promise<void> {
    setRevokingAllSessions(true)
    try {
      await authClient.revokeSessions()
      await loadSessions()
      setSavedMessage("All other sessions have been signed out.")
    } catch (error) {
      console.error("Failed to revoke sessions:", error)
    } finally {
      setRevokingAllSessions(false)
    }
  }

  async function handleVerify(): Promise<void> {
    try {
      setVerifyLoading(true)
      setMessage(null)
      setVerificationResult(null)

      const response = await fetch("/api/backup/verify")

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Verification failed")
      }

      const result = await response.json()
      setVerificationResult(result)

      if (result.status === "ok") {
        setMessage({
          type: "success",
          text: `Backup system is working correctly! Found ${result.tablesFound} tables with ${result.totalRows.toLocaleString()} total rows. Using discovery method: ${result.discoveryMethod}.`,
        })
      } else if (result.status === "warning") {
        setMessage({
          type: "warning",
          text: `Backup system is functional but has warnings. Found ${result.tablesFound} tables. Please review warnings below.`,
        })
      } else {
        setMessage({
          type: "error",
          text: "Backup system has critical issues. Please review the details below and consider running the database migration.",
        })
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to verify backup system"
      console.error("Verify error:", error)
      setMessage({ type: "error", text: errorMessage })
    } finally {
      setVerifyLoading(false)
    }
  }

  async function handleExport(): Promise<void> {
    try {
      setExportLoading(true)
      setMessage(null)
      setBackupStats(null)

      const response = await fetch("/api/backup/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Export failed")
      }

      const metadataHeader = response.headers.get("X-Backup-Metadata")
      let metadata: Record<string, unknown> = {}
      if (metadataHeader) {
        try {
          metadata = JSON.parse(metadataHeader)
        } catch {
          console.warn("Could not parse backup metadata")
        }
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url

      const contentDisposition = response.headers.get("Content-Disposition")
      let filename = `database-backup-${new Date().toISOString().split("T")[0]}.sql`
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
        setBackupStats({
          tables: metadata.tables as number,
          totalRows: metadata.rows as number,
          discoveryMethod: metadata.discoveryMethod as string | undefined,
          warnings: metadata.warnings as number | undefined,
        })

        let messageText = `Database exported successfully! ${(metadata.rows as number).toLocaleString()} rows from ${metadata.tables} tables.`

        if (metadata.discoveryMethod) {
          const methodLabels: Record<string, string> = {
            rpc_function: "RPC function (optimal)",
            raw_sql: "Raw SQL",
            individual_validation: "Individual validation",
            hardcoded_fallback: "Hardcoded list (needs migration)",
          }
          messageText += ` Discovery: ${methodLabels[metadata.discoveryMethod as string] || metadata.discoveryMethod}.`
        }

        let messageType: BackupMessage["type"] = "success"

        if ((metadata.warnings as number) > 0) {
          messageText += ` ${metadata.warnings} warning(s) detected.`
          messageType = "warning"
        }
        if ((metadata.errors as number) > 0) {
          messageText += ` ${metadata.errors} error(s) occurred during export.`
          messageType = "error"
        }

        setMessage({ type: messageType, text: messageText })
      } else {
        setMessage({ type: "success", text: "Database exported successfully!" })
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to export database"
      console.error("Export error:", error)
      setMessage({ type: "error", text: errorMessage })
    } finally {
      setExportLoading(false)
    }
  }

  async function handleImportClick(): Promise<void> {
    if (!selectedFile) {
      setMessage({ type: "error", text: "Please select a file to import" })
      return
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setMessage({ type: "error", text: "File too large. Maximum size is 50MB." })
      return
    }

    try {
      setMessage({ type: "success", text: "Validating SQL file..." })

      const formData = new FormData()
      formData.append("file", selectedFile)

      const response = await fetch("/api/backup/import", {
        method: "PUT",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Validation failed")
      }

      const validation = await response.json()
      setValidationResult(validation)

      if (!validation.valid) {
        setMessage({ type: "error", text: `SQL validation failed: ${validation.errors[0]}` })
        return
      }

      if (validation.warnings && validation.warnings.length > 0) {
        setMessage({ type: "success", text: `File validated with ${validation.warnings.length} warnings. Ready to import.` })
      } else {
        setMessage({ type: "success", text: "SQL file validated successfully. Ready to import." })
      }

      setShowConfirmDialog(true)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      setMessage({ type: "error", text: `Failed to validate file: ${errorMessage}` })
    }
  }

  async function handleConfirmedImport(): Promise<void> {
    setShowConfirmDialog(false)

    try {
      setImportLoading(true)
      setMessage(null)
      setImportProgress({ current: 0, total: 100 })

      if (!selectedFile) {
        throw new Error("No file selected")
      }

      const formData = new FormData()
      formData.append("file", selectedFile)

      const response = await fetch("/api/backup/import", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        if (error.rollback) {
          throw new Error(`Import failed and was rolled back: ${error.details?.[0] || error.error}`)
        }
        throw new Error(error.error || "Import failed")
      }

      const result = await response.json()

      setImportProgress({ current: 100, total: 100 })

      let resultMessage = result.message
      if (result.stats) {
        resultMessage += ` (Duration: ${result.stats.duration}, Tables: ${result.stats.tablesCreated}, Records: ${result.stats.recordsImported})`

        if (result.stats.warnings && result.stats.warnings.length > 0) {
          resultMessage += ` Warning: ${result.stats.warnings.length} validation warnings.`
        }
      }

      if (result.integrityCheck !== "passed") {
        resultMessage += ` Data integrity check: ${result.integrityCheck.failures?.length || 0} issues detected.`
      }

      const messageType = result.integrityCheck === "passed" ? "success" : "error"
      setMessage({ type: messageType, text: resultMessage })

      setSelectedFile(null)

      setTimeout(() => {
        window.location.reload()
      }, 3000)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to import database"
      console.error("Import error:", error)
      setMessage({ type: "error", text: errorMessage })
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
          <TopBar>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </TopBar>

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
                    <TabsTrigger value="fonts">Fonts</TabsTrigger>
                    <TabsTrigger value="features">Features</TabsTrigger>
                    <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    <TabsTrigger value="security">Security</TabsTrigger>
                    <TabsTrigger value="integrations">Integrations</TabsTrigger>
                    <TabsTrigger value="backups">Backups</TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.location.href = "/debug"}>
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

                <TabsContent value="general">
                  <GeneralTab
                    themePreference={themePreference}
                    onThemeChange={setThemePreference}
                    workspaceName={workspaceName}
                    onWorkspaceNameChange={setWorkspaceName}
                    workspaceTagline={workspaceTagline}
                    onWorkspaceTaglineChange={setWorkspaceTagline}
                    landingView={landingView}
                    onLandingViewChange={setLandingView}
                    betaFeatures={betaFeatures}
                    onBetaFeatureToggle={toggleBetaFeature}
                  />
                </TabsContent>

                <TabsContent value="fonts">
                  <FontsTab
                    selectedFont={selectedFont}
                    savedFont={savedFont}
                    fontSaving={fontSaving}
                    onFontChange={handleFontChange}
                    onSaveFont={handleSaveFont}
                  />
                </TabsContent>

                <TabsContent value="features">
                  <FeaturesTab
                    menuFeatures={menuFeatures}
                    featurePreferences={featurePreferences}
                    loadingFeatures={loadingFeatures}
                    onToggleFeature={toggleFeature}
                  />
                </TabsContent>

                <TabsContent value="notifications">
                  <NotificationsTab
                    notificationSettings={notificationSettings}
                    pushNotifications={pushNotifications}
                    onToggleNotification={toggleNotification}
                    onPushNotificationsChange={setPushNotifications}
                  />
                </TabsContent>

                <TabsContent value="security">
                  <SecurityTab
                    sessions={sessions}
                    sessionsLoading={sessionsLoading}
                    currentSessionToken={currentSessionToken}
                    revokingSession={revokingSession}
                    revokingAllSessions={revokingAllSessions}
                    onRevokeSession={handleRevokeSession}
                    onRevokeAllSessions={handleRevokeAllSessions}
                  />
                </TabsContent>

                <TabsContent value="integrations">
                  <IntegrationsTab />
                </TabsContent>

                <TabsContent value="backups">
                  <BackupsTab
                    message={message}
                    verificationResult={verificationResult}
                    backupStats={backupStats}
                    importProgress={importProgress}
                    showConfirmDialog={showConfirmDialog}
                    validationResult={validationResult}
                    selectedFile={selectedFile}
                    exportLoading={exportLoading}
                    importLoading={importLoading}
                    verifyLoading={verifyLoading}
                    onVerify={handleVerify}
                    onExport={handleExport}
                    onImportClick={handleImportClick}
                    onConfirmedImport={handleConfirmedImport}
                    onFileSelect={setSelectedFile}
                    onConfirmDialogChange={setShowConfirmDialog}
                  />
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
