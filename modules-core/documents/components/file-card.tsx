'use client'

import { memo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MoreVertical,
  Download,
  Pencil,
  Trash2,
  FolderInput,
} from 'lucide-react'
import type { DocumentWithTags } from '../types'
import { getFileIcon, formatFileSize, formatDate, isPreviewableImage, truncateFilename, getStorageProviderLabel } from '../lib/utils'

interface FileCardProps {
  document: DocumentWithTags
  selected: boolean
  onSelect: (id: string, selected: boolean) => void
  onDownload: (id: string) => void
  onPreview?: (doc: DocumentWithTags) => void
  onRename: (doc: DocumentWithTags) => void
  onMove: (doc: DocumentWithTags) => void
  onDelete: (id: string) => void
  previewUrl?: string
  downloadPending?: boolean
  deletePending?: boolean
}

function FileCardBase({
  document,
  selected,
  onSelect,
  onDownload,
  onPreview,
  onRename,
  onMove,
  onDelete,
  previewUrl,
  downloadPending,
  deletePending,
}: FileCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const Icon = getFileIcon(document.mime_type)
  const isImage = isPreviewableImage(document.mime_type)
  const canPreview = isImage && !!previewUrl && !!onPreview

  return (
    <Card
      className={`group relative cursor-pointer transition-all hover:shadow-md w-[202px] ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Selection checkbox */}
      <div
        className={`absolute top-2 left-2 z-10 transition-opacity ${
          selected || isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(document.id, !!checked)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Actions dropdown */}
      <div className="absolute top-2 right-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 transition-opacity focus-visible:opacity-100 ${
                isHovered ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Actions for ${document.name}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDownload(document.id)} disabled={downloadPending}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(document)}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove(document)}>
              <FolderInput className="mr-2 h-4 w-4" />
              Move to...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(document.id)}
              className="text-destructive"
              disabled={deletePending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent
        className="p-4"
        onClick={() => (canPreview ? onPreview!(document) : onDownload(document.id))}
      >
        {/* Preview / Icon */}
        <div className="w-[170px] h-[170px] mb-3 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
          {isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt={document.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Icon className="h-12 w-12 text-foreground" />
          )}
        </div>

        {/* File name */}
        <p className="font-medium text-sm truncate" title={document.name}>
          {truncateFilename(document.name, 25)}
        </p>

        {/* Storage info */}
        <p className="text-xs text-muted-foreground mt-1">
          Storage: {getStorageProviderLabel(document.storage_provider)}
        </p>
        {document.storage_bucket && (
          <p className="text-xs text-muted-foreground">
            Bucket: {document.storage_bucket}
          </p>
        )}

        {/* File info */}
        <p className="text-xs text-muted-foreground mt-1">
          {formatFileSize(document.size_bytes)} • {formatDate(document.created_at)}
        </p>

        {/* Tags */}
        {document.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {document.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-xs px-1.5 py-0"
                style={{ borderColor: tag.color, color: tag.color }}
              >
                {tag.name}
              </Badge>
            ))}
            {document.tags.length > 3 && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                +{document.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Memoized so the 50+ cards in a list don't all re-render when an unrelated
// pending state flips on the parent (e.g. one download in flight).
export const FileCard = memo(FileCardBase)
