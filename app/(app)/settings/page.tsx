"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { useAuth } from "@/components/providers"
import { useCurrentUser } from "@/hooks/use-users"
import { hasPermission } from "@/lib/permissions"
import { MAX_BACKUP_FILE_BYTES, MAX_BACKUP_FILE_LABEL } from "@/lib/backup/constants"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Lock, AlertCircle, Settings2, Palette, Keyboard, Sparkles, Mail, Shield, HardDrive, Code, GitBranch, Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  GeneralTab,
  ThemesTab,
  KeybindingsTab,
  NotificationsTab,
  SecurityTab,
  IntegrationsTab,
  EmailTab,
  StorageTab,
  ApiTab,
  GitTab,
  BackupsTab,
} from "./tabs"
import {
  type Session,
  type NotificationSettings,
  type BackupStats,
  type BackupMessage,
  type ImportFailure,
  type ValidationResult,
  type VerificationResult,
  type ExportFailure,
  type DbMode,
} from "./types"

const SETTINGS_TABS = [
  "general",
  "themes",
  "keybindings",
  "notifications",
  "integrations",
  "email",
  "security",
  "storage",
  "api",
  "git",
  "backups",
] as const
type SettingsTab = (typeof SETTINGS_TABS)[number]
const DEFAULT_TAB: SettingsTab = "general"

function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && (SETTINGS_TABS as readonly string[]).includes(value)
}

function SettingsPageContent(): React.ReactElement {
  // Get session from context (avoids redundant API call)
  const { session } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  // Permission gating (the APIs enforce this independently — hiding is UX):
  // - access_settings gates the whole page
  // - git + backups tabs are admin-only (env-file writes, full-DB backup)
  // - api tab requires generate_api_keys
  const { data: currentUser, isLoading: permissionsLoading, isError: permissionsError, refetch: refetchPermissions } = useCurrentUser()
  const isAdmin = currentUser?.role === "admin"
  const canAccessSettings = hasPermission(currentUser, 'access_settings')
  const isTabAllowed = (tab: SettingsTab): boolean => {
    if (tab === "git" || tab === "backups") return isAdmin === true
    if (tab === "api") return hasPermission(currentUser, 'generate_api_keys')
    return true
  }

  const requestedTab: SettingsTab = isSettingsTab(tabParam) ? tabParam : DEFAULT_TAB
  const activeTab: SettingsTab = isTabAllowed(requestedTab) ? requestedTab : DEFAULT_TAB

  function handleTabChange(value: string): void {
    const next = isSettingsTab(value) ? value : DEFAULT_TAB
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_TAB) {
      params.delete("tab")
    } else {
      params.set("tab", next)
    }
    const query = params.toString()
    router.replace(query ? `/settings?${query}` : "/settings", { scroll: false })
  }

  // General tab state
  const [themePreference, setThemePreference] = useState("system")
  const [workspaceName, setWorkspaceName] = useState("Ari Operations")
  const [workspaceTagline, setWorkspaceTagline] = useState("Resilient workflows for focused teams")
  const [landingView, setLandingView] = useState("dashboard")
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
  const [importFailure, setImportFailure] = useState<ImportFailure | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [exportFailure, setExportFailure] = useState<ExportFailure | null>(null)
  const [dbMode, setDbMode] = useState<DbMode | null>(null)

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [])

  // Fetch database mode on mount for the Backups tab badge
  useEffect(() => {
    fetch("/api/system/db-mode")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.mode) setDbMode(data.mode as DbMode)
      })
      .catch(() => {/* badge is purely informational; ignore failures */})
  }, [])

  // Set current session token from context when available
  useEffect(() => {
    if (session?.token) {
      setCurrentSessionToken(session.token)
    }
  }, [session?.token])

  async function loadSessions(): Promise<void> {
    setSessionsLoading(true)
    try {
      const result = await authClient.listSessions()
      if (result.data) {
        setSessions(result.data)
      } else if (result.error) {
        // Surface the failure instead of masquerading as "no sessions"
        console.error("Failed to load sessions:", result.error)
        toast({
          variant: "destructive",
          title: "Failed to load sessions",
          description: result.error.message || "Please try again.",
        })
      }
      // Use session from context instead of fetching again
      if (session?.token) {
        setCurrentSessionToken(session.token)
      }
    } catch (error) {
      console.error("Failed to load sessions:", error)
    } finally {
      setSessionsLoading(false)
    }
  }

  function toggleNotification(key: keyof NotificationSettings): void {
    setNotificationSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleRevokeSession(token: string): Promise<void> {
    setRevokingSession(token)
    try {
      await authClient.revokeSession({ token })
      await loadSessions()
      toast({ title: "Session revoked", description: "The session has been signed out." })
    } catch (error) {
      console.error("Failed to revoke session:", error)
      toast({ variant: "destructive", title: "Failed to revoke session", description: "Please try again." })
    } finally {
      setRevokingSession(null)
    }
  }

  async function handleRevokeAllSessions(): Promise<void> {
    setRevokingAllSessions(true)
    try {
      await authClient.revokeSessions()
      await loadSessions()
      toast({ title: "Sessions revoked", description: "All other sessions have been signed out." })
    } catch (error) {
      console.error("Failed to revoke sessions:", error)
      toast({ variant: "destructive", title: "Failed to revoke sessions", description: "Please try again." })
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

  async function handleExport(force: boolean = false): Promise<void> {
    try {
      setExportLoading(true)
      setMessage(null)
      setBackupStats(null)
      if (!force) setExportFailure(null)

      const url = force ? "/api/backup/export?force=true" : "/api/backup/export"
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        if (response.status === 500 && Array.isArray(error.failedTables)) {
          setExportFailure({
            failedTables: error.failedTables,
            details: Array.isArray(error.details) ? error.details : [],
          })
          setMessage({
            type: "error",
            text: `Export aborted: ${error.failedTables.length} table(s) failed. Backup was not downloaded — restoring an incomplete backup would leave your database in an inconsistent state.`,
          })
          return
        }
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
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl

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
      URL.revokeObjectURL(objectUrl)

      if (metadata.tables && metadata.rows) {
        setBackupStats({
          tables: metadata.tables as number,
          totalRows: metadata.rows as number,
          discoveryMethod: metadata.discoveryMethod as string | undefined,
          warnings: metadata.warnings as number | undefined,
        })

        const isPartial = metadata.partial === true
        let messageText = isPartial
          ? `Partial backup downloaded: ${(metadata.rows as number).toLocaleString()} rows from ${metadata.tables} tables, but ${metadata.failedTables} table(s) were skipped.`
          : `Database exported successfully! ${(metadata.rows as number).toLocaleString()} rows from ${metadata.tables} tables.`

        let messageType: BackupMessage["type"] = isPartial ? "error" : "success"

        if ((metadata.warnings as number) > 0) {
          messageText += ` ${metadata.warnings} warning(s) detected.`
          if (!isPartial) messageType = "warning"
        }
        if ((metadata.errors as number) > 0 && !isPartial) {
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

  // Two-phase flow: PUT validates the file (uploading it once), the confirm
  // dialog shows the result, then POST uploads it again to execute. The double
  // upload is deliberate — server-side stashing between requests would break
  // on serverless/multi-instance deployments, and backup files are small.
  async function handleImportClick(): Promise<void> {
    if (!selectedFile) {
      setMessage({ type: "error", text: "Please select a file to import" })
      return
    }
    setImportFailure(null)

    if (selectedFile.size > MAX_BACKUP_FILE_BYTES) {
      setMessage({ type: "error", text: `File too large. Maximum size is ${MAX_BACKUP_FILE_LABEL}.` })
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
      setImportFailure(null)

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
          // Statement failure or integrity mismatch — nothing was committed.
          setImportFailure({ details: error.details || [] })
          setMessage({ type: "error", text: error.error || "Import failed — all changes were rolled back." })
          return
        }
        throw new Error(error.error || "Import failed")
      }

      const result = await response.json()

      // Success now always means the in-transaction integrity check passed
      // (or the backup carried no row-count metadata to check against).
      let resultMessage = result.message
      if (result.stats) {
        resultMessage += ` (Duration: ${result.stats.duration}, Tables: ${result.stats.tablesCreated}, Records: ${result.stats.recordsImported})`

        if (result.stats.warnings && result.stats.warnings.length > 0) {
          resultMessage += ` Warning: ${result.stats.warnings.length} validation warnings.`
        }
      }
      if (result.integrity?.verified) {
        resultMessage += ` Integrity verified across ${result.integrity.tablesChecked} tables.`
      }

      let messageType: BackupMessage["type"] = "success"
      if (result.postRestore && result.postRestore.coreSchemaReapplied === false) {
        messageType = "warning"
        resultMessage += " Core schema re-apply failed; it will retry on the next app start."
      }
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
    }
  }

  if (permissionsLoading || permissionsError || !canAccessSettings) {
    return (
      <div className="bg-background">
        <div className="mx-auto flex w-full max-w-[90%] flex-col gap-8 px-6 py-8 lg:px-8">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Settings</h1>
          </div>
          {permissionsError ? (
            // A failed permission fetch must NOT masquerade as "access denied"
            // (that would falsely lock out an admin on a transient DB blip).
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <AlertCircle className="size-8 text-muted-foreground" />
                <div className="text-sm font-medium">Couldn&apos;t load your permissions</div>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Something went wrong reaching the server. Check your connection and try again.
                </p>
                <Button variant="outline" size="sm" onClick={() => refetchPermissions()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : !permissionsLoading && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <Lock className="size-8 text-muted-foreground" />
                <div className="text-sm font-medium">You don&apos;t have permission to access settings</div>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Ask an admin to grant you the &ldquo;Access settings&rdquo; permission.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background">
      <div className="mx-auto flex w-full max-w-[90%] flex-col gap-8 px-6 py-8 lg:px-8">
              <div className="flex flex-col gap-3">
                <Badge className="w-fit text-sm font-medium">Crafted for focus-first teams</Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Settings</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Personalize Ari to match the rhythm of your team. Adjust themes, notifications, security, and integrations—everything stays synced across web and mobile.
                </p>
              </div>

              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <div className="flex items-center justify-end gap-2 pb-4">
                  <Button variant="outline" size="sm" className="w-[125px]" onClick={() => window.location.href = "/health"}>
                    Health Check
                  </Button>
                  {isAdmin && (
                    <Button variant="outline" size="sm" className="w-[125px]" onClick={() => window.location.href = "/welcome"}>
                      Rerun Setup
                    </Button>
                  )}
                </div>
                <TabsList className="grid w-full grid-flow-col auto-cols-fr h-[50px] mb-8">
                  <TabsTrigger value="general" className="flex h-full items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    General
                  </TabsTrigger>
                  <TabsTrigger value="themes" className="flex h-full items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Themes
                  </TabsTrigger>
                  <TabsTrigger value="keybindings" className="flex h-full items-center gap-2">
                    <Keyboard className="h-4 w-4" />
                    Shortcuts
                  </TabsTrigger>
                  {/* <TabsTrigger value="notifications">Notifications</TabsTrigger> */}
                  <TabsTrigger value="integrations" className="flex h-full items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    AI Providers
                  </TabsTrigger>
                  <TabsTrigger value="email" className="flex h-full items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </TabsTrigger>
                  <TabsTrigger value="security" className="flex h-full items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Security
                  </TabsTrigger>
                  <TabsTrigger value="storage" className="flex h-full items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Storage
                  </TabsTrigger>
                  {isTabAllowed("api") && (
                    <TabsTrigger value="api" className="flex h-full items-center gap-2">
                      <Code className="h-4 w-4" />
                      API
                    </TabsTrigger>
                  )}
                  {isTabAllowed("git") && (
                    <TabsTrigger value="git" className="flex h-full items-center gap-2">
                      <GitBranch className="h-4 w-4" />
                      GIT
                    </TabsTrigger>
                  )}
                  {isTabAllowed("backups") && (
                    <TabsTrigger value="backups" className="flex h-full items-center gap-2">
                      <Save className="h-4 w-4" />
                      Backups
                    </TabsTrigger>
                  )}
                </TabsList>

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
                  />
                </TabsContent>

                <TabsContent value="themes">
                  <ThemesTab />
                </TabsContent>

                <TabsContent value="keybindings">
                  <KeybindingsTab />
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
                    twoFactorEnabled={!!(session?.user as any)?.twoFactorEnabled}
                  />
                </TabsContent>

                <TabsContent value="storage">
                  <StorageTab />
                </TabsContent>

                <TabsContent value="integrations">
                  <IntegrationsTab />
                </TabsContent>

                <TabsContent value="email">
                  <EmailTab />
                </TabsContent>

                {isTabAllowed("api") && (
                  <TabsContent value="api">
                    <ApiTab />
                  </TabsContent>
                )}

                {isTabAllowed("git") && (
                  <TabsContent value="git">
                    <GitTab />
                  </TabsContent>
                )}

                {isTabAllowed("backups") && (
                <TabsContent value="backups">
                  <BackupsTab
                    message={message}
                    verificationResult={verificationResult}
                    backupStats={backupStats}
                    importFailure={importFailure}
                    showConfirmDialog={showConfirmDialog}
                    validationResult={validationResult}
                    selectedFile={selectedFile}
                    exportLoading={exportLoading}
                    importLoading={importLoading}
                    verifyLoading={verifyLoading}
                    exportFailure={exportFailure}
                    dbMode={dbMode}
                    onVerify={handleVerify}
                    onExport={() => handleExport(false)}
                    onForceExport={() => handleExport(true)}
                    onImportClick={handleImportClick}
                    onConfirmedImport={handleConfirmedImport}
                    onFileSelect={setSelectedFile}
                    onConfirmDialogChange={setShowConfirmDialog}
                  />
                </TabsContent>
                )}
              </Tabs>

      </div>
    </div>
  )
}

export default function SettingsPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  )
}
