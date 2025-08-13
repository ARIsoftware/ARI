"use client"

import type React from "react"
import { useState } from "react"
import { DM_Sans } from "next/font/google"
import { AppSidebar } from "../../components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Download, Upload, AlertCircle, CheckCircle2, Loader2, Database } from "lucide-react"
// Server-side operations moved to API routes - no longer need direct database access

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

// Note: Table discovery, schema mapping, and validation functions moved to server-side API routes
// This improves security and performance by keeping database operations server-side

export default function BackupsPage() {
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [backupStats, setBackupStats] = useState<{ tables: number, totalRows: number } | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number, total: number } | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[]; warnings: string[]; metadata?: any } | null>(null)

  const handleExport = async () => {
    try {
      setExportLoading(true)
      setMessage(null)
      setBackupStats(null)
      
      // Call server-side export API
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
      
      // Get metadata from headers
      const metadataHeader = response.headers.get('X-Backup-Metadata')
      let metadata: any = {}
      if (metadataHeader) {
        try {
          metadata = JSON.parse(metadataHeader)
        } catch (e) {
          console.warn('Could not parse backup metadata')
        }
      }
      
      // Download the file
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      // Extract filename from Content-Disposition header or use default
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
      
      // Update UI with metadata if available
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
    
    // Validate file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File too large. Maximum size is 50MB.' })
      return
    }
    
    // Validate SQL file using server-side validation
    try {
      setMessage({ type: 'success', text: 'Validating SQL file...' })
      
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      const response = await fetch('/api/backup/import', {
        method: 'PUT', // Using PUT for validation
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
      
      // Show confirmation dialog
      setShowConfirmDialog(true)
    } catch (error: any) {
      setMessage({ type: 'error', text: `Failed to validate file: ${error.message}` })
    }
  }

  const handleConfirmedImport = async () => {
    setShowConfirmDialog(false) // Close the dialog
    
    try {
      setImportLoading(true)
      setMessage(null)
      setImportProgress({ current: 0, total: 100 }) // Generic progress until we get server updates
      
      if (!selectedFile) {
        throw new Error('No file selected')
      }
      
      // Prepare form data
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      // Call server-side import API
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
      
      // Update progress to complete
      setImportProgress({ current: 100, total: 100 })
      
      // Generate success message
      let message = result.message
      if (result.stats) {
        message += ` (Duration: ${result.stats.duration}, Tables: ${result.stats.tablesCreated}, Records: ${result.stats.recordsImported})`
        
        if (result.stats.warnings && result.stats.warnings.length > 0) {
          message += ` Warning: ${result.stats.warnings.length} validation warnings.`
        }
      }
      
      // Check integrity results
      if (result.integrityCheck !== 'passed') {
        message += ` Data integrity check: ${result.integrityCheck.failures?.length || 0} issues detected.`
      }
      
      const messageType = result.integrityCheck === 'passed' ? 'success' : 'error'
      setMessage({ type: messageType, text: message })
      
      // Clear form
      setSelectedFile(null)
      
      // Reload the page to reflect changes after a delay
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
    <div className="min-h-screen bg-gray-50/50">
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
                  <BreadcrumbLink href="#">Settings</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Backups</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Page Header */}
            <div>
              <h1 className="text-3xl font-medium">Database Backups</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Automatically discover and backup your complete database - no manual configuration needed
              </p>
            </div>

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

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Backup Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div>
                    <h4 className="font-medium text-foreground mb-1">🗂️ Dynamic Database Export</h4>
                    <p>• Automatically discovers ALL tables in your database</p>
                    <p>• Generates CREATE TABLE statements from actual schema</p>
                    <p>• Zero configuration - new tables are automatically included</p>
                    <p>• Full metadata and validation for integrity checking</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-1">🔄 Smart Import System</h4>
                    <p>• Progress tracking and detailed error reporting</p>
                    <p>• File validation and size limits (50MB max)</p>
                    <p>• Data integrity verification with expected vs actual counts</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-1">🛡️ Safety Features</h4>
                    <p>• Foreign key management during import</p>
                    <p>• Sequence reset for proper data ordering</p>
                    <p>• Performance indexes automatically created</p>
                    <p>• Validation queries included for manual verification</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-1">💾 Best Practices</h4>
                    <p>• Create regular backups to prevent data loss</p>
                    <p>• Store backups in multiple secure locations</p>
                    <p>• Test restore process periodically</p>
                    <p>• New tables are automatically included - no configuration needed!</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}