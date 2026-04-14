'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2, Plus, Trash2, Edit2, BookOpen, Languages,
  FileText, StickyNote, ChevronRight, Check, X,
  Clock,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  usePersonalStudies,
  useCreatePersonalStudy,
  useUpdatePersonalStudy,
  useDeletePersonalStudy,
  useWordStudies,
  useCreateWordStudy,
  useDeleteWordStudy,
  useNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useBibleStudySettings,
} from '../../hooks/use-bible-study'
import type { PersonalStudy, WordStudy, StudyNote } from '../../types'
import BibleChat from '../../components/bible-chat'
import BiblePassageSelector from '../../components/bible-passage-selector'
import { formatPassage } from '../../lib/bible-data'
import { DEFAULT_VERSION } from '../../lib/bible-versions'

type FieldErrors = Record<string, string>

// ── Study form ─────────────────────────────────────────────────────────────

interface StudyForm {
  title: string
  book: string
  chapter: number
  verse_start: number | null
  verse_end: number | null
  notes: string
  tags: string[]
  bible_version: string
}

const emptyForm = (version = DEFAULT_VERSION): StudyForm => ({
  title: '', book: '', chapter: 1, verse_start: null, verse_end: null,
  notes: '', tags: [], bible_version: version,
})

function validateStudyForm(form: StudyForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.title.trim()) errors.title = 'Title is required'
  if (!form.book.trim()) errors.book = 'Book is required'
  if (form.chapter < 1) errors.chapter = 'Chapter must be at least 1'
  return errors
}

// ── Word study form ────────────────────────────────────────────────────────

interface WordStudyForm {
  original_word: string
  transliteration: string
  language: 'hebrew' | 'greek'
  meaning: string
  context_notes: string
}

const emptyWordForm: WordStudyForm = {
  original_word: '', transliteration: '', language: 'hebrew', meaning: '', context_notes: '',
}

function validateWordForm(form: WordStudyForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.original_word.trim()) errors.original_word = 'Original word is required'
  if (!form.meaning.trim()) errors.meaning = 'Meaning is required'
  return errors
}

// ── Note form ──────────────────────────────────────────────────────────────

interface NoteForm {
  title: string
  content: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function inputClass(field: string, errs: FieldErrors) {
  return errs[field] ? 'border-red-500 focus-visible:ring-red-500' : ''
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

// ── NoteCard ───────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onSave,
  onDelete,
  isSaving,
}: {
  note: StudyNote
  onSave: (updated: StudyNote) => void
  onDelete: (note: StudyNote) => void
  isSaving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<NoteForm>({ title: note.title ?? '', content: note.content })
  const contentRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && contentRef.current) {
      contentRef.current.focus()
    }
  }, [editing])

  const handleSave = () => {
    onSave({ ...note, title: form.title.trim() || null, content: form.content } as StudyNote)
    setEditing(false)
  }

  const handleCancel = () => {
    setForm({ title: note.title ?? '', content: note.content })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="border rounded-lg p-3 space-y-2 bg-accent/30">
        <Input
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="Note title (optional)"
          className="text-sm"
        />
        <Textarea
          ref={contentRef}
          value={form.content}
          onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
          placeholder="Write your note..."
          rows={5}
          className="text-sm resize-none"
        />
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 px-2">
            <X className="w-3 h-3 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !form.content.trim()} className="h-7 px-2">
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-3 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {note.title && (
            <p className="text-sm font-medium mb-1 truncate">{note.title}</p>
          )}
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{note.content}</p>
          <p className="text-xs text-muted-foreground/60 mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {relativeTime(note.updated_at)}
          </p>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditing(true)}>
            <Edit2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-600" onClick={() => onDelete(note)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── NotesPanel ─────────────────────────────────────────────────────────────

function NotesPanel({
  book,
  chapter,
  verseStart,
  verseEnd,
  version,
}: {
  book: string
  chapter: number
  verseStart: number | null
  verseEnd: number | null
  version: string
}) {
  const { toast } = useToast()
  const { data: notes = [], isLoading } = useNotes(book, chapter, version)
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const [adding, setAdding] = useState(false)
  const [newForm, setNewForm] = useState<NoteForm>({ title: '', content: '' })
  const newContentRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (adding && newContentRef.current) newContentRef.current.focus()
  }, [adding])

  const passageRef = formatPassage(book, chapter, verseStart, verseEnd)

  const handleCreate = () => {
    if (!newForm.content.trim()) return
    createNote.mutate(
      {
        bible_version: version,
        book,
        chapter,
        verse_start: verseStart,
        verse_end: verseEnd,
        title: newForm.title.trim() || null,
        content: newForm.content.trim(),
      },
      {
        onSuccess: () => {
          setNewForm({ title: '', content: '' })
          setAdding(false)
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Failed to save note', description: err.message }),
      }
    )
  }

  const handleSave = (updated: StudyNote) => {
    updateNote.mutate(updated, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to update note', description: err.message }),
    })
  }

  const handleDelete = (note: StudyNote) => {
    deleteNote.mutate(note, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to delete note', description: err.message }),
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <StickyNote className="w-4 h-4" />
            Passage Notes
          </h3>
          <p className="text-xs text-muted-foreground">{passageRef} · {version}</p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="w-3 h-3 mr-1" /> Add Note
          </Button>
        )}
      </div>

      {adding && (
        <div className="border rounded-lg p-3 space-y-2 mb-3 bg-accent/30">
          <Input
            value={newForm.title}
            onChange={(e) => setNewForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Title (optional)"
            className="text-sm"
          />
          <Textarea
            ref={newContentRef}
            value={newForm.content}
            onChange={(e) => setNewForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="Write your note..."
            rows={4}
            className="text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setAdding(false); setNewForm({ title: '', content: '' }) }
            }}
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setAdding(false); setNewForm({ title: '', content: '' }) }}>
              <X className="w-3 h-3 mr-1" /> Cancel
            </Button>
            <Button size="sm" className="h-7 px-2" onClick={handleCreate} disabled={createNote.isPending || !newForm.content.trim()}>
              {createNote.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
          <StickyNote className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm text-muted-foreground">No notes for this passage yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add one to capture your thoughts.</p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-1">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onSave={handleSave}
              onDelete={handleDelete}
              isSaving={updateNote.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PersonalStudiesPage() {
  const { toast } = useToast()
  const { data: settings } = useBibleStudySettings()

  // Determine default version from user's preferred translations
  const preferredVersions = settings?.preferredTranslations ?? []
  const defaultVersion = preferredVersions.length > 0 ? preferredVersions[0] : DEFAULT_VERSION

  // ── Passage selector state ──
  const [selBook, setSelBook] = useState('')
  const [selChapter, setSelChapter] = useState<number | null>(null)
  const [selVerseStart, setSelVerseStart] = useState<number | null>(null)
  const [selVerseEnd, setSelVerseEnd] = useState<number | null>(null)
  const [selVersion, setSelVersion] = useState(defaultVersion)

  // Keep version in sync with user settings on first load
  useEffect(() => {
    if (preferredVersions.length > 0 && selVersion === DEFAULT_VERSION) {
      setSelVersion(preferredVersions[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredVersions.join(',')])

  // ── Study list state ──
  const [viewingStudy, setViewingStudy] = useState<PersonalStudy | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStudy, setEditingStudy] = useState<PersonalStudy | null>(null)
  const [form, setForm] = useState<StudyForm>(emptyForm(defaultVersion))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [tagInput, setTagInput] = useState('')

  // ── Word study state ──
  const [wordDialogOpen, setWordDialogOpen] = useState(false)
  const [wordForm, setWordForm] = useState<WordStudyForm>(emptyWordForm)
  const [wordErrors, setWordErrors] = useState<FieldErrors>({})

  // ── Queries ──
  const { data: studies = [], isLoading } = usePersonalStudies(selBook || undefined)
  const createStudy = useCreatePersonalStudy()
  const updateStudy = useUpdatePersonalStudy()
  const deleteStudy = useDeletePersonalStudy()
  const { data: wordStudies = [] } = useWordStudies(viewingStudy?.id || '')
  const createWordStudy = useCreateWordStudy()
  const deleteWordStudy = useDeleteWordStudy()

  // ── Form helpers ──
  const updateField = (field: keyof StudyForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
  }

  const updateWordField = (field: keyof WordStudyForm, value: any) => {
    setWordForm((prev) => ({ ...prev, [field]: value }))
    if (wordErrors[field]) setWordErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
  }

  // ── Study CRUD ──
  const openCreate = () => {
    setEditingStudy(null)
    setForm({
      ...emptyForm(selVersion),
      book: selBook,
      chapter: selChapter ?? 1,
      verse_start: selVerseStart,
      verse_end: selVerseEnd,
      bible_version: selVersion,
    })
    setErrors({})
    setTagInput('')
    setDialogOpen(true)
  }

  const openEdit = (study: PersonalStudy) => {
    setEditingStudy(study)
    setForm({
      title: study.title,
      book: study.book,
      chapter: study.chapter,
      verse_start: study.verse_start,
      verse_end: study.verse_end,
      notes: study.notes || '',
      tags: study.tags || [],
      bible_version: (study as any).bible_version ?? selVersion,
    })
    setErrors({})
    setTagInput('')
    setDialogOpen(true)
  }

  const addTag = () => {
    const tag = tagInput.trim()
    if (tag && !form.tags.includes(tag)) {
      updateField('tags', [...form.tags, tag])
      setTagInput('')
    }
  }

  const handleSaveStudy = () => {
    const fieldErrors = validateStudyForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    const payload = { ...form, notes: form.notes || null }

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

  const handleDeleteStudy = (id: string) => {
    if (viewingStudy?.id === id) setViewingStudy(null)
    deleteStudy.mutate(id, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to delete', description: err.message }),
    })
  }

  // ── Word CRUD ──
  const openWordDialog = () => {
    setWordForm(emptyWordForm)
    setWordErrors({})
    setWordDialogOpen(true)
  }

  const handleSaveWord = () => {
    const fieldErrors = validateWordForm(wordForm)
    setWordErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0 || !viewingStudy) return
    createWordStudy.mutate({
      study_id: viewingStudy.id,
      original_word: wordForm.original_word,
      transliteration: wordForm.transliteration || null,
      language: wordForm.language,
      meaning: wordForm.meaning,
      context_notes: wordForm.context_notes || null,
    }, {
      onSuccess: () => setWordDialogOpen(false),
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to add word study', description: err.message }),
    })
  }

  const handleDeleteWord = (ws: WordStudy) => {
    deleteWordStudy.mutate({ id: ws.id, studyId: ws.study_id }, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to delete', description: err.message }),
    })
  }

  // ── Study context for chat ──
  const studyContext = viewingStudy ? {
    type: 'personal' as const,
    studyId: viewingStudy.id,
    title: viewingStudy.title,
    book: viewingStudy.book,
    chapter: viewingStudy.chapter,
  } : null

  // ── Filter studies by passage ──
  const filteredStudies = studies.filter((s) => {
    if (selChapter != null && s.chapter !== selChapter) return false
    return true
  })

  // ── Study detail view ──────────────────────────────────────────────────────
  if (viewingStudy) {
    const studyVersion = (viewingStudy as any).bible_version ?? selVersion
    const passageRef = formatPassage(
      viewingStudy.book, viewingStudy.chapter,
      viewingStudy.verse_start, viewingStudy.verse_end
    )

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b flex items-start gap-3 flex-wrap">
          <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setViewingStudy(null)}>
            ← Back
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold truncate">{viewingStudy.title}</h1>
              <Badge variant="secondary" className="text-xs shrink-0">{studyVersion}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{passageRef}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => openEdit(viewingStudy)}>
              <Edit2 className="w-4 h-4 mr-1" /> Edit
            </Button>
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteStudy(viewingStudy.id)}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </div>
        </div>

        {/* Two-column workspace */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Study content */}
          <div className="flex-1 overflow-y-auto p-6 min-w-0">
            <Tabs defaultValue="study" className="h-full">
              <TabsList className="mb-4">
                <TabsTrigger value="study" className="gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Study Notes
                </TabsTrigger>
                <TabsTrigger value="words" className="gap-1.5">
                  <Languages className="w-3.5 h-3.5" /> Hebrew &amp; Greek
                  {wordStudies.length > 0 && (
                    <Badge variant="secondary" className="text-xs ml-1 h-4 min-w-[16px] px-1">
                      {wordStudies.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Study notes tab */}
              <TabsContent value="study" className="mt-0 space-y-4">
                {viewingStudy.tags && viewingStudy.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {viewingStudy.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}

                <Card>
                  <CardContent className="pt-4">
                    {viewingStudy.notes ? (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{viewingStudy.notes}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No notes yet. Edit this study to add notes.</p>
                    )}
                  </CardContent>
                </Card>

                <div className="text-xs text-muted-foreground">
                  Created {new Date(viewingStudy.created_at).toLocaleDateString()} · Updated {relativeTime(viewingStudy.updated_at)}
                </div>
              </TabsContent>

              {/* Word studies tab */}
              <TabsContent value="words" className="mt-0 space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={openWordDialog}>
                    <Plus className="w-4 h-4 mr-1" /> Add Word
                  </Button>
                </div>

                {wordStudies.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center">
                      <Languages className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm text-muted-foreground">No word studies yet.</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Add Hebrew and Greek words to deepen your analysis.</p>
                    </CardContent>
                  </Card>
                ) : (
                  wordStudies.map((ws) => (
                    <div key={ws.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-semibold">{ws.original_word}</span>
                            {ws.transliteration && (
                              <span className="text-sm italic text-muted-foreground">({ws.transliteration})</span>
                            )}
                            <Badge variant="outline" className="text-xs capitalize">{ws.language}</Badge>
                          </div>
                          <p className="text-sm mb-1"><strong>Meaning:</strong> {ws.meaning}</p>
                          {ws.context_notes && (
                            <p className="text-sm text-muted-foreground">{ws.context_notes}</p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDeleteWord(ws)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Notes panel */}
          <div className="w-[340px] shrink-0 border-l overflow-y-auto p-5 flex flex-col">
            <NotesPanel
              book={viewingStudy.book}
              chapter={viewingStudy.chapter}
              verseStart={viewingStudy.verse_start}
              verseEnd={viewingStudy.verse_end}
              version={studyVersion}
            />
          </div>
        </div>

        {/* Word study dialog */}
        <Dialog open={wordDialogOpen} onOpenChange={setWordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Word Study</DialogTitle>
              <DialogDescription>Hebrew or Greek word analysis</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Original Word *</Label>
                <Input
                  className={inputClass('original_word', wordErrors)}
                  value={wordForm.original_word}
                  onChange={(e) => updateWordField('original_word', e.target.value)}
                  placeholder="e.g., ἀγάπη"
                />
                {wordErrors.original_word && <p className="text-xs text-red-500">{wordErrors.original_word}</p>}
              </div>
              <div className="space-y-2">
                <Label>Transliteration</Label>
                <Input value={wordForm.transliteration} onChange={(e) => updateWordField('transliteration', e.target.value)} placeholder="e.g., agape" />
              </div>
              <div className="space-y-2">
                <Label>Language *</Label>
                <Select value={wordForm.language} onValueChange={(v) => updateWordField('language', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hebrew">Hebrew</SelectItem>
                    <SelectItem value="greek">Greek</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Meaning *</Label>
                <Textarea className={inputClass('meaning', wordErrors)} value={wordForm.meaning} onChange={(e) => updateWordField('meaning', e.target.value)} placeholder="Definition and significance..." rows={3} />
                {wordErrors.meaning && <p className="text-xs text-red-500">{wordErrors.meaning}</p>}
              </div>
              <div className="space-y-2">
                <Label>Context Notes</Label>
                <Textarea value={wordForm.context_notes} onChange={(e) => updateWordField('context_notes', e.target.value)} placeholder="How this word is used in context..." rows={2} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setWordDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveWord} disabled={createWordStudy.isPending}>
                  {createWordStudy.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Add Word Study
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <BibleChat studyContext={studyContext} />
      </div>
    )
  }

  // ── Browse / list view ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="px-6 pt-5 pb-4 border-b space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Personal Bible Studies</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Deep-dive scripture analysis with Hebrew &amp; Greek</p>
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="w-4 h-4 mr-2" /> New Study
          </Button>
        </div>

        {/* Passage selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <BiblePassageSelector
            book={selBook}
            chapter={selChapter}
            verseStart={selVerseStart}
            verseEnd={selVerseEnd}
            version={selVersion}
            onBookChange={setSelBook}
            onChapterChange={setSelChapter}
            onVerseStartChange={setSelVerseStart}
            onVerseEndChange={setSelVerseEnd}
            onVersionChange={setSelVersion}
            compact
            showVersion={true}
          />
          {(selBook || selChapter) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setSelBook('')
                setSelChapter(null)
                setSelVerseStart(null)
                setSelVerseEnd(null)
              }}
            >
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Active filter label */}
        {selBook && (
          <p className="text-xs text-muted-foreground">
            Showing studies in{' '}
            <span className="font-medium text-foreground">
              {formatPassage(selBook, selChapter ?? 1, selChapter ? selVerseStart : null, selChapter ? selVerseEnd : null) || selBook}
            </span>
          </p>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Studies list */}
        <div className={`flex-1 overflow-y-auto p-6 ${selBook && selChapter ? 'max-w-[60%]' : ''}`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredStudies.length === 0 ? (
            <Card>
              <CardContent className="text-center py-14">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                {selBook ? (
                  <>
                    <p className="font-medium">No studies for this passage yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create one using the &ldquo;New Study&rdquo; button above.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">No personal studies yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select a passage above and create your first deep-dive study.
                    </p>
                  </>
                )}
                <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-1" /> New Study
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredStudies.map((study) => (
                <Card
                  key={study.id}
                  className="hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => setViewingStudy(study)}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-medium truncate">{study.title}</p>
                        {(study as any).bible_version && (
                          <Badge variant="outline" className="text-xs shrink-0">{(study as any).bible_version}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatPassage(study.book, study.chapter, study.verse_start, study.verse_end)}
                        {' · '}
                        {new Date(study.created_at).toLocaleDateString()}
                      </p>
                      {study.tags && study.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {study.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                          ))}
                          {study.tags.length > 4 && (
                            <Badge variant="secondary" className="text-xs">+{study.tags.length - 4}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(study)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteStudy(study.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right: notes panel — only when a passage is selected */}
        {selBook && selChapter != null && (
          <div className="w-[340px] shrink-0 border-l overflow-y-auto p-5 flex flex-col">
            <NotesPanel
              book={selBook}
              chapter={selChapter}
              verseStart={selVerseStart}
              verseEnd={selVerseEnd}
              version={selVersion}
            />
          </div>
        )}
      </div>

      {/* Create / edit study dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStudy ? 'Edit Study' : 'New Personal Study'}</DialogTitle>
            <DialogDescription>Deep-dive into scripture</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                className={inputClass('title', errors)}
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="e.g., The Mystery of Melchizedek"
              />
              {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label>Passage *</Label>
              <BiblePassageSelector
                book={form.book}
                chapter={form.chapter}
                verseStart={form.verse_start}
                verseEnd={form.verse_end}
                version={form.bible_version}
                onBookChange={(v) => updateField('book', v)}
                onChapterChange={(v) => updateField('chapter', v ?? 1)}
                onVerseStartChange={(v) => updateField('verse_start', v)}
                onVerseEndChange={(v) => updateField('verse_end', v)}
                onVersionChange={(v) => updateField('bible_version', v)}
                showVersion={true}
              />
              {errors.book && <p className="text-xs text-red-500">{errors.book}</p>}
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Your insights, observations, and reflections..."
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addTag}>Add</Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {form.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => updateField('tags', form.tags.filter((t) => t !== tag))}
                    >
                      {tag} &times;
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveStudy} disabled={createStudy.isPending || updateStudy.isPending}>
                {(createStudy.isPending || updateStudy.isPending) && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
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
