'use client'

import { useState, useMemo } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Plus, Pencil, Trash2, Search, Target } from 'lucide-react'
import { useProspects, useCreateProspect, useUpdateProspect, useDeleteProspect } from '../hooks/use-my-prospects'
import { POSITIONS } from '../types'
import type { Prospect, CreateProspectRequest } from '../types'
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear + i - 2)

const emptyForm: CreateProspectRequest = {
  name: '',
  position: 'PG',
  graduation_year: currentYear + 1,
  school: '',
  height: '',
  rating: 3,
  notes: '',
}

type FieldErrors = Record<string, string>

function validateForm(form: CreateProspectRequest): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.position) errors.position = 'Position is required'
  if (!form.graduation_year) errors.graduation_year = 'Year is required'
  if (form.rating < 1 || form.rating > 5) errors.rating = 'Rating must be between 1 and 5'
  return errors
}

function BasketballRating({ rating, interactive, onChange }: { rating: number; interactive?: boolean; onChange?: (r: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(i)}
          className={`text-lg ${interactive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
          aria-label={`${i} basketball${i > 1 ? 's' : ''}`}
        >
          {i <= rating ? (
            <span className="text-orange-500">&#127936;</span>
          ) : (
            <span className="opacity-25">&#127936;</span>
          )}
        </button>
      ))}
    </div>
  )
}

export default function MyProspectsPage() {
  const { toast } = useToast()
  const { data: prospects = [], isLoading } = useProspects()
  const createProspect = useCreateProspect()
  const updateProspect = useUpdateProspect()
  const deleteProspect = useDeleteProspect()

  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateProspectRequest>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})

  const filtered = useMemo(() => {
    if (!search.trim()) return prospects
    const q = search.toLowerCase()
    return prospects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.school.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
    )
  }, [prospects, search])

  const stats = useMemo(() => {
    const total = prospects.length
    const fourPlus = prospects.filter((p) => p.rating >= 4).length
    const classThis = prospects.filter((p) => p.graduation_year === currentYear).length
    const classNext = prospects.filter((p) => p.graduation_year === currentYear + 1).length
    return { total, fourPlus, classThis, classNext }
  }, [prospects])

  const updateField = (field: keyof CreateProspectRequest, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
  }

  const openCreate = () => {
    setForm(emptyForm)
    setErrors({})
    setEditingId(null)
    setDialogOpen(true)
  }

  const openEdit = (p: Prospect) => {
    setForm({
      name: p.name,
      position: p.position,
      graduation_year: p.graduation_year,
      school: p.school,
      height: p.height,
      rating: p.rating,
      notes: p.notes || '',
    })
    setErrors({})
    setEditingId(p.id)
    setDialogOpen(true)
  }

  const handleSave = () => {
    const fieldErrors = validateForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    if (editingId) {
      updateProspect.mutate(
        { id: editingId, ...form },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (err) => toast({ variant: 'destructive', title: 'Failed to update prospect', description: err.message }),
        }
      )
    } else {
      createProspect.mutate(form, {
        onSuccess: () => setDialogOpen(false),
        onError: (err) => toast({ variant: 'destructive', title: 'Failed to create prospect', description: err.message }),
      })
    }
  }

  const handleDelete = (id: string) => {
    deleteProspect.mutate(id, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to delete prospect', description: err.message }),
    })
  }

  const inputClass = (field: string) =>
    errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''

  const selectTriggerClass = (field: string) =>
    errors[field] ? 'border-red-500 ring-red-500' : ''

  const isPending = createProspect.isPending || updateProspect.isPending

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
            <Target className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-4xl font-medium">My Prospects</h1>
            <p className="text-muted-foreground text-sm">Personal recruiting database</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Prospect
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search prospects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-medium">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total Prospects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-medium text-orange-500">{stats.fourPlus}</div>
            <p className="text-sm text-muted-foreground">4+ Star Prospects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-medium">{stats.classThis}</div>
            <p className="text-sm text-muted-foreground">Class of {currentYear}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-medium">{stats.classNext}</div>
            <p className="text-sm text-muted-foreground">Class of {currentYear + 1}</p>
          </CardContent>
        </Card>
      </div>

      {/* Prospects Table */}
      <Card>
        <CardHeader>
          <CardTitle>Scouted Prospects</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{search ? 'No prospects match your search.' : 'No prospects yet. Add one to get started!'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Height</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Evaluated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium">
                        {p.position}
                      </span>
                    </TableCell>
                    <TableCell>{p.school}</TableCell>
                    <TableCell>{p.graduation_year}</TableCell>
                    <TableCell>{p.height}</TableCell>
                    <TableCell>
                      <BasketballRating rating={p.rating} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(p.evaluated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(p.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Prospect' : 'Add New Prospect'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Prospect Name</Label>
                <Input
                  id="name"
                  placeholder="Enter name"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={inputClass('name')}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Select value={form.position} onValueChange={(v) => updateField('position', v)}>
                  <SelectTrigger className={selectTriggerClass('position')}>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.position && <p className="text-xs text-red-500">{errors.position}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Graduation Year</Label>
                <Select
                  value={String(form.graduation_year)}
                  onValueChange={(v) => updateField('graduation_year', Number(v))}
                >
                  <SelectTrigger className={selectTriggerClass('graduation_year')}>
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.graduation_year && <p className="text-xs text-red-500">{errors.graduation_year}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="school">School</Label>
                <Input
                  id="school"
                  placeholder="High school"
                  value={form.school}
                  onChange={(e) => updateField('school', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Height</Label>
                <Input
                  id="height"
                  placeholder="e.g., 6'5"
                  value={form.height}
                  onChange={(e) => updateField('height', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Rating</Label>
              <BasketballRating rating={form.rating} interactive onChange={(r) => updateField('rating', r)} />
              {errors.rating && <p className="text-xs text-red-500">{errors.rating}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Personal Notes</Label>
              <Textarea
                id="notes"
                placeholder="Your evaluation notes, observations, etc."
                value={form.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isPending}>
                {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {editingId ? 'Save Changes' : 'Add Prospect'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
