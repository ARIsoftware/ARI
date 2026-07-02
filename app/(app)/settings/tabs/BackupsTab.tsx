"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { AlertCircle, CheckCircle2, Download, Eye, Loader2, Upload } from "lucide-react"
import type { BackupStats, BackupMessage, ImportProgress, ValidationResult, VerificationResult, ExportFailure, DbMode } from "../types"

interface BackupsTabProps {
  message: BackupMessage | null
  verificationResult: VerificationResult | null
  backupStats: BackupStats | null
  importProgress: ImportProgress | null
  showConfirmDialog: boolean
  validationResult: ValidationResult | null
  selectedFile: File | null
  exportLoading: boolean
  importLoading: boolean
  verifyLoading: boolean
  exportFailure: ExportFailure | null
  dbMode: DbMode | null
  onVerify: () => void
  onExport: () => void
  onForceExport: () => void
  onImportClick: () => void
  onConfirmedImport: () => void
  onFileSelect: (file: File | null) => void
  onConfirmDialogChange: (open: boolean) => void
}

const DB_MODE_LABELS: Record<DbMode, string> = {
  postgres: "Local PostgreSQL",
  supabaselocal: "Local Supabase",
  supabasecloud: "Supabase Cloud",
}

function getMessageIcon(type: BackupMessage["type"]): React.ReactElement {
  switch (type) {
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />
    case "warning":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />
    default:
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
  }
}

function getMessageTitle(type: BackupMessage["type"]): string {
  switch (type) {
    case "error":
      return "Error"
    case "warning":
      return "Warning"
    default:
      return "Success"
  }
}

function getStatusIcon(status: VerificationResult["status"]): React.ReactElement {
  switch (status) {
    case "ok":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />
    case "warning":
      return <AlertCircle className="h-5 w-5 text-yellow-500" />
    default:
      return <AlertCircle className="h-5 w-5 text-red-500" />
  }
}

function getStatusBorderClass(status: VerificationResult["status"]): string {
  switch (status) {
    case "ok":
      return "border-green-500"
    case "warning":
      return "border-yellow-500"
    default:
      return "border-red-500"
  }
}

function getStatusBadgeVariant(status: VerificationResult["status"]): "default" | "secondary" | "destructive" {
  switch (status) {
    case "ok":
      return "default"
    case "warning":
      return "secondary"
    default:
      return "destructive"
  }
}

export function BackupsTab({
  message,
  verificationResult,
  backupStats,
  importProgress,
  showConfirmDialog,
  validationResult,
  selectedFile,
  exportLoading,
  importLoading,
  verifyLoading,
  exportFailure,
  dbMode,
  onVerify,
  onExport,
  onForceExport,
  onImportClick,
  onConfirmedImport,
  onFileSelect,
  onConfirmDialogChange,
}: BackupsTabProps): React.ReactElement {
  const roleCheck = verificationResult?.roleCheck
  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          {getMessageIcon(message.type)}
          <AlertTitle>{getMessageTitle(message.type)}</AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {verificationResult && (
        <Card className={getStatusBorderClass(verificationResult.status)}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {getStatusIcon(verificationResult.status)}
              Backup System Status
            </CardTitle>
            <CardDescription>
              Last verified: {new Date(verificationResult.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Discovery Method:</span>
                <div className="text-muted-foreground mt-1">{verificationResult.discoveryMethod.replace(/_/g, " ")}</div>
              </div>
              <div>
                <span className="font-medium">Tables Found:</span>
                <div className="text-muted-foreground mt-1">{verificationResult.tablesFound} / {verificationResult.expectedTables}</div>
              </div>
              <div>
                <span className="font-medium">Total Rows:</span>
                <div className="text-muted-foreground mt-1">{verificationResult.totalRows.toLocaleString()}</div>
              </div>
              <div>
                <span className="font-medium">Status:</span>
                <Badge variant={getStatusBadgeVariant(verificationResult.status)} className="mt-1">
                  {verificationResult.status.toUpperCase()}
                </Badge>
              </div>
            </div>

            {roleCheck && roleCheck.status === "critical" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Database role cannot read all rows</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>{roleCheck.message}</p>
                  <p className="text-xs">
                    Connection role: <span className="font-mono">{roleCheck.currentUser ?? "unknown"}</span>
                    {roleCheck.rowSecurity ? <> · row_security: <span className="font-mono">{roleCheck.rowSecurity}</span></> : null}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {roleCheck && roleCheck.status === "ok" && (
              <p className="text-xs text-muted-foreground">
                Connection role <span className="font-mono">{roleCheck.currentUser}</span> can read all rows.
              </p>
            )}

            {verificationResult.warnings && verificationResult.warnings.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-sm">Warnings:</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {verificationResult.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {(verificationResult.missingTables.length > 0 || verificationResult.extraTables.length > 0) && (
              <div className="grid md:grid-cols-2 gap-4">
                {verificationResult.missingTables.length > 0 && (
                  <div>
                    <p className="font-medium text-sm text-red-600">Missing Tables:</p>
                    <p className="text-xs text-muted-foreground mt-1">{verificationResult.missingTables.join(", ")}</p>
                  </div>
                )}
                {verificationResult.extraTables.length > 0 && (
                  <div>
                    <p className="font-medium text-sm text-blue-600">New Tables Found:</p>
                    <p className="text-xs text-muted-foreground mt-1">{verificationResult.extraTables.join(", ")}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {backupStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last Export Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium">Tables Exported:</span>
                <span className="ml-2">{backupStats.tables}</span>
              </div>
              <div>
                <span className="font-medium">Total Records:</span>
                <span className="ml-2">{backupStats.totalRows.toLocaleString()}</span>
              </div>
              {backupStats.discoveryMethod && (
                <div>
                  <span className="font-medium">Discovery Method:</span>
                  <span className="ml-2">{backupStats.discoveryMethod.replace(/_/g, " ")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
              <Progress value={(importProgress.current / importProgress.total) * 100} />
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showConfirmDialog} onOpenChange={onConfirmDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Confirm Database Import
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                <strong>WARNING:</strong> This action will permanently delete all existing data in your database and replace it with the backup data.
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

              {validationResult && (
                <div className="border rounded p-3 space-y-2">
                  <h4 className="font-medium text-sm">Validation Results:</h4>

                  {validationResult.valid && (
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>SQL file passed all validation checks</span>
                    </div>
                  )}

                  {validationResult.warnings && validationResult.warnings.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-yellow-600 font-medium text-sm">Warnings ({validationResult.warnings.length}):</p>
                      <ul className="text-xs text-yellow-700 ml-4">
                        {validationResult.warnings.slice(0, 3).map((warning, idx) => (
                          <li key={idx}>- {warning}</li>
                        ))}
                        {validationResult.warnings.length > 3 && (
                          <li>- ... and {validationResult.warnings.length - 3} more</li>
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
            <AlertDialogCancel onClick={() => onConfirmDialogChange(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmedImport}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Yes, Replace All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {exportFailure && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Export aborted: incomplete backup
            </CardTitle>
            <CardDescription>
              {exportFailure.failedTables.length} table(s) failed to export. The backup was not downloaded
              because restoring an incomplete backup would leave your database in an inconsistent state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="font-medium text-sm">Failed tables:</p>
              <p className="text-sm text-muted-foreground font-mono">
                {exportFailure.failedTables.join(", ")}
              </p>
            </div>
            {exportFailure.details.length > 0 && (
              <div>
                <p className="font-medium text-sm">Details:</p>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  {exportFailure.details.slice(0, 5).map((detail, idx) => (
                    <li key={idx} className="break-all">{detail}</li>
                  ))}
                  {exportFailure.details.length > 5 && (
                    <li>... and {exportFailure.details.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            <Button
              onClick={onForceExport}
              disabled={exportLoading}
              variant="outline"
              size="sm"
            >
              {exportLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading partial backup…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download partial backup anyway
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Use only for debugging. Do not restore a partial backup to a production database.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Database
              {dbMode && (
                <Badge variant="secondary" className="ml-auto text-xs font-normal">
                  {DB_MODE_LABELS[dbMode]}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Automatically discovers and exports ALL tables in your database as an SQL file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={onVerify}
              disabled={verifyLoading}
              variant="outline"
              className="w-full"
            >
              {verifyLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview Backup
                </>
              )}
            </Button>
            <Button
              onClick={onExport}
              disabled={exportLoading || verifyLoading}
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
            <p className="text-xs text-muted-foreground">
              Click "Preview Backup" to verify what will be exported before downloading
            </p>
          </CardContent>
        </Card>

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
                onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
                disabled={importLoading}
              />
              <Button
                onClick={onImportClick}
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
    </div>
  )
}
