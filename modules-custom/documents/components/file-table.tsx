'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { getFileIcon, formatFileSize, formatDate, getFileExtension } from '../lib/utils'

interface FileTableProps {
  documents: DocumentWithTags[]
  selectedIds: Set<string>
  onSelectAll: (selected: boolean) => void
  onSelect: (id: string, selected: boolean) => void
  onDownload: (id: string) => void
  onRename: (doc: DocumentWithTags) => void
  onMove: (doc: DocumentWithTags) => void
  onTag: (doc: DocumentWithTags) => void
  onDelete: (id: string) => void
}

export function FileTable({
  documents,
  selectedIds,
  onSelectAll,
  onSelect,
  onDownload,
  onRename,
  onMove,
  onTag,
  onDelete,
}: FileTableProps) {
  const allSelected = documents.length > 0 && selectedIds.size === documents.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < documents.length

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                ref={(ref) => {
                  if (ref) {
                    (ref as any).indeterminate = someSelected
                  }
                }}
                onCheckedChange={onSelectAll}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-24">Type</TableHead>
            <TableHead className="w-24">Size</TableHead>
            <TableHead className="w-32">Modified</TableHead>
            <TableHead className="w-48">Tags</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No documents found
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => {
              const Icon = getFileIcon(doc.mime_type)
              const isSelected = selectedIds.has(doc.id)

              return (
                <TableRow
                  key={doc.id}
                  className={isSelected ? 'bg-muted/50' : ''}
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => onSelect(doc.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <div
                      className="flex items-center gap-2 cursor-pointer hover:text-primary"
                      onClick={() => onDownload(doc.id)}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate max-w-[300px]" title={doc.name}>
                        {doc.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getFileExtension(doc.original_name) || doc.mime_type.split('/')[1]?.toUpperCase()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatFileSize(doc.size_bytes)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(doc.updated_at || doc.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {doc.tags.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: tag.color, color: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                      {doc.tags.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{doc.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onDownload(doc.id)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRename(doc)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onMove(doc)}>
                          <FolderInput className="mr-2 h-4 w-4" />
                          Move to...
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onTag(doc)}>
                          <Tags className="mr-2 h-4 w-4" />
                          Manage Tags
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(doc.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
