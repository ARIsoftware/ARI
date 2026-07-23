'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RenameDialogProps {
  open: boolean
  initialTitle: string
  isPending: boolean
  onCancel: () => void
  onSubmit: (title: string) => void
}

export function RenameDialog({ open, initialTitle, isPending, onCancel, onSubmit }: RenameDialogProps) {
  const [value, setValue] = useState(initialTitle)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue(initialTitle)
      setError(null)
    }
  }, [open, initialTitle])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Title is required')
      return
    }
    if (trimmed.length > 200) {
      setError('Title must be 200 characters or fewer')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Give this chat a more memorable title.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="rename-input">Title</Label>
          <Input
            id="rename-input"
            value={value}
            maxLength={200}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            disabled={isPending}
            aria-invalid={!!error}
            className={cn(error && 'border-red-500 focus-visible:ring-red-500')}
            autoFocus
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
