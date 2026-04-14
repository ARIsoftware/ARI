export interface KidsStudy {
  id: string
  user_id: string
  title: string
  book: string
  chapter: number
  verse_start: number | null
  verse_end: number | null
  key_lesson: string | null
  discussion_questions: string[]
  memory_verse: string | null
  notes_age_8: string | null
  notes_age_6: string | null
  notes_age_3: string | null
  created_at: string
  updated_at: string
}

export interface PersonalStudy {
  id: string
  user_id: string
  title: string
  book: string
  chapter: number
  verse_start: number | null
  verse_end: number | null
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

export interface WordStudy {
  id: string
  user_id: string
  study_id: string
  original_word: string
  transliteration: string | null
  language: 'hebrew' | 'greek'
  meaning: string
  context_notes: string | null
  created_at: string
}

export interface ChatMessage {
  id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  study_context: StudyContext | null
  created_at: string
}

export interface StudyContext {
  type: 'kids' | 'personal'
  studyId: string
  title: string
  book: string
  chapter: number
}

export interface KidInfo {
  name: string
  age: number
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: string
  user_id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface StudyNote {
  id: string
  user_id: string
  bible_version: string
  book: string
  chapter: number
  verse_start: number | null
  verse_end: number | null
  title: string | null
  content: string
  created_at: string
  updated_at: string
}

export interface BibleVersion {
  id: string
  code: string
  name: string
  language: string
  publisher: string | null
  is_active: boolean
  source_type: 'public_domain' | 'licensed' | 'api_reference'
  source_reference: string | null
  notes: string | null
}

export interface PassageSelection {
  book: string
  chapter: number | null
  verseStart: number | null
  verseEnd: number | null
  version: string
}

export interface BibleStudySettings {
  onboardingCompleted: boolean
  kids: KidInfo[]
  preferredTranslations: string[]
  openrouterApiKey: string
  openrouterModel: string
}
