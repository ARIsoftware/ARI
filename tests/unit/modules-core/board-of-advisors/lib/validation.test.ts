import { describe, it, expect } from 'vitest'
import {
  createAdvisorSchema,
  updateAdvisorSchema,
  reorderAdvisorsSchema,
  TtsRequestSchema,
  BoardAdvisorSchema,
  AdvisorListResponseSchema,
  AdvisorSingleResponseSchema,
  createConversationSchema,
  renameConversationSchema,
  BoardConversationSchema,
  boardListQuerySchema,
  ConversationListResponseSchema,
  BoardMessageSchema,
  ConversationDetailResponseSchema,
  ConversationSingleResponseSchema,
  askBoardSchema,
  conversationIdParamSchema,
  advisorIdParamSchema,
  ProviderStatusResponseSchema,
  BoardSettingsSchema,
  SettingsSavedSchema,
  DeleteResponseSchema,
} from '@/modules-core/board-of-advisors/lib/validation'
import {
  ADVISOR_NAME_MAX,
  ADVISOR_DESCRIPTION_MAX,
  CONVERSATION_TITLE_MAX,
  QUESTION_MAX,
} from '@/modules-core/board-of-advisors/lib/limits'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

// ─── createAdvisorSchema ──────────────────────────────────────────────────────

describe('createAdvisorSchema', () => {
  it('accepts valid name and description', () => {
    expect(createAdvisorSchema.safeParse({ name: 'Advisor One', description: 'Smart strategist' }).success).toBe(true)
  })

  it('trims name whitespace', () => {
    const result = createAdvisorSchema.parse({ name: '  Ada  ', description: 'desc' })
    expect(result.name).toBe('Ada')
  })

  it('rejects empty name', () => {
    expect(createAdvisorSchema.safeParse({ name: '', description: 'desc' }).success).toBe(false)
  })

  it('rejects name exceeding max length', () => {
    expect(createAdvisorSchema.safeParse({ name: 'a'.repeat(ADVISOR_NAME_MAX + 1), description: 'desc' }).success).toBe(false)
  })

  it('accepts name at exactly max length', () => {
    expect(createAdvisorSchema.safeParse({ name: 'a'.repeat(ADVISOR_NAME_MAX), description: 'desc' }).success).toBe(true)
  })

  it('rejects empty description', () => {
    expect(createAdvisorSchema.safeParse({ name: 'Ada', description: '' }).success).toBe(false)
  })

  it('rejects description exceeding max length', () => {
    expect(createAdvisorSchema.safeParse({ name: 'Ada', description: 'x'.repeat(ADVISOR_DESCRIPTION_MAX + 1) }).success).toBe(false)
  })

  it('accepts description at exactly max length', () => {
    expect(createAdvisorSchema.safeParse({ name: 'Ada', description: 'x'.repeat(ADVISOR_DESCRIPTION_MAX) }).success).toBe(true)
  })

  it('rejects missing name', () => {
    expect(createAdvisorSchema.safeParse({ description: 'desc' }).success).toBe(false)
  })

  it('rejects missing description', () => {
    expect(createAdvisorSchema.safeParse({ name: 'Ada' }).success).toBe(false)
  })
})

// ─── updateAdvisorSchema ──────────────────────────────────────────────────────

describe('updateAdvisorSchema', () => {
  it('accepts only name', () => {
    expect(updateAdvisorSchema.safeParse({ name: 'New Name' }).success).toBe(true)
  })

  it('accepts only description', () => {
    expect(updateAdvisorSchema.safeParse({ description: 'New desc' }).success).toBe(true)
  })

  it('accepts both name and description', () => {
    expect(updateAdvisorSchema.safeParse({ name: 'N', description: 'D' }).success).toBe(true)
  })

  it('rejects empty object (refine: at least one field)', () => {
    expect(updateAdvisorSchema.safeParse({}).success).toBe(false)
  })

  it('rejects name exceeding max length', () => {
    expect(updateAdvisorSchema.safeParse({ name: 'a'.repeat(ADVISOR_NAME_MAX + 1) }).success).toBe(false)
  })

  it('rejects description exceeding max length', () => {
    expect(updateAdvisorSchema.safeParse({ description: 'x'.repeat(ADVISOR_DESCRIPTION_MAX + 1) }).success).toBe(false)
  })

  it('rejects empty name string', () => {
    expect(updateAdvisorSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects empty description string', () => {
    expect(updateAdvisorSchema.safeParse({ description: '' }).success).toBe(false)
  })

  it('accepts only sex (refine counts voice fields)', () => {
    expect(updateAdvisorSchema.safeParse({ sex: 'male' }).success).toBe(true)
  })

  it('accepts only voice_id, including null (auto)', () => {
    expect(updateAdvisorSchema.safeParse({ voice_id: 'v1' }).success).toBe(true)
    expect(updateAdvisorSchema.safeParse({ voice_id: null }).success).toBe(true)
  })

  it('rejects invalid sex value', () => {
    expect(updateAdvisorSchema.safeParse({ sex: 'robot' }).success).toBe(false)
  })

  it('rejects empty or over-long voice_id', () => {
    expect(updateAdvisorSchema.safeParse({ voice_id: '' }).success).toBe(false)
    expect(updateAdvisorSchema.safeParse({ voice_id: 'x'.repeat(101) }).success).toBe(false)
  })
})

// ─── createAdvisorSchema voice fields ─────────────────────────────────────────

describe('createAdvisorSchema voice fields', () => {
  const base = { name: 'Ada', description: 'desc' }

  it('accepts optional sex and voice_id', () => {
    expect(createAdvisorSchema.safeParse({ ...base, sex: 'female', voice_id: 'v1' }).success).toBe(true)
    expect(createAdvisorSchema.safeParse({ ...base, voice_id: null }).success).toBe(true)
  })

  it('rejects invalid sex', () => {
    expect(createAdvisorSchema.safeParse({ ...base, sex: 'unknown' }).success).toBe(false)
  })

  it('rejects voice_id at 101 chars, accepts at 100', () => {
    expect(createAdvisorSchema.safeParse({ ...base, voice_id: 'x'.repeat(100) }).success).toBe(true)
    expect(createAdvisorSchema.safeParse({ ...base, voice_id: 'x'.repeat(101) }).success).toBe(false)
  })
})

// ─── TtsRequestSchema ─────────────────────────────────────────────────────────

describe('TtsRequestSchema', () => {
  it('accepts text with optional advisorId (uuid or null)', () => {
    expect(TtsRequestSchema.safeParse({ text: 'Hello' }).success).toBe(true)
    expect(TtsRequestSchema.safeParse({ text: 'Hello', advisorId: VALID_UUID }).success).toBe(true)
    expect(TtsRequestSchema.safeParse({ text: 'Hello', advisorId: null }).success).toBe(true)
  })

  it('rejects empty text and text over 20000 chars', () => {
    expect(TtsRequestSchema.safeParse({ text: '' }).success).toBe(false)
    expect(TtsRequestSchema.safeParse({ text: 'x'.repeat(20001) }).success).toBe(false)
  })

  it('accepts text at exactly 20000 chars', () => {
    expect(TtsRequestSchema.safeParse({ text: 'x'.repeat(20000) }).success).toBe(true)
  })

  it('rejects non-UUID advisorId', () => {
    expect(TtsRequestSchema.safeParse({ text: 'Hi', advisorId: 'nope' }).success).toBe(false)
  })

  it('rejects unknown keys (strict)', () => {
    expect(TtsRequestSchema.safeParse({ text: 'Hi', voice: 'v' }).success).toBe(false)
  })
})

// ─── reorderAdvisorsSchema ────────────────────────────────────────────────────

describe('reorderAdvisorsSchema', () => {
  it('accepts a list with one valid UUID', () => {
    expect(reorderAdvisorsSchema.safeParse({ order: [VALID_UUID] }).success).toBe(true)
  })

  it('accepts up to 100 UUIDs', () => {
    const order = Array.from({ length: 100 }, () => VALID_UUID)
    expect(reorderAdvisorsSchema.safeParse({ order }).success).toBe(true)
  })

  it('rejects more than 100 UUIDs', () => {
    const order = Array.from({ length: 101 }, () => VALID_UUID)
    expect(reorderAdvisorsSchema.safeParse({ order }).success).toBe(false)
  })

  it('rejects empty array', () => {
    expect(reorderAdvisorsSchema.safeParse({ order: [] }).success).toBe(false)
  })

  it('rejects non-UUID in order', () => {
    expect(reorderAdvisorsSchema.safeParse({ order: ['not-a-uuid'] }).success).toBe(false)
  })
})

// ─── BoardAdvisorSchema ───────────────────────────────────────────────────────

describe('BoardAdvisorSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    name: 'Advisor',
    description: 'desc',
    color: '#ff0000',
    sort_order: 0,
    sex: 'not_specified',
    voice_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid advisor', () => {
    expect(BoardAdvisorSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(BoardAdvisorSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })

  it('rejects non-integer sort_order', () => {
    expect(BoardAdvisorSchema.safeParse({ ...valid, sort_order: 1.5 }).success).toBe(false)
  })

  it('accepts explicit voice_id and each sex value', () => {
    for (const sex of ['male', 'female', 'not_specified']) {
      expect(BoardAdvisorSchema.safeParse({ ...valid, sex, voice_id: 'v1' }).success).toBe(true)
    }
  })

  it('rejects unknown sex value', () => {
    expect(BoardAdvisorSchema.safeParse({ ...valid, sex: 'other' }).success).toBe(false)
  })

  it('rejects missing sex/voice_id fields', () => {
    const { sex: _s, voice_id: _v, ...withoutVoice } = valid
    expect(BoardAdvisorSchema.safeParse(withoutVoice).success).toBe(false)
  })
})

// ─── AdvisorListResponseSchema ────────────────────────────────────────────────

describe('AdvisorListResponseSchema', () => {
  it('accepts empty advisors array', () => {
    expect(AdvisorListResponseSchema.safeParse({ advisors: [] }).success).toBe(true)
  })
})

// ─── AdvisorSingleResponseSchema ──────────────────────────────────────────────

describe('AdvisorSingleResponseSchema', () => {
  it('accepts valid advisor wrapper', () => {
    const advisor = {
      id: VALID_UUID,
      user_id: 'u',
      name: 'A',
      description: 'd',
      color: 'blue',
      sort_order: 0,
      sex: 'female',
      voice_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    expect(AdvisorSingleResponseSchema.safeParse({ advisor }).success).toBe(true)
  })
})

// ─── createConversationSchema ─────────────────────────────────────────────────

describe('createConversationSchema', () => {
  it('accepts object with no title (title is optional)', () => {
    expect(createConversationSchema.safeParse({}).success).toBe(true)
  })

  it('accepts valid title', () => {
    expect(createConversationSchema.safeParse({ title: 'My conversation' }).success).toBe(true)
  })

  it('rejects title exceeding max length', () => {
    expect(createConversationSchema.safeParse({ title: 'x'.repeat(CONVERSATION_TITLE_MAX + 1) }).success).toBe(false)
  })

  it('rejects empty title string', () => {
    expect(createConversationSchema.safeParse({ title: '' }).success).toBe(false)
  })
})

// ─── renameConversationSchema ─────────────────────────────────────────────────

describe('renameConversationSchema', () => {
  it('accepts valid title', () => {
    expect(renameConversationSchema.safeParse({ title: 'New Title' }).success).toBe(true)
  })

  it('rejects missing title', () => {
    expect(renameConversationSchema.safeParse({}).success).toBe(false)
  })

  it('rejects empty title', () => {
    expect(renameConversationSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('rejects title exceeding max length', () => {
    expect(renameConversationSchema.safeParse({ title: 'x'.repeat(CONVERSATION_TITLE_MAX + 1) }).success).toBe(false)
  })
})

// ─── boardListQuerySchema ─────────────────────────────────────────────────────

describe('boardListQuerySchema', () => {
  it('defaults limit to 1000 and offset to 0 when not provided', () => {
    const result = boardListQuerySchema.parse({})
    expect(result.limit).toBe(1000)
    expect(result.offset).toBe(0)
  })

  it('coerces string limit to number', () => {
    const result = boardListQuerySchema.parse({ limit: '50', offset: '10' })
    expect(result.limit).toBe(50)
    expect(result.offset).toBe(10)
  })

  it('falls back to default on malformed limit (catch)', () => {
    const result = boardListQuerySchema.parse({ limit: 'not-a-number' })
    expect(result.limit).toBe(1000)
  })

  it('falls back to 0 on malformed offset (catch)', () => {
    const result = boardListQuerySchema.parse({ offset: 'bad' })
    expect(result.offset).toBe(0)
  })
})

// ─── ConversationListResponseSchema ──────────────────────────────────────────

describe('ConversationListResponseSchema', () => {
  it('accepts valid response', () => {
    expect(ConversationListResponseSchema.safeParse({ conversations: [], count: 0, total: 0 }).success).toBe(true)
  })

  it('rejects negative count', () => {
    expect(ConversationListResponseSchema.safeParse({ conversations: [], count: -1, total: 0 }).success).toBe(false)
  })
})

// ─── BoardMessageSchema ───────────────────────────────────────────────────────

describe('BoardMessageSchema', () => {
  const valid = {
    id: VALID_UUID,
    conversation_id: VALID_UUID,
    user_id: 'user1',
    role: 'user' as const,
    advisor_id: null,
    advisor_name: null,
    advisor_color: null,
    content: 'Hello',
    created_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid user message', () => {
    expect(BoardMessageSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts advisor role', () => {
    expect(BoardMessageSchema.safeParse({ ...valid, role: 'advisor', advisor_id: VALID_UUID }).success).toBe(true)
  })

  it('rejects invalid role', () => {
    expect(BoardMessageSchema.safeParse({ ...valid, role: 'bot' }).success).toBe(false)
  })

  it('rejects non-UUID advisor_id when set', () => {
    expect(BoardMessageSchema.safeParse({ ...valid, advisor_id: 'bad-id' }).success).toBe(false)
  })
})

// ─── ConversationDetailResponseSchema / ConversationSingleResponseSchema ─────

describe('ConversationDetailResponseSchema', () => {
  const conv = {
    id: VALID_UUID,
    user_id: 'u',
    title: 'T',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid detail response', () => {
    expect(ConversationDetailResponseSchema.safeParse({ conversation: conv, messages: [] }).success).toBe(true)
  })
})

describe('ConversationSingleResponseSchema', () => {
  const conv = {
    id: VALID_UUID,
    user_id: 'u',
    title: 'T',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('accepts valid single response', () => {
    expect(ConversationSingleResponseSchema.safeParse({ conversation: conv }).success).toBe(true)
  })
})

// ─── askBoardSchema ───────────────────────────────────────────────────────────

describe('askBoardSchema', () => {
  it('accepts valid content', () => {
    expect(askBoardSchema.safeParse({ content: 'What should I do?' }).success).toBe(true)
  })

  it('trims whitespace from content', () => {
    const result = askBoardSchema.parse({ content: '  hello  ' })
    expect(result.content).toBe('hello')
  })

  it('rejects empty content', () => {
    expect(askBoardSchema.safeParse({ content: '' }).success).toBe(false)
  })

  it('rejects content exceeding max length', () => {
    expect(askBoardSchema.safeParse({ content: 'x'.repeat(QUESTION_MAX + 1) }).success).toBe(false)
  })

  it('accepts content at exactly max length', () => {
    expect(askBoardSchema.safeParse({ content: 'x'.repeat(QUESTION_MAX) }).success).toBe(true)
  })
})

// ─── ID param schemas ─────────────────────────────────────────────────────────

describe('conversationIdParamSchema', () => {
  it('accepts valid UUID', () => {
    expect(conversationIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects invalid UUID', () => {
    expect(conversationIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('advisorIdParamSchema', () => {
  it('accepts valid UUID', () => {
    expect(advisorIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects invalid UUID', () => {
    expect(advisorIdParamSchema.safeParse({ id: 'bad' }).success).toBe(false)
  })
})

// ─── ProviderStatusResponseSchema ─────────────────────────────────────────────

describe('ProviderStatusResponseSchema', () => {
  it('accepts null selected with count', () => {
    expect(ProviderStatusResponseSchema.safeParse({ selected: null, configured_count: 0 }).success).toBe(true)
  })

  it('accepts valid selected provider', () => {
    const selected = { id: 'openai', name: 'OpenAI', model: 'gpt-4', configured: true }
    expect(ProviderStatusResponseSchema.safeParse({ selected, configured_count: 1 }).success).toBe(true)
  })

  it('rejects unknown provider id in selected', () => {
    const selected = { id: 'unknown-provider', name: 'X', model: 'm', configured: false }
    expect(ProviderStatusResponseSchema.safeParse({ selected, configured_count: 0 }).success).toBe(false)
  })
})

// ─── BoardSettingsSchema ──────────────────────────────────────────────────────

describe('BoardSettingsSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(BoardSettingsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts onboardingCompleted boolean', () => {
    expect(BoardSettingsSchema.safeParse({ onboardingCompleted: true }).success).toBe(true)
  })

  it('accepts null selectedAiProvider', () => {
    expect(BoardSettingsSchema.safeParse({ selectedAiProvider: null }).success).toBe(true)
  })

  it('accepts valid selectedAiProvider', () => {
    expect(BoardSettingsSchema.safeParse({ selectedAiProvider: 'claude' }).success).toBe(true)
  })

  it('rejects invalid selectedAiProvider', () => {
    expect(BoardSettingsSchema.safeParse({ selectedAiProvider: 'unknown' }).success).toBe(false)
  })

  it('accepts aiProviderModels map', () => {
    expect(BoardSettingsSchema.safeParse({ aiProviderModels: { claude: 'claude-3' } }).success).toBe(true)
  })

  it('rejects provider id exceeding 64 chars in aiProviderModels', () => {
    const longKey = 'a'.repeat(65)
    expect(BoardSettingsSchema.safeParse({ aiProviderModels: { [longKey]: 'model' } }).success).toBe(false)
  })

  it('rejects model id exceeding MODEL_ID_MAX_LENGTH', () => {
    expect(BoardSettingsSchema.safeParse({ aiProviderModels: { openai: 'x'.repeat(201) } }).success).toBe(false)
  })

  it('rejects unknown extra keys (strict)', () => {
    expect(BoardSettingsSchema.safeParse({ unknownField: true }).success).toBe(false)
  })
})

// ─── SettingsSavedSchema / DeleteResponseSchema ───────────────────────────────

describe('SettingsSavedSchema', () => {
  it('accepts { success: true }', () => {
    expect(SettingsSavedSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(SettingsSavedSchema.safeParse({ success: false }).success).toBe(false)
  })
})

describe('DeleteResponseSchema', () => {
  it('accepts { success: true }', () => {
    expect(DeleteResponseSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(DeleteResponseSchema.safeParse({ success: false }).success).toBe(false)
  })
})
