/**
 * Tests for modules-core/chat/lib/validation.ts — all exported Zod schemas:
 * valid/invalid parses, boundary lengths, list-query .catch() defaults, and
 * the .strict() settings schema.
 */
import { describe, it, expect } from 'vitest'
import {
  chatIdParamSchema,
  PROVIDERS,
  ROLES,
  createConversationSchema,
  updateConversationSchema,
  ChatAttachmentSchema,
  SendAttachmentSchema,
  sendMessageSchema,
  chatListQuerySchema,
  ChatConversationSchema,
  ChatMessageSchema,
  ChatConversationListResponseSchema,
  ChatConversationSingleResponseSchema,
  ChatConversationDetailResponseSchema,
  ChatDeleteResponseSchema,
  ChatUploadSchema,
  ChatUploadListResponseSchema,
  ChatUploadSingleResponseSchema,
  UploadFormSchema,
  ChatSettingsSchema,
  SettingsSavedSchema,
  ProviderStatusSchema,
  ProvidersResponseSchema,
} from '@/modules-core/chat/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const VALID_UUID2 = '223e4567-e89b-12d3-a456-426614174001'

// ─── chatIdParamSchema ────────────────────────────────────────────────────────

describe('chatIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(chatIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects a non-UUID', () => {
    expect(chatIdParamSchema.safeParse({ id: 'nope' }).success).toBe(false)
  })
})

// ─── createConversationSchema ─────────────────────────────────────────────────

describe('createConversationSchema', () => {
  const valid = { provider: 'openai', model: 'gpt-5' }

  it('accepts a valid body without title (optional)', () => {
    expect(createConversationSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a valid body with title', () => {
    expect(createConversationSchema.safeParse({ ...valid, title: 'My chat' }).success).toBe(true)
  })

  it('accepts all four providers', () => {
    for (const provider of PROVIDERS) {
      expect(createConversationSchema.safeParse({ ...valid, provider }).success).toBe(true)
    }
  })

  it('rejects an unknown provider with the custom enum message', () => {
    const r = createConversationSchema.safeParse({ ...valid, provider: 'grok' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Provider must be one of: openai, anthropic, gemini, openrouter')
    }
  })

  it('rejects an empty title', () => {
    expect(createConversationSchema.safeParse({ ...valid, title: '' }).success).toBe(false)
  })

  it('accepts a title at exactly 200 chars but rejects 201', () => {
    expect(createConversationSchema.safeParse({ ...valid, title: 'a'.repeat(200) }).success).toBe(true)
    expect(createConversationSchema.safeParse({ ...valid, title: 'a'.repeat(201) }).success).toBe(false)
  })

  it('rejects a title with angle brackets (safeText)', () => {
    expect(createConversationSchema.safeParse({ ...valid, title: '<script>' }).success).toBe(false)
  })

  it('rejects an empty model and one over 128 chars', () => {
    expect(createConversationSchema.safeParse({ ...valid, model: '' }).success).toBe(false)
    expect(createConversationSchema.safeParse({ ...valid, model: 'm'.repeat(129) }).success).toBe(false)
  })

  it('accepts a model at exactly 128 chars', () => {
    expect(createConversationSchema.safeParse({ ...valid, model: 'm'.repeat(128) }).success).toBe(true)
  })

  it('rejects a missing model', () => {
    expect(createConversationSchema.safeParse({ provider: 'openai' }).success).toBe(false)
  })
})

// ─── updateConversationSchema ─────────────────────────────────────────────────

describe('updateConversationSchema', () => {
  it('accepts a valid title', () => {
    expect(updateConversationSchema.safeParse({ title: 'Renamed' }).success).toBe(true)
  })

  it('rejects a missing or empty title', () => {
    expect(updateConversationSchema.safeParse({}).success).toBe(false)
    expect(updateConversationSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('rejects a title over 200 chars', () => {
    expect(updateConversationSchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false)
  })
})

// ─── ChatAttachmentSchema ─────────────────────────────────────────────────────

describe('ChatAttachmentSchema', () => {
  const valid = {
    upload_id: VALID_UUID,
    filename: '1714-photo.png',
    original_name: 'photo.png',
    mime: 'image/png',
    size: 1234,
    bucket: 'chat',
  }

  it('accepts a valid attachment', () => {
    expect(ChatAttachmentSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a non-UUID upload_id', () => {
    expect(ChatAttachmentSchema.safeParse({ ...valid, upload_id: 'x' }).success).toBe(false)
  })

  it('enforces the 512-char filename/original_name caps', () => {
    expect(ChatAttachmentSchema.safeParse({ ...valid, filename: 'f'.repeat(512) }).success).toBe(true)
    expect(ChatAttachmentSchema.safeParse({ ...valid, filename: 'f'.repeat(513) }).success).toBe(false)
    expect(ChatAttachmentSchema.safeParse({ ...valid, original_name: 'o'.repeat(513) }).success).toBe(false)
  })

  it('enforces the 128-char mime and 64-char bucket caps', () => {
    expect(ChatAttachmentSchema.safeParse({ ...valid, mime: 'm'.repeat(129) }).success).toBe(false)
    expect(ChatAttachmentSchema.safeParse({ ...valid, bucket: 'b'.repeat(65) }).success).toBe(false)
  })

  it('rejects negative and non-integer sizes, accepts zero', () => {
    expect(ChatAttachmentSchema.safeParse({ ...valid, size: -1 }).success).toBe(false)
    expect(ChatAttachmentSchema.safeParse({ ...valid, size: 1.5 }).success).toBe(false)
    expect(ChatAttachmentSchema.safeParse({ ...valid, size: 0 }).success).toBe(true)
  })
})

// ─── SendAttachmentSchema ─────────────────────────────────────────────────────

describe('SendAttachmentSchema', () => {
  it('accepts a valid upload_id and strips extra client-supplied fields', () => {
    const r = SendAttachmentSchema.safeParse({ upload_id: VALID_UUID, bucket: 'evil', filename: 'x' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual({ upload_id: VALID_UUID })
  })

  it('rejects a non-UUID upload_id', () => {
    expect(SendAttachmentSchema.safeParse({ upload_id: 'nope' }).success).toBe(false)
  })
})

// ─── sendMessageSchema ────────────────────────────────────────────────────────

describe('sendMessageSchema', () => {
  it('accepts content without attachments', () => {
    expect(sendMessageSchema.safeParse({ content: 'hi' }).success).toBe(true)
  })

  it('rejects empty content', () => {
    expect(sendMessageSchema.safeParse({ content: '' }).success).toBe(false)
  })

  it('accepts content at exactly 50000 chars but rejects 50001', () => {
    expect(sendMessageSchema.safeParse({ content: 'x'.repeat(50000) }).success).toBe(true)
    expect(sendMessageSchema.safeParse({ content: 'x'.repeat(50001) }).success).toBe(false)
  })

  it('accepts up to 10 attachments but rejects 11', () => {
    const att = (n: number) => Array.from({ length: n }, () => ({ upload_id: VALID_UUID }))
    expect(sendMessageSchema.safeParse({ content: 'hi', attachments: att(10) }).success).toBe(true)
    expect(sendMessageSchema.safeParse({ content: 'hi', attachments: att(11) }).success).toBe(false)
  })
})

// ─── chatListQuerySchema ──────────────────────────────────────────────────────

describe('chatListQuerySchema', () => {
  it('defaults limit=1000 and offset=0 when params are missing', () => {
    expect(chatListQuerySchema.parse({})).toEqual({ limit: 1000, offset: 0 })
  })

  it('coerces valid string values', () => {
    expect(chatListQuerySchema.parse({ limit: '25', offset: '5' })).toEqual({ limit: 25, offset: 5 })
  })

  it('falls back on NaN values', () => {
    expect(chatListQuerySchema.parse({ limit: 'abc', offset: 'xyz' })).toEqual({ limit: 1000, offset: 0 })
  })

  it('falls back on out-of-range values', () => {
    expect(chatListQuerySchema.parse({ limit: '0', offset: '-1' })).toEqual({ limit: 1000, offset: 0 })
    expect(chatListQuerySchema.parse({ limit: '1001' })).toEqual({ limit: 1000, offset: 0 })
  })

  it('falls back on non-integer values', () => {
    expect(chatListQuerySchema.parse({ limit: '2.5' })).toEqual({ limit: 1000, offset: 0 })
  })

  it('accepts boundary values 1 and 1000', () => {
    expect(chatListQuerySchema.parse({ limit: '1' }).limit).toBe(1)
    expect(chatListQuerySchema.parse({ limit: '1000' }).limit).toBe(1000)
  })
})

// ─── Conversation / message response schemas ─────────────────────────────────

const conversation = {
  id: VALID_UUID,
  user_id: 'u1',
  title: 'Chat',
  provider: 'openai',
  model: 'gpt-5',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const message = {
  id: VALID_UUID2,
  conversation_id: VALID_UUID,
  user_id: 'u1',
  role: 'user',
  content: 'hi',
  attachments: [],
  created_at: '2026-01-01T00:00:00Z',
}

describe('ChatConversationSchema', () => {
  it('accepts a valid conversation', () => {
    expect(ChatConversationSchema.safeParse(conversation).success).toBe(true)
  })

  it('rejects a non-UUID id', () => {
    expect(ChatConversationSchema.safeParse({ ...conversation, id: 'x' }).success).toBe(false)
  })
})

describe('ChatMessageSchema', () => {
  it('accepts a valid message for every role', () => {
    for (const role of ROLES) {
      expect(ChatMessageSchema.safeParse({ ...message, role }).success).toBe(true)
    }
  })

  it('rejects an unknown role', () => {
    expect(ChatMessageSchema.safeParse({ ...message, role: 'tool' }).success).toBe(false)
  })

  it('rejects invalid attachment entries', () => {
    expect(ChatMessageSchema.safeParse({ ...message, attachments: [{ upload_id: 'x' }] }).success).toBe(false)
  })
})

describe('conversation response schemas', () => {
  it('ChatConversationListResponseSchema accepts a valid page', () => {
    const r = ChatConversationListResponseSchema.safeParse({ conversations: [conversation], count: 1, total: 3 })
    expect(r.success).toBe(true)
  })

  it('ChatConversationListResponseSchema rejects negative totals', () => {
    const r = ChatConversationListResponseSchema.safeParse({ conversations: [], count: 0, total: -1 })
    expect(r.success).toBe(false)
  })

  it('ChatConversationSingleResponseSchema accepts a valid wrapper', () => {
    expect(ChatConversationSingleResponseSchema.safeParse({ conversation }).success).toBe(true)
  })

  it('ChatConversationDetailResponseSchema accepts conversation + messages', () => {
    const r = ChatConversationDetailResponseSchema.safeParse({ conversation, messages: [message] })
    expect(r.success).toBe(true)
  })

  it('ChatDeleteResponseSchema requires success: true', () => {
    expect(ChatDeleteResponseSchema.safeParse({ success: true, message: 'Deleted' }).success).toBe(true)
    expect(ChatDeleteResponseSchema.safeParse({ success: false, message: 'Nope' }).success).toBe(false)
  })
})

// ─── Upload schemas ───────────────────────────────────────────────────────────

const upload = {
  id: VALID_UUID,
  user_id: 'u1',
  conversation_id: VALID_UUID2,
  filename: '1714-doc.txt',
  original_name: 'doc.txt',
  mime: 'text/plain',
  size: 10,
  bucket: 'chat',
  created_at: '2026-01-01T00:00:00Z',
}

describe('upload schemas', () => {
  it('ChatUploadSchema accepts a valid upload and a null conversation_id', () => {
    expect(ChatUploadSchema.safeParse(upload).success).toBe(true)
    expect(ChatUploadSchema.safeParse({ ...upload, conversation_id: null }).success).toBe(true)
  })

  it('ChatUploadSchema rejects a negative size', () => {
    expect(ChatUploadSchema.safeParse({ ...upload, size: -5 }).success).toBe(false)
  })

  it('ChatUploadListResponseSchema accepts a valid page', () => {
    expect(ChatUploadListResponseSchema.safeParse({ uploads: [upload], count: 1, total: 1 }).success).toBe(true)
  })

  it('ChatUploadSingleResponseSchema accepts a valid wrapper', () => {
    expect(ChatUploadSingleResponseSchema.safeParse({ upload }).success).toBe(true)
  })

  it('UploadFormSchema accepts any file with an optional conversation_id', () => {
    expect(UploadFormSchema.safeParse({ file: 'binary' }).success).toBe(true)
    expect(UploadFormSchema.safeParse({ file: 'binary', conversation_id: VALID_UUID }).success).toBe(true)
  })

  it('UploadFormSchema rejects a non-UUID conversation_id', () => {
    expect(UploadFormSchema.safeParse({ file: 'binary', conversation_id: 'x' }).success).toBe(false)
  })
})

// ─── Settings schemas ─────────────────────────────────────────────────────────

describe('ChatSettingsSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(ChatSettingsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts all valid fields together', () => {
    const r = ChatSettingsSchema.safeParse({
      onboardingCompleted: true,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-5',
    })
    expect(r.success).toBe(true)
  })

  it('rejects unknown keys (.strict())', () => {
    expect(ChatSettingsSchema.safeParse({ hacked: true }).success).toBe(false)
  })

  it('rejects an invalid defaultProvider', () => {
    expect(ChatSettingsSchema.safeParse({ defaultProvider: 'grok' }).success).toBe(false)
  })

  it('rejects a defaultModel over 128 chars', () => {
    expect(ChatSettingsSchema.safeParse({ defaultModel: 'm'.repeat(129) }).success).toBe(false)
  })

  it('rejects a non-boolean onboardingCompleted', () => {
    expect(ChatSettingsSchema.safeParse({ onboardingCompleted: 'yes' }).success).toBe(false)
  })
})

describe('SettingsSavedSchema', () => {
  it('requires success: true', () => {
    expect(SettingsSavedSchema.safeParse({ success: true }).success).toBe(true)
    expect(SettingsSavedSchema.safeParse({ success: false }).success).toBe(false)
  })
})

// ─── Provider status schemas ──────────────────────────────────────────────────

describe('ProviderStatusSchema / ProvidersResponseSchema', () => {
  const status = {
    id: 'gemini',
    name: 'Google Gemini',
    configured: true,
    defaultModel: 'gemini-2.5-flash',
    configuredModel: null,
  }

  it('accepts a valid status with a null configuredModel', () => {
    expect(ProviderStatusSchema.safeParse(status).success).toBe(true)
  })

  it('accepts a string configuredModel', () => {
    expect(ProviderStatusSchema.safeParse({ ...status, configuredModel: 'gemini-pro' }).success).toBe(true)
  })

  it('rejects an unknown provider id', () => {
    expect(ProviderStatusSchema.safeParse({ ...status, id: 'grok' }).success).toBe(false)
  })

  it('ProvidersResponseSchema accepts a list of statuses', () => {
    expect(ProvidersResponseSchema.safeParse({ providers: [status] }).success).toBe(true)
  })

  it('ProvidersResponseSchema rejects a missing providers array', () => {
    expect(ProvidersResponseSchema.safeParse({}).success).toBe(false)
  })
})
