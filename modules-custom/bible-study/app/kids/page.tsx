'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Plus, Trash2, Edit2, Search, BookOpen } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  useKidsStudies,
  useCreateKidsStudy,
  useUpdateKidsStudy,
  useDeleteKidsStudy,
  useBibleStudySettings,
} from '../../hooks/use-bible-study'
import type { KidsStudy } from '../../types'
import BibleChat from '../../components/bible-chat'

type FieldErrors = Record<string, string>

interface StudyForm {
  title: string
  book: string
  chapter: number
  verse_start: number | null
  verse_end: number | null
  key_lesson: string
  discussion_questions: string[]
  memory_verse: string
  notes_age_8: string
  notes_age_6: string
  notes_age_3: string
}

const emptyForm: StudyForm = {
  title: '', book: '', chapter: 1, verse_start: null, verse_end: null,
  key_lesson: '', discussion_questions: [''], memory_verse: '',
  notes_age_8: '', notes_age_6: '', notes_age_3: '',
}

function validateForm(form: StudyForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.title.trim()) errors.title = 'Title is required'
  if (!form.book.trim()) errors.book = 'Book is required'
  if (form.chapter < 1) errors.chapter = 'Chapter must be at least 1'
  return errors
}

export default function KidsStudiesPage() {
  const { toast } = useToast()
  const [bookFilter, setBookFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStudy, setEditingStudy] = useState<KidsStudy | null>(null)
  const [form, setForm] = useState<StudyForm>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [viewingStudy, setViewingStudy] = useState<KidsStudy | null>(null)

  const { data: studies = [], isLoading } = useKidsStudies(bookFilter || undefined)
  const { data: settings } = useBibleStudySettings()
  const createStudy = useCreateKidsStudy()
  const updateStudy = useUpdateKidsStudy()
  const deleteStudy = useDeleteKidsStudy()

  const kidNames = settings?.kids?.map((k) => k.name).filter(Boolean) || []

  const inputClass = (field: string) =>
    errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''

  const updateField = (field: keyof StudyForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
  }

  const openCreate = () => {
    setEditingStudy(null)
    setForm(emptyForm)
    setErrors({})
    setDialogOpen(true)
  }

  const openEdit = (study: KidsStudy) => {
    setEditingStudy(study)
    setForm({
      title: study.title,
      book: study.book,
      chapter: study.chapter,
      verse_start: study.verse_start,
      verse_end: study.verse_end,
      key_lesson: study.key_lesson || '',
      discussion_questions: (study.discussion_questions?.length ? study.discussion_questions : ['']),
      memory_verse: study.memory_verse || '',
      notes_age_8: study.notes_age_8 || '',
      notes_age_6: study.notes_age_6 || '',
      notes_age_3: study.notes_age_3 || '',
    })
    setErrors({})
    setDialogOpen(true)
  }

  const handleSave = () => {
    const fieldErrors = validateForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    const payload = {
      ...form,
      discussion_questions: form.discussion_questions.filter((q) => q.trim()),
      key_lesson: form.key_lesson || null,
      memory_verse: form.memory_verse || null,
      notes_age_8: form.notes_age_8 || null,
      notes_age_6: form.notes_age_6 || null,
      notes_age_3: form.notes_age_3 || null,
    }

    if (editingStudy) {
      updateStudy.mutate({ id: editingStudy.id, ...payload }, {
        onSuccess: () => setDialogOpen(false),
        onError: (err) => toast({ variant: 'destructive', title: 'Failed to update study', description: err.message }),
      })
    } else {
      createStudy.mutate(payload, {
        onSuccess: () => setDialogOpen(false),
        onError: (err) => toast({ variant: 'destructive', title: 'Failed to create study', description: err.message }),
      })
    }
  }

  const handleDelete = (id: string) => {
    deleteStudy.mutate(id, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to delete', description: err.message }),
    })
  }

  const addQuestion = () => updateField('discussion_questions', [...form.discussion_questions, ''])
  const updateQuestion = (i: number, val: string) => {
    const updated = [...form.discussion_questions]
    updated[i] = val
    updateField('discussion_questions', updated)
  }
  const removeQuestion = (i: number) => {
    if (form.discussion_questions.length <= 1) return
    updateField('discussion_questions', form.discussion_questions.filter((_, idx) => idx !== i))
  }

  const studyContext = viewingStudy ? {
    type: 'kids' as const,
    studyId: viewingStudy.id,
    title: viewingStudy.title,
    book: viewingStudy.book,
    chapter: viewingStudy.chapter,
  } : null

  // Viewing a specific study
  if (viewingStudy) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setViewingStudy(null)}>&larr; Back</Button>
          <div>
            <h1 className="text-3xl font-medium">{viewingStudy.title}</h1>
            <p className="text-sm text-muted-foreground">{viewingStudy.book} {viewingStudy.chapter}{viewingStudy.verse_start ? `:${viewingStudy.verse_start}` : ''}{viewingStudy.verse_end ? `-${viewingStudy.verse_end}` : ''}</p>
          </div>
        </div>

        {viewingStudy.key_lesson && (
          <Card>
            <CardHeader><CardTitle>Key Lesson</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap">{viewingStudy.key_lesson}</p></CardContent>
          </Card>
        )}

        {viewingStudy.memory_verse && (
          <Card>
            <CardHeader><CardTitle>Memory Verse</CardTitle></CardHeader>
            <CardContent><p className="italic text-lg">&ldquo;{viewingStudy.memory_verse}&rdquo;</p></CardContent>
          </Card>
        )}

        {viewingStudy.discussion_questions && viewingStudy.discussion_questions.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Discussion Questions</CardTitle></CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2">
                {viewingStudy.discussion_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {settings?.kids?.map((kid, i) => {
            const notesField = i === 0 ? viewingStudy.notes_age_8 : i === 1 ? viewingStudy.notes_age_6 : viewingStudy.notes_age_3
            return (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="text-base">{kid.name || `Kid ${i + 1}`} (age {kid.age})</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{notesField || 'No age-specific notes'}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <BibleChat studyContext={studyContext} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-medium">Kids Bible Studies</h1>
          <p className="text-sm text-muted-foreground mt-1">Bible studies for {kidNames.length > 0 ? kidNames.join(', ') : 'your kids'}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> New Study
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter by book of the Bible..."
          value={bookFilter}
          onChange={(e) => setBookFilter(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : studies.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">No kids studies yet. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {studies.map((study) => (
            <Card key={study.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewingStudy(study)}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{study.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {study.book} {study.chapter}{study.verse_start ? `:${study.verse_start}` : ''}{study.verse_end ? `-${study.verse_end}` : ''} &middot; {new Date(study.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(study)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(study.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStudy ? 'Edit Kids Study' : 'New Kids Study'}</DialogTitle>
            <DialogDescription>Create a Bible study for your children</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input className={inputClass('title')} value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="e.g., David and Goliath" />
              {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Book *</Label>
                <Input className={inputClass('book')} value={form.book} onChange={(e) => updateField('book', e.target.value)} placeholder="Genesis" />
                {errors.book && <p className="text-xs text-red-500">{errors.book}</p>}
              </div>
              <div className="space-y-2">
                <Label>Chapter *</Label>
                <Input className={inputClass('chapter')} type="number" value={form.chapter} onChange={(e) => updateField('chapter', parseInt(e.target.value) || 1)} min={1} />
                {errors.chapter && <p className="text-xs text-red-500">{errors.chapter}</p>}
              </div>
              <div className="space-y-2">
                <Label>Verses</Label>
                <div className="flex gap-1 items-center">
                  <Input type="number" value={form.verse_start ?? ''} onChange={(e) => updateField('verse_start', e.target.value ? parseInt(e.target.value) : null)} placeholder="Start" min={1} />
                  <span className="text-muted-foreground">-</span>
                  <Input type="number" value={form.verse_end ?? ''} onChange={(e) => updateField('verse_end', e.target.value ? parseInt(e.target.value) : null)} placeholder="End" min={1} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Key Lesson</Label>
              <Textarea value={form.key_lesson} onChange={(e) => updateField('key_lesson', e.target.value)} placeholder="What is the main takeaway?" rows={3} />
            </div>

            <div className="space-y-2">
              <Label>Memory Verse</Label>
              <Input value={form.memory_verse} onChange={(e) => updateField('memory_verse', e.target.value)} placeholder="Key verse to memorize" />
            </div>

            <div className="space-y-2">
              <Label>Discussion Questions</Label>
              {form.discussion_questions.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={q} onChange={(e) => updateQuestion(i, e.target.value)} placeholder={`Question ${i + 1}`} className="flex-1" />
                  {form.discussion_questions.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeQuestion(i)} className="text-red-500 px-2">&times;</Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addQuestion}><Plus className="w-3 h-3 mr-1" /> Add Question</Button>
            </div>

            {settings?.kids?.map((kid, i) => (
              <div key={i} className="space-y-2">
                <Label>Notes for {kid.name || `Kid ${i + 1}`} (age {kid.age})</Label>
                <Textarea
                  value={i === 0 ? form.notes_age_8 : i === 1 ? form.notes_age_6 : form.notes_age_3}
                  onChange={(e) => updateField(i === 0 ? 'notes_age_8' : i === 1 ? 'notes_age_6' : 'notes_age_3', e.target.value)}
                  placeholder={`How to explain to a ${kid.age}-year-old...`}
                  rows={2}
                />
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createStudy.isPending || updateStudy.isPending}>
                {(createStudy.isPending || updateStudy.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {editingStudy ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BibleChat />
    </div>
  )
}
