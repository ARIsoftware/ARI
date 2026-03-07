'use client'

import { useState } from 'react'
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
  Tags,
} from 'lucide-react'
import type { DocumentWithTags } from '../types'
import { getFileIcon, formatFileSize, formatDate, isPreviewableImage, truncateFilename } from '../lib/utils'

interface FileCardProps {
  document: DocumentWithTags
  selected: boolean
  onSelect: (id: string, selected: boolean) => void
  onDownload: (id: string) => void
  onRename: (doc: DocumentWithTags) => void
  onMove: (doc: DocumentWithTags) => void
  onTag: (doc: DocumentWithTags) => void
  onDelete: (id: string) => void
  previewUrl?: string
}

export function FileCard({
  document,
  selected,
  onSelect,
  onDownload,
  onRename,
  onMove,
  onTag,
  onDelete,
  previewUrl,
}: FileCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const Icon = getFileIcon(document.mime_type)
  const isImage = isPreviewableImage(document.mime_type)

  return (
    <Card
      className={`group relative cursor-pointer transition-all hover:shadow-md ${
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
              className={`h-8 w-8 transition-opacity ${
                isHovered ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDownload(document.id)}>
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
            <DropdownMenuItem onClick={() => onTag(document)}>
              <Tags className="mr-2 h-4 w-4" />
              Manage Tags
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(document.id)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent className="p-4" onClick={() => onDownload(document.id)}>
        {/* Preview / Icon */}
        <div className="aspect-square mb-3 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
          {isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt={document.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Icon className="h-12 w-12 text-muted-foreground" />
          )}
        </div>

        {/* File name */}
        <p className="font-medium text-sm truncate" title={document.name}>
          {truncateFilename(document.name, 25)}
        </p>

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
