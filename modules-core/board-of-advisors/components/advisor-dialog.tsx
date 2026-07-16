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
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useCreateAdvisor, useUpdateAdvisor } from '@/modules/board-of-advisors/hooks/use-board-of-advisors'
import { AdvisorAvatar } from './advisor-avatar'
import { destructiveToast, pickAdvisorColor } from '@/modules/board-of-advisors/lib/utils'
import { ADVISOR_NAME_MAX, ADVISOR_DESCRIPTION_MAX } from '@/modules/board-of-advisors/lib/limits'
import type { BoardAdvisor } from '@/modules/board-of-advisors/types'

interface AdvisorForm {
  name: string
  description: string
}

type FieldErrors = Partial<Record<keyof AdvisorForm, string>>

// Mirrors createAdvisorSchema in lib/validation.ts.
function validateForm(form: AdvisorForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  else if (form.name.trim().length > ADVISOR_NAME_MAX) errors.name = `Name must be ${ADVISOR_NAME_MAX} characters or fewer`
  if (!form.description.trim()) errors.description = 'Personality description is required'
  else if (form.description.trim().length > ADVISOR_DESCRIPTION_MAX) errors.description = `Description must be ${ADVISOR_DESCRIPTION_MAX} characters or fewer`
  return errors
}

interface AdvisorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing advisor when editing; null when adding a new one. */
  advisor: BoardAdvisor | null
  /** Used to preview the color a brand-new advisor will get. */
  existingCount: number
}

export function AdvisorDialog({ open, onOpenChange, advisor, existingCount }: AdvisorDialogProps) {
  const { toast } = useToast()
  const createAdvisor = useCreateAdvisor()
  const updateAdvisor = useUpdateAdvisor()

  const [form, setForm] = useState<AdvisorForm>({ name: '', description: '' })
  const [errors, setErrors] = useState<FieldErrors>({})

  const isEditing = !!advisor
  const isPending = createAdvisor.isPending || updateAdvisor.isPending

  // Re-seed the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setForm({ name: advisor?.name ?? '', description: advisor?.description ?? '' })
      setErrors({})
    }
  }, [open, advisor])

  const updateField = (field: keyof AdvisorForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const inputClass = (field: keyof AdvisorForm) =>
    errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''

  const handleSave = () => {
    const fieldErrors = validateForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    const payload = { name: form.name.trim(), description: form.description.trim() }
    const callbacks = {
      onSuccess: () => onOpenChange(false),
      onError: (err: Error) => toast(destructiveToast(isEditing ? 'Failed to update advisor' : 'Failed to add advisor', err)),
    }

    if (isEditing) {
      updateAdvisor.mutate({ id: advisor.id, ...payload }, callbacks)
    } else {
      createAdvisor.mutate(payload, callbacks)
    }
  }

  const previewColor = advisor?.color ?? pickAdvisorColor(existingCount)
  const previewName = form.name.trim() || 'New Advisor'

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isPending) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit advisor' : 'Add an advisor'}</DialogTitle>
          <DialogDescription>
            Give them a name and a personality. The description is the advisor&apos;s soul — the
            richer it is, the more distinct their counsel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            <AdvisorAvatar name={previewName} color={previewColor} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{previewName}</p>
              <p className="text-xs text-muted-foreground">
                {isEditing ? 'Advisors keep their color.' : 'Color is assigned automatically.'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="advisor-name">Name</Label>
            <Input
              id="advisor-name"
              value={form.name}
              maxLength={ADVISOR_NAME_MAX}
              placeholder="e.g. Steve Jobs"
              className={inputClass('name')}
              onChange={(e) => updateField('name', e.target.value)}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="advisor-description">Personality</Label>
            <Textarea
              id="advisor-description"
              value={form.description}
              maxLength={ADVISOR_DESCRIPTION_MAX}
              rows={5}
              placeholder="e.g. A smart CEO who is obsessed over the details and always tells the truth. Pushes for simplicity and taste, and has no patience for mediocre work."
              className={cn('resize-none', inputClass('description'))}
              onChange={(e) => updateField('description', e.target.value)}
            />
            {errors.description ? (
              <p className="text-xs text-red-500">{errors.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {form.description.length.toLocaleString()} / {ADVISOR_DESCRIPTION_MAX.toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Save changes' : 'Add to board'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
