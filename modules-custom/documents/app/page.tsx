'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import {
  FileBox,
  Upload,
  Search,
  Grid3X3,
  List,
  FolderPlus,
  ChevronRight,
  Loader2,
  Info,
  AlertCircle,
  Trash2,
  FolderInput,
  Tags,
  Filter,
  X,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import {
  useDocumentsSettings,
  useUpdateDocumentsSettings,
  useDocuments,
  useUploadDocument,
  useDownloadDocument,
  useUpdateDocument,
  useDeleteDocument,
  useFolders,
  useTags,
  useCreateFolder,
  useBulkDeleteDocuments,
  useBulkMoveDocuments,
} from '../hooks/use-documents'
import { FileCard } from '../components/file-card'
import { FileTable } from '../components/file-table'
import type { StorageProvider, ViewMode, DocumentWithTags, DocumentFilters } from '../types'
import { MAX_FILE_SIZE_OPTIONS, TAG_COLORS, DEFAULT_DOCUMENTS_SETTINGS } from '../types'

export default function DocumentsPage() {
  const { toast } = useToast()
  const { data: settings, isLoading: settingsLoading } = useDocumentsSettings()
  const updateSettings = useUpdateDocumentsSettings()

  // Onboarding state
  const [selectedProvider, setSelectedProvider] = useState<StorageProvider>('supabase')
  const [bucketName, setBucketName] = useState('')
  const [defaultView, setDefaultView] = useState<ViewMode>('cards')
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(500)

  // Main view state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<DocumentFilters>({})
  const [showFilters, setShowFilters] = useState(false)

  // Dialog state
  const [renameDoc, setRenameDoc] = useState<DocumentWithTags | null>(null)
  const [renameName, setRenameName] = useState('')
  const [moveDoc, setMoveDoc] = useState<DocumentWithTags | null>(null)
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Queries
  const { data: documentsData, isLoading: docsLoading } = useDocuments({
    folder_id: currentFolderId,
    search: searchQuery || undefined,
    ...filters,
  })
  const { data: foldersData } = useFolders(true)
  const { data: tagsData } = useTags()

  // Mutations
  const uploadDocument = useUploadDocument()
  const downloadDocument = useDownloadDocument()
  const updateDocument = useUpdateDocument()
  const deleteDocument = useDeleteDocument()
  const createFolder = useCreateFolder()
  const bulkDelete = useBulkDeleteDocuments()
  const bulkMove = useBulkMoveDocuments()

  const isOnboarding = !settings?.onboardingCompleted && !settingsLoading

  // Set view mode from settings when loaded
  useState(() => {
    if (settings?.defaultView) {
      setViewMode(settings.defaultView)
    }
  })

  // Handle onboarding completion
  const handleCompleteSetup = async () => {
    try {
      const newSettings = {
        onboardingCompleted: true,
        storageProvider: selectedProvider,
        defaultView,
        maxFileSizeMb,
        allowedFileTypes: [],
        ...(selectedProvider === 'supabase' && {
          supabase: { bucketName: bucketName || 'ari-documents' },
        }),
        ...(selectedProvider === 'r2' && bucketName && {
          r2: { bucketName },
        }),
        ...(selectedProvider === 's3' && bucketName && {
          s3: { bucketName, region: 'us-east-1' },
        }),
      }

      await updateSettings.mutateAsync(newSettings)
      toast({
        title: 'Setup complete',
        description: 'Documents module is ready to use.',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // File upload handler
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      try {
        await uploadDocument.mutateAsync({
          file,
          folderId: currentFolderId,
        })
        toast({
          title: 'File uploaded',
          description: `${file.name} uploaded successfully.`,
        })
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
  }, [currentFolderId, uploadDocument, toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
  })

  // Download handler
  const handleDownload = async (id: string) => {
    try {
      const result = await downloadDocument.mutateAsync(id)
      // Open signed URL in new tab or trigger download
      const link = document.createElement('a')
      link.href = result.url
      link.download = result.filename
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Selection handlers
  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected && documentsData?.files) {
      setSelectedIds(new Set(documentsData.files.map((f) => f.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  // Rename handler
  const handleRename = async () => {
    if (!renameDoc || !renameName.trim()) return
    try {
      await updateDocument.mutateAsync({
        id: renameDoc.id,
        data: { name: renameName.trim() },
      })
      setRenameDoc(null)
      toast({ title: 'File renamed' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Rename failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Move handler
  const handleMove = async () => {
    if (!moveDoc) return
    try {
      await updateDocument.mutateAsync({
        id: moveDoc.id,
        data: { folder_id: moveFolderId },
      })
      setMoveDoc(null)
      toast({ title: 'File moved' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Move failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Delete handler
  const handleDelete = async (id: string) => {
    try {
      await deleteDocument.mutateAsync(id)
      selectedIds.delete(id)
      setSelectedIds(new Set(selectedIds))
      toast({ title: 'File moved to trash' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Bulk operations
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    try {
      await bulkDelete.mutateAsync(Array.from(selectedIds))
      setSelectedIds(new Set())
      toast({ title: `${selectedIds.size} files moved to trash` })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Create folder handler
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await createFolder.mutateAsync({
        name: newFolderName.trim(),
        parent_id: currentFolderId,
      })
      setNewFolderOpen(false)
      setNewFolderName('')
      toast({ title: 'Folder created' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create folder',
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Build breadcrumb
  const breadcrumb = [{ id: null, name: 'Documents' }]
  if (currentFolderId && foldersData?.folders) {
    const flatFolders = foldersData.folders
    const buildPath = (folderId: string | null): void => {
      if (!folderId) return
      const folder = flatFolders.find((f: any) => f.id === folderId)
      if (!folder) return
      buildPath(folder.parent_id)
      breadcrumb.push({ id: folder.id, name: folder.name })
    }
    buildPath(currentFolderId)
  }

  // Loading state
  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Onboarding screen
  if (isOnboarding) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-muted p-4">
              <FileBox className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl">Welcome to Documents</CardTitle>
            <CardDescription>
              Secure file storage with multi-provider support.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Select Storage Provider */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Step 1</Badge>
                <span className="font-medium">Select Storage Provider</span>
              </div>
              <Select
                value={selectedProvider}
                onValueChange={(v) => setSelectedProvider(v as StorageProvider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supabase">Supabase Storage (Recommended)</SelectItem>
                  <SelectItem value="r2">Cloudflare R2</SelectItem>
                  <SelectItem value="s3">AWS S3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Configure Credentials */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Step 2</Badge>
                <span className="font-medium">Configure Credentials</span>
              </div>

              {selectedProvider === 'supabase' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Supabase Storage (Recommended)</AlertTitle>
                  <AlertDescription>
                    No extra configuration needed - uses your existing Supabase connection.
                    A bucket named &quot;ari-documents&quot; will be created automatically.
                    <br />
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      Note: Supabase free tier has a 50MB file size limit.
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {selectedProvider === 'r2' && (
                <div className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Cloudflare R2</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>Add these environment variables to .env.local (and Vercel):</p>
                      <pre className="mt-2 rounded bg-muted p-2 text-xs font-mono">
                        R2_ACCOUNT_ID=your_account_id{'\n'}
                        R2_ACCESS_KEY_ID=your_access_key{'\n'}
                        R2_SECRET_ACCESS_KEY=your_secret_key
                      </pre>
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label htmlFor="r2-bucket">Bucket Name</Label>
                    <Input
                      id="r2-bucket"
                      placeholder="my-documents-bucket"
                      value={bucketName}
                      onChange={(e) => setBucketName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {selectedProvider === 's3' && (
                <div className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>AWS S3</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>Add these environment variables to .env.local (and Vercel):</p>
                      <pre className="mt-2 rounded bg-muted p-2 text-xs font-mono">
                        AWS_ACCESS_KEY_ID=your_access_key{'\n'}
                        AWS_SECRET_ACCESS_KEY=your_secret_key{'\n'}
                        AWS_REGION=us-east-1
                      </pre>
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label htmlFor="s3-bucket">Bucket Name</Label>
                    <Input
                      id="s3-bucket"
                      placeholder="my-documents-bucket"
                      value={bucketName}
                      onChange={(e) => setBucketName(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Preferences */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Step 3</Badge>
                <span className="font-medium">Preferences</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default View</Label>
                  <Select
                    value={defaultView}
                    onValueChange={(v) => setDefaultView(v as ViewMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cards">Cards</SelectItem>
                      <SelectItem value="table">Table</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Max File Size</Label>
                  <Select
                    value={maxFileSizeMb.toString()}
                    onValueChange={(v) => setMaxFileSizeMb(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAX_FILE_SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value.toString()}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleCompleteSetup}
              disabled={
                updateSettings.isPending ||
                ((selectedProvider === 'r2' || selectedProvider === 's3') && !bucketName)
              }
            >
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                'Complete Setup'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main documents view
  return (
    <div className="p-6 space-y-4" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="border-2 border-dashed border-primary rounded-lg p-12 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
            <p className="text-lg font-medium">Drop files here to upload</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            {breadcrumb.map((item, index) => (
              <div key={item.id || 'root'} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-4 w-4" />}
                <button
                  onClick={() => setCurrentFolderId(item.id)}
                  className={`hover:text-foreground ${
                    index === breadcrumb.length - 1 ? 'text-foreground font-medium' : ''
                  }`}
                >
                  {item.name}
                </button>
              </div>
            ))}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {breadcrumb[breadcrumb.length - 1]?.name || 'Documents'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode('cards')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            New Folder
          </Button>

          <Button
            onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className={showFilters ? 'bg-muted' : ''}
        >
          <Filter className="h-4 w-4" />
        </Button>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-4 pl-4 border-l">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>File Type</Label>
                <Select
                  value={filters.mime_types?.[0] || 'all'}
                  onValueChange={(v) =>
                    setFilters({
                      ...filters,
                      mime_types: v === 'all' ? undefined : [v],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="image/">Images</SelectItem>
                    <SelectItem value="application/pdf">PDFs</SelectItem>
                    <SelectItem value="video/">Videos</SelectItem>
                    <SelectItem value="audio/">Audio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <Select
                  value={filters.tag_ids?.[0] || 'all'}
                  onValueChange={(v) =>
                    setFilters({
                      ...filters,
                      tag_ids: v === 'all' ? undefined : [v],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tags</SelectItem>
                    {tagsData?.tags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFilters({})
                    setShowFilters(false)
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Folders */}
      {foldersData?.folders && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {foldersData.folders
            .filter((f: any) => f.parent_id === currentFolderId && !f.deleted_at)
            .map((folder: any) => (
              <button
                key={folder.id}
                onClick={() => setCurrentFolderId(folder.id)}
                className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted transition-colors text-left"
              >
                <FolderPlus className="h-5 w-5 text-muted-foreground" />
                <span className="truncate text-sm">{folder.name}</span>
              </button>
            ))}
        </div>
      )}

      {/* Documents */}
      {docsLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {documentsData?.files.map((doc) => (
            <FileCard
              key={doc.id}
              document={doc}
              selected={selectedIds.has(doc.id)}
              onSelect={handleSelect}
              onDownload={handleDownload}
              onRename={(d) => {
                setRenameDoc(d)
                setRenameName(d.name)
              }}
              onMove={(d) => {
                setMoveDoc(d)
                setMoveFolderId(d.folder_id)
              }}
              onTag={() => {}} // TODO: Implement tag management dialog
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <FileTable
          documents={documentsData?.files || []}
          selectedIds={selectedIds}
          onSelectAll={handleSelectAll}
          onSelect={handleSelect}
          onDownload={handleDownload}
          onRename={(d) => {
            setRenameDoc(d)
            setRenameName(d.name)
          }}
          onMove={(d) => {
            setMoveDoc(d)
            setMoveFolderId(d.folder_id)
          }}
          onTag={() => {}} // TODO: Implement tag management dialog
          onDelete={handleDelete}
        />
      )}

      {/* Empty state */}
      {!docsLoading && (!documentsData?.files || documentsData.files.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <FileBox className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No documents yet</p>
          <p className="text-sm">Upload files or drag and drop them here</p>
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameDoc} onOpenChange={(open) => !open && setRenameDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
            <DialogDescription>Enter a new name for the file.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="File name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDoc(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={updateDocument.isPending}>
              {updateDocument.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={!!moveDoc} onOpenChange={(open) => !open && setMoveDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move File</DialogTitle>
            <DialogDescription>Select a destination folder.</DialogDescription>
          </DialogHeader>
          <Select
            value={moveFolderId || 'root'}
            onValueChange={(v) => setMoveFolderId(v === 'root' ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Documents (root)</SelectItem>
              {foldersData?.folders
                .filter((f: any) => !f.deleted_at)
                .map((folder: any) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDoc(null)}>
              Cancel
            </Button>
            <Button onClick={handleMove} disabled={updateDocument.isPending}>
              {updateDocument.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder.</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={createFolder.isPending}>
              {createFolder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
