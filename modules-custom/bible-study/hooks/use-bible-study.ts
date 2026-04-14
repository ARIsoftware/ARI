import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { KidsStudy, PersonalStudy, WordStudy, ChatMessage, BibleStudySettings, Conversation, ConversationMessage, StudyNote } from '../types'

const KIDS_KEY = ['bible-study-kids']
const PERSONAL_KEY = ['bible-study-personal']
const SETTINGS_KEY = ['bible-study-settings']
const CHAT_KEY = ['bible-study-chat']

// ── Settings ──

export function useBibleStudySettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<BibleStudySettings>> => {
      const res = await fetch('/api/modules/bible-study/settings')
      if (!res.ok) return {}
      return await res.json()
    },
  })
}

export function useUpdateBibleStudySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<BibleStudySettings>): Promise<void> => {
      const res = await fetch('/api/modules/bible-study/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save settings')
      }
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<BibleStudySettings>>(SETTINGS_KEY)
      queryClient.setQueryData<Partial<BibleStudySettings>>(SETTINGS_KEY, (old = {}) => ({
        ...old,
        ...newSettings,
      }))
      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) queryClient.setQueryData(SETTINGS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}

// ── Kids Studies ──

export function useKidsStudies(bookFilter?: string) {
  return useQuery({
    queryKey: [...KIDS_KEY, bookFilter],
    queryFn: async (): Promise<KidsStudy[]> => {
      const params = new URLSearchParams()
      if (bookFilter) params.set('book', bookFilter)
      const res = await fetch(`/api/modules/bible-study/kids-studies?${params}`)
      if (!res.ok) throw new Error('Failed to fetch kids studies')
      const data = await res.json()
      return data.studies || []
    },
  })
}

export function useCreateKidsStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (study: Omit<KidsStudy, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<KidsStudy> => {
      const res = await fetch('/api/modules/bible-study/kids-studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(study),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: any) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to create study')
      }
      const data = await res.json()
      return data.study
    },
    onMutate: async (newStudy) => {
      await queryClient.cancelQueries({ queryKey: KIDS_KEY })
      const previous = queryClient.getQueryData<KidsStudy[]>(KIDS_KEY)
      queryClient.setQueryData<KidsStudy[]>([...KIDS_KEY, undefined], (old = []) => [
        { id: 'temp-' + Date.now(), user_id: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...newStudy } as KidsStudy,
        ...old,
      ])
      return { previous }
    },
    onError: (_err, _newStudy, context) => {
      if (context?.previous) queryClient.setQueryData([...KIDS_KEY, undefined], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KIDS_KEY })
    },
  })
}

export function useUpdateKidsStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (study: Omit<KidsStudy, 'user_id' | 'created_at' | 'updated_at'> & { id: string }): Promise<KidsStudy> => {
      const res = await fetch('/api/modules/bible-study/kids-studies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(study),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: any) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to update study')
      }
      const data = await res.json()
      return data.study
    },
    onMutate: async (updatedStudy) => {
      await queryClient.cancelQueries({ queryKey: KIDS_KEY })
      const previous = queryClient.getQueryData<KidsStudy[]>([...KIDS_KEY, undefined])
      queryClient.setQueryData<KidsStudy[]>([...KIDS_KEY, undefined], (old = []) =>
        old.map((s) => s.id === updatedStudy.id ? { ...s, ...updatedStudy } : s)
      )
      return { previous }
    },
    onError: (_err, _updatedStudy, context) => {
      if (context?.previous) queryClient.setQueryData([...KIDS_KEY, undefined], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KIDS_KEY })
    },
  })
}

export function useDeleteKidsStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/bible-study/kids-studies?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete study')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: KIDS_KEY })
      const previous = queryClient.getQueryData<KidsStudy[]>([...KIDS_KEY, undefined])
      queryClient.setQueryData<KidsStudy[]>([...KIDS_KEY, undefined], (old = []) => old.filter(s => s.id !== deletedId))
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData([...KIDS_KEY, undefined], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KIDS_KEY })
    },
  })
}

// ── Personal Studies ──

export function usePersonalStudies(bookFilter?: string) {
  return useQuery({
    queryKey: [...PERSONAL_KEY, bookFilter],
    queryFn: async (): Promise<PersonalStudy[]> => {
      const params = new URLSearchParams()
      if (bookFilter) params.set('book', bookFilter)
      const res = await fetch(`/api/modules/bible-study/personal-studies?${params}`)
      if (!res.ok) throw new Error('Failed to fetch personal studies')
      const data = await res.json()
      return data.studies || []
    },
  })
}

export function useCreatePersonalStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (study: Omit<PersonalStudy, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<PersonalStudy> => {
      const res = await fetch('/api/modules/bible-study/personal-studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(study),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: any) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to create study')
      }
      const data = await res.json()
      return data.study
    },
    onMutate: async (newStudy) => {
      await queryClient.cancelQueries({ queryKey: PERSONAL_KEY })
      const previous = queryClient.getQueryData<PersonalStudy[]>([...PERSONAL_KEY, undefined])
      queryClient.setQueryData<PersonalStudy[]>([...PERSONAL_KEY, undefined], (old = []) => [
        { id: 'temp-' + Date.now(), user_id: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...newStudy } as PersonalStudy,
        ...old,
      ])
      return { previous }
    },
    onError: (_err, _newStudy, context) => {
      if (context?.previous) queryClient.setQueryData([...PERSONAL_KEY, undefined], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PERSONAL_KEY })
    },
  })
}

export function useUpdatePersonalStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (study: Omit<PersonalStudy, 'user_id' | 'created_at' | 'updated_at'> & { id: string }): Promise<PersonalStudy> => {
      const res = await fetch('/api/modules/bible-study/personal-studies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(study),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: any) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to update study')
      }
      const data = await res.json()
      return data.study
    },
    onMutate: async (updatedStudy) => {
      await queryClient.cancelQueries({ queryKey: PERSONAL_KEY })
      const previous = queryClient.getQueryData<PersonalStudy[]>([...PERSONAL_KEY, undefined])
      queryClient.setQueryData<PersonalStudy[]>([...PERSONAL_KEY, undefined], (old = []) =>
        old.map((s) => s.id === updatedStudy.id ? { ...s, ...updatedStudy } : s)
      )
      return { previous }
    },
    onError: (_err, _updatedStudy, context) => {
      if (context?.previous) queryClient.setQueryData([...PERSONAL_KEY, undefined], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PERSONAL_KEY })
    },
  })
}

export function useDeletePersonalStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/bible-study/personal-studies?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete study')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: PERSONAL_KEY })
      const previous = queryClient.getQueryData<PersonalStudy[]>([...PERSONAL_KEY, undefined])
      queryClient.setQueryData<PersonalStudy[]>([...PERSONAL_KEY, undefined], (old = []) => old.filter(s => s.id !== deletedId))
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData([...PERSONAL_KEY, undefined], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PERSONAL_KEY })
    },
  })
}

// ── Word Studies ──

export function useWordStudies(studyId: string) {
  return useQuery({
    queryKey: ['bible-study-word-studies', studyId],
    queryFn: async (): Promise<WordStudy[]> => {
      const res = await fetch(`/api/modules/bible-study/word-studies?study_id=${encodeURIComponent(studyId)}`)
      if (!res.ok) throw new Error('Failed to fetch word studies')
      const data = await res.json()
      return data.word_studies || []
    },
    enabled: !!studyId,
  })
}

export function useCreateWordStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (wordStudy: Omit<WordStudy, 'id' | 'user_id' | 'created_at'>): Promise<WordStudy> => {
      const res = await fetch('/api/modules/bible-study/word-studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wordStudy),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: any) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to create word study')
      }
      const data = await res.json()
      return data.word_study
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bible-study-word-studies', variables.study_id] })
    },
  })
}

export function useDeleteWordStudy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, studyId }: { id: string; studyId: string }): Promise<void> => {
      const res = await fetch(`/api/modules/bible-study/word-studies?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete word study')
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bible-study-word-studies', variables.studyId] })
    },
  })
}

// ── Chat ──

export function useChatMessages() {
  return useQuery({
    queryKey: CHAT_KEY,
    queryFn: async (): Promise<ChatMessage[]> => {
      const res = await fetch('/api/modules/bible-study/chat')
      if (!res.ok) return []
      const data = await res.json()
      return data.messages || []
    },
  })
}

export function useSendChatMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { message: string; study_context?: { type: 'kids' | 'personal'; studyId: string; title: string; book: string; chapter: number } | null }): Promise<{ user_message: ChatMessage; assistant_message: ChatMessage }> => {
      const res = await fetch('/api/modules/bible-study/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send message')
      }
      return await res.json()
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: CHAT_KEY })
      const previous = queryClient.getQueryData<ChatMessage[]>(CHAT_KEY)
      queryClient.setQueryData<ChatMessage[]>(CHAT_KEY, (old = []) => [
        ...old,
        {
          id: 'temp-user-' + Date.now(),
          user_id: '',
          role: 'user' as const,
          content: payload.message,
          study_context: payload.study_context ?? null,
          created_at: new Date().toISOString(),
        },
      ])
      return { previous }
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) queryClient.setQueryData(CHAT_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_KEY })
    },
  })
}

export function useClearChat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch('/api/modules/bible-study/chat', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to clear chat')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_KEY })
    },
  })
}

// ── Conversations ──

const CONVERSATIONS_KEY = ['bible-study-conversations']

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: async (): Promise<Conversation[]> => {
      const res = await fetch('/api/modules/bible-study/conversations')
      if (!res.ok) throw new Error('Failed to fetch conversations')
      const data = await res.json()
      return data.conversations || []
    },
  })
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ['bible-study-conversation', id],
    queryFn: async (): Promise<{ conversation: Conversation; messages: ConversationMessage[] }> => {
      const res = await fetch(`/api/modules/bible-study/conversations/${id}`)
      if (!res.ok) throw new Error('Failed to load conversation')
      return await res.json()
    },
    enabled: !!id,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (title?: string): Promise<Conversation> => {
      const res = await fetch('/api/modules/bible-study/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create conversation')
      }
      const data = await res.json()
      return data.conversation
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useRenameConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }): Promise<Conversation> => {
      const res = await fetch(`/api/modules/bible-study/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to rename conversation')
      }
      const data = await res.json()
      return data.conversation
    },
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY })
      const previous = queryClient.getQueryData<Conversation[]>(CONVERSATIONS_KEY)
      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_KEY, (old = []) =>
        old.map((c) => c.id === id ? { ...c, title } : c)
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(CONVERSATIONS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/bible-study/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete conversation')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY })
      const previous = queryClient.getQueryData<Conversation[]>(CONVERSATIONS_KEY)
      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_KEY, (old = []) =>
        old.filter((c) => c.id !== deletedId)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(CONVERSATIONS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useSendConversationMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      message,
    }: {
      conversationId: string
      message: string
    }): Promise<{ user_message: ConversationMessage; assistant_message: ConversationMessage; updated_title: string | null }> => {
      const res = await fetch(`/api/modules/bible-study/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send message')
      }
      return await res.json()
    },
    onSuccess: (data, variables) => {
      // Update message cache for this conversation
      queryClient.setQueryData(
        ['bible-study-conversation', variables.conversationId],
        (old: { conversation: Conversation; messages: ConversationMessage[] } | undefined) => {
          if (!old) return old
          const newConversation = data.updated_title
            ? { ...old.conversation, title: data.updated_title }
            : old.conversation
          return {
            conversation: newConversation,
            messages: [...old.messages, data.user_message, data.assistant_message],
          }
        }
      )
      // Refresh conversation list so title + updated_at are current
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

// ── Study Notes ──

function notesKey(book?: string, chapter?: number, version?: string) {
  return ['bible-study-notes', book ?? '', chapter ?? '', version ?? '']
}

export function useNotes(book?: string, chapter?: number, version?: string) {
  return useQuery({
    queryKey: notesKey(book, chapter, version),
    queryFn: async (): Promise<StudyNote[]> => {
      const params = new URLSearchParams()
      if (book) params.set('book', book)
      if (chapter) params.set('chapter', String(chapter))
      if (version) params.set('bible_version', version)
      const res = await fetch(`/api/modules/bible-study/notes?${params}`)
      if (!res.ok) throw new Error('Failed to fetch notes')
      const data = await res.json()
      return data.notes || []
    },
    enabled: !!book,
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (note: Omit<StudyNote, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<StudyNote> => {
      const res = await fetch('/api/modules/bible-study/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create note')
      }
      const data = await res.json()
      return data.note
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: notesKey(variables.book, variables.chapter ?? undefined, variables.bible_version),
      })
    },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (note: StudyNote): Promise<StudyNote> => {
      const res = await fetch('/api/modules/bible-study/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update note')
      }
      const data = await res.json()
      return data.note
    },
    onMutate: async (updatedNote) => {
      const key = notesKey(updatedNote.book, updatedNote.chapter, updatedNote.bible_version)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<StudyNote[]>(key)
      queryClient.setQueryData<StudyNote[]>(key, (old = []) =>
        old.map((n) => n.id === updatedNote.id ? { ...n, ...updatedNote } : n)
      )
      return { previous, key }
    },
    onError: (_err, _note, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: notesKey(variables.book, variables.chapter, variables.bible_version),
      })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (note: StudyNote): Promise<void> => {
      const res = await fetch(`/api/modules/bible-study/notes?id=${encodeURIComponent(note.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete note')
      }
    },
    onMutate: async (deletedNote) => {
      const key = notesKey(deletedNote.book, deletedNote.chapter, deletedNote.bible_version)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<StudyNote[]>(key)
      queryClient.setQueryData<StudyNote[]>(key, (old = []) => old.filter((n) => n.id !== deletedNote.id))
      return { previous, key }
    },
    onError: (_err, _note, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: notesKey(variables.book, variables.chapter, variables.bible_version),
      })
    },
  })
}
