'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  Folder,
  FolderPlus,
  ChevronRight,
  Loader2,
  AlertCircle,
  Trash2,
  FolderInput,
  Filter,
  X,
  Download,
  HardDrive,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
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
import type { ViewMode, DocumentWithTags, DocumentFilters, FolderWithChildren } from '../types'
import { validateFolderName, toastError } from '../lib/utils'
import { MAX_FILE_SIZE_OPTIONS, TAG_COLORS, DEFAULT_DOCUMENTS_SETTINGS, MAX_UPLOAD_MB } from '../types'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export default function DocumentsPage() {
  const { toast } = useToast()
  const { data: settings, isLoading: settingsLoading } = useDocumentsSettings()
  const updateSettings = useUpdateDocumentsSettings()

  const [defaultView, setDefaultView] = useState<ViewMode>('cards')
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(MAX_UPLOAD_MB)

  // Current folder lives in the URL (?folder=<uuid>) so each location has a
  // shareable, refreshable, back-button-friendly link.
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentFolderId = searchParams.get('folder')
  const setCurrentFolderId = useCallback(
    (id: string | null) => {
      router.push(id ? `/documents?folder=${id}` : '/documents')
    },
    [router]
  )

  // Main view state
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<DocumentFilters>({})
  const [showFilters, setShowFilters] = useState(false)

  // Dialog state
  const [previewDoc, setPreviewDoc] = useState<DocumentWithTags | null>(null)
  const [renameDoc, setRenameDoc] = useState<DocumentWithTags | null>(null)
  const [renameName, setRenameName] = useState('')
  const [moveDoc, setMoveDoc] = useState<DocumentWithTags | null>(null)
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<DocumentWithTags | null>(null)
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false)

  // Queries
  const {
    data: documentsData,
    isLoading: docsLoading,
    error: docsError,
    refetch: refetchDocs,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDocuments({
    folder_id: currentFolderId,
    search: debouncedSearch || undefined,
    with_previews: viewMode === 'cards',
    ...filters,
  })

  // Flatten the paged results into a single list for rendering and selection.
  const documentFiles = useMemo(
    () => documentsData?.pages.flatMap((p) => p.files) ?? [],
    [documentsData],
  )
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

  // Apply the user's saved view mode whenever settings load or change.
  useEffect(() => {
    if (settings?.defaultView) {
      setViewMode(settings.defaultView)
    }
  }, [settings?.defaultView])

  // Handle onboarding completion
  const handleCompleteSetup = async () => {
    try {
      await updateSettings.mutateAsync({
        onboardingCompleted: true,
        defaultView,
        maxFileSizeMb,
        allowedFileTypes: [],
      })
      toast({
        title: 'Setup complete',
        description: 'Documents module is ready to use.',
      })
    } catch (error) {
      toastError(toast, 'Setup failed', error)
    }
  }

  // File upload handler
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const maxBytes = (settings?.maxFileSizeMb ?? MAX_UPLOAD_MB) * 1024 * 1024
    for (const file of acceptedFiles) {
      if (file.size > maxBytes) {
        const fileMb = (file.size / (1024 * 1024)).toFixed(1)
        const limitMb = settings?.maxFileSizeMb ?? MAX_UPLOAD_MB
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: `"${file.name}" is ${fileMb} MB. The current limit is ${limitMb} MB — raise it in Settings or upload a smaller file.`,
        })
        continue
      }
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
        toastError(toast, 'Upload failed', error)
      }
    }
  }, [currentFolderId, settings?.maxFileSizeMb, uploadDocument, toast])

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
      toastError(toast, 'Download failed', error)
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
    if (selected && documentFiles.length > 0) {
      setSelectedIds(new Set(documentFiles.map((f) => f.id)))
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
      toastError(toast, 'Rename failed', error)
    }
  }

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
      toastError(toast, 'Move failed', error)
    }
  }

  // Delete handler — opens confirmation dialog instead of immediately deleting.
  const handleDelete = (id: string) => {
    const doc = documentFiles.find((f) => f.id === id) ?? null
    setConfirmDelete(doc)
  }

  const performDelete = async () => {
    if (!confirmDelete) return
    const id = confirmDelete.id
    setConfirmDelete(null)
    try {
      await deleteDocument.mutateAsync(id)
      selectedIds.delete(id)
      setSelectedIds(new Set(selectedIds))
      toast({ title: 'File moved to trash' })
    } catch (error) {
      toastError(toast, 'Delete failed', error)
    }
  }

  // Bulk operations — also gated by a confirmation dialog because misclicks
  // while many items are selected are unrecoverable from the UI alone.
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return
    setConfirmBulkDeleteOpen(true)
  }

  const performBulkDelete = async () => {
    const count = selectedIds.size
    setConfirmBulkDeleteOpen(false)
    try {
      await bulkDelete.mutateAsync(Array.from(selectedIds))
      setSelectedIds(new Set())
      toast({ title: `${count} files moved to trash` })
    } catch (error) {
      toastError(toast, 'Delete failed', error)
    }
  }

  // Create folder handler
  const newFolderError = newFolderName.length > 0 ? validateFolderName(newFolderName) : null

  const handleCreateFolder = async () => {
    if (validateFolderName(newFolderName) !== null) return
    try {
      await createFolder.mutateAsync({
        name: newFolderName.trim(),
        parent_id: currentFolderId,
      })
      setNewFolderOpen(false)
      setNewFolderName('')
      toast({ title: 'Folder created' })
    } catch (error) {
      toastError(toast, 'Failed to create folder', error)
    }
  }

  // Build breadcrumb. Index folders by id once so each parent lookup is O(1)
  // instead of an O(n) scan per path segment.
  const breadcrumb: Array<{ id: string | null; name: string }> = [{ id: null, name: 'Documents' }]
  if (currentFolderId && foldersData?.folders) {
    const folderById = new Map<string, FolderWithChildren>(
      foldersData.folders.map((f: FolderWithChildren) => [f.id, f])
    )
    const buildPath = (folderId: string | null): void => {
      if (!folderId) return
      const folder = folderById.get(folderId)
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
            {/* Step 1: Storage Provider */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Step 1</Badge>
                <span className="font-medium">Storage Provider</span>
              </div>
              <Alert>
                <HardDrive className="h-4 w-4" />
                <AlertTitle>
                  The Storage Provider is{' '}
                  {settings?.globalProvider?.label ?? 'loading…'}
                </AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    You can change and configure your Storage Provider in ARI&apos;s{' '}
                    <Link
                      href="/settings"
                      className="inline-flex items-center gap-1 underline hover:text-foreground"
                    >
                      Settings &rarr; Storage tab
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                    .
                  </p>
                </AlertDescription>
              </Alert>
            </div>

            {/* Step 2: Preferences */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Step 2</Badge>
                <span className="font-medium">Preferences</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="onboarding-default-view">Default View</Label>
                  <Select
                    value={defaultView}
                    onValueChange={(v) => setDefaultView(v as ViewMode)}
                  >
                    <SelectTrigger id="onboarding-default-view">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cards">Cards</SelectItem>
                      <SelectItem value="table">Table</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onboarding-max-file-size">Max File Size</Label>
                  <Select
                    value={maxFileSizeMb.toString()}
                    onValueChange={(v) => setMaxFileSizeMb(parseInt(v))}
                  >
                    <SelectTrigger id="onboarding-max-file-size">
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
              disabled={updateSettings.isPending}
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
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              {breadcrumb.map((item, index) => {
                const isCurrent = index === breadcrumb.length - 1
                return (
                  <li key={item.id || 'root'} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                    <button
                      onClick={() => setCurrentFolderId(item.id)}
                      className={`hover:text-foreground ${
                        isCurrent ? 'text-foreground font-medium' : ''
                      }`}
                      aria-current={isCurrent ? 'page' : undefined}
                    >
                      {item.name}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight">
            {breadcrumb[breadcrumb.length - 1]?.name || 'Documents'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-md" role="group" aria-label="View mode">
            <Button
              variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode('cards')}
              aria-label="Card view"
              aria-pressed={viewMode === 'cards'}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode('table')}
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
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
          aria-label={showFilters ? 'Hide filters' : 'Show filters'}
          aria-pressed={showFilters}
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
        <div className="flex flex-wrap gap-2">
          {foldersData.folders
            .filter((f: any) => f.parent_id === currentFolderId && !f.deleted_at)
            .map((folder: any) => (
              <button
                key={folder.id}
                onClick={() => setCurrentFolderId(folder.id)}
                className="flex flex-col items-center gap-1 p-3 w-24 rounded-lg hover:bg-muted transition-colors"
              >
                <Folder className="h-12 w-12 fill-current text-foreground" />
                <span className="truncate text-sm w-full text-center">{folder.name}</span>
              </button>
            ))}
        </div>
      )}

      {/* Documents */}
      {docsError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn't load documents</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{docsError instanceof Error ? docsError.message : 'Unknown error'}</p>
            <Button variant="outline" size="sm" onClick={() => refetchDocs()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : docsLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === 'cards' ? (
        <div className="flex flex-wrap gap-4">
          {documentFiles.map((doc) => (
            <FileCard
              key={doc.id}
              document={doc}
              previewUrl={doc.preview_url}
              selected={selectedIds.has(doc.id)}
              onSelect={handleSelect}
              onDownload={handleDownload}
              onPreview={setPreviewDoc}
              onRename={(d) => {
                setRenameDoc(d)
                setRenameName(d.name)
              }}
              onMove={(d) => {
                setMoveDoc(d)
                setMoveFolderId(d.folder_id)
              }}
              onDelete={handleDelete}
              downloadPending={downloadDocument.isPending}
              deletePending={deleteDocument.isPending}
            />
          ))}
        </div>
      ) : (
        <FileTable
          documents={documentFiles}
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
          onDelete={handleDelete}
          downloadPending={downloadDocument.isPending}
          deletePending={deleteDocument.isPending}
        />
      )}

      {/* Load more */}
      {!docsLoading && !docsError && documentFiles.length > 0 && hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!docsLoading && !docsError && documentFiles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileBox className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No documents yet</p>
          <p className="text-sm">Upload files or drag and drop them here</p>
        </div>
      )}

      {/* Image preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="!max-w-[75vw] w-[75vw] max-h-[75vh] p-0 overflow-hidden [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>{previewDoc?.name ?? 'Image preview'}</DialogTitle>
            <DialogDescription>Image preview. Press Escape to close.</DialogDescription>
          </DialogHeader>
          <div className="absolute top-3 right-3 z-10 flex gap-1">
            {previewDoc && (
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDownload(previewDoc.id)}
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPreviewDoc(null)}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {previewDoc?.preview_url && (
            <img
              src={previewDoc.preview_url}
              alt={previewDoc.name}
              className="w-full max-h-[75vh] object-contain bg-muted"
            />
          )}
        </DialogContent>
      </Dialog>

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
      <Dialog
        open={newFolderOpen}
        onOpenChange={(open) => {
          setNewFolderOpen(open)
          if (!open) setNewFolderName('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Letters, numbers, hyphens, and underscores only — no spaces.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="my-folder"
              aria-invalid={!!newFolderError}
              aria-describedby={newFolderError ? 'new-folder-error' : undefined}
            />
            {newFolderError && (
              <p id="new-folder-error" className="text-xs text-destructive">
                {newFolderError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={createFolder.isPending || validateFolderName(newFolderName) !== null}
            >
              {createFolder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single-file delete confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move file to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `“${confirmDelete.name}” will be moved to the Trash. You can restore it from there.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={confirmBulkDeleteOpen} onOpenChange={setConfirmBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {selectedIds.size} file{selectedIds.size === 1 ? '' : 's'} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected files will be moved to the Trash. You can restore them from there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
