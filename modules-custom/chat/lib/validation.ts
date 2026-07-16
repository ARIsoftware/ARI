import { z } from 'zod'
import '@/lib/openapi/registry'
import { safeText } from '@/lib/validation'

const uuidSchema = z.string().uuid('Invalid id format')

// Path-parameter schema for /{id} routes — required by the OpenAPI lint
// (path-parameters-defined rule).
export const chatIdParamSchema = z.object({
  id: uuidSchema,
})

export const PROVIDERS = ['openai', 'anthropic', 'gemini', 'openrouter'] as const
export const ROLES = ['user', 'assistant', 'system'] as const

// ─── Conversation schemas ──────────────────────────────────────────────

export const createConversationSchema = z.object({
  title: safeText(200).min(1, 'Title is required').optional(),
  provider: z.enum(PROVIDERS, { errorMap: () => ({ message: 'Provider must be one of: openai, anthropic, gemini, openrouter' }) }),
  model: z.string().min(1, 'Model is required').max(128, 'Model must be 128 characters or fewer'),
}).openapi('ChatCreateConversationBody')

export const updateConversationSchema = z.object({
  title: safeText(200).min(1, 'Title is required'),
}).openapi('ChatUpdateConversationBody')

export const ChatAttachmentSchema = z.object({
  upload_id: uuidSchema,
  filename: z.string().max(512, 'Filename must be 512 characters or fewer'),
  original_name: z.string().max(512, 'Original name must be 512 characters or fewer'),
  mime: z.string().max(128, 'Mime type must be 128 characters or fewer'),
  size: z.number().int().nonnegative('Size must be a non-negative integer'),
  bucket: z.string().max(64, 'Bucket must be 64 characters or fewer'),
}).openapi('ChatAttachment')

// Send requests only reference uploads by id — the server rebuilds the file
// metadata from the owned chat_uploads rows. Extra client-supplied fields
// (filename, bucket, …) are stripped by Zod and never trusted.
export const SendAttachmentSchema = z.object({
  upload_id: uuidSchema,
}).openapi('ChatSendAttachment')

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(50000, 'Message must be 50000 characters or fewer'),
  attachments: z.array(SendAttachmentSchema).max(10, 'Cannot attach more than 10 files in a single message').optional(),
}).openapi('ChatSendMessageBody')

// Shared limit/offset pagination for list endpoints. `.catch()` falls back to
// the default on any malformed value (missing param, empty `?limit=`, NaN)
// rather than 400-ing. The default cap is generous so first-party UI (which
// does not page yet) is not silently truncated; `total` in the response lets
// clients detect when more rows exist.
export const chatListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).catch(1000).openapi({ type: 'integer', default: 1000 }),
  offset: z.coerce.number().int().min(0).catch(0).openapi({ type: 'integer', default: 0 }),
}).openapi('ChatListQuery')

export const ChatConversationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  title: z.string(),
  provider: z.string(),
  model: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('ChatConversation')

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  user_id: z.string(),
  role: z.enum(ROLES),
  content: z.string(),
  attachments: z.array(ChatAttachmentSchema),
  created_at: z.string(),
}).openapi('ChatMessage')

export const ChatConversationListResponseSchema = z.object({
  conversations: z.array(ChatConversationSchema),
  count: z.number().int().nonnegative(), // number of rows in this page
  total: z.number().int().nonnegative(), // total rows for the user
}).openapi('ChatConversationListResponse')

export const ChatConversationSingleResponseSchema = z.object({
  conversation: ChatConversationSchema,
}).openapi('ChatConversationSingleResponse')

export const ChatConversationDetailResponseSchema = z.object({
  conversation: ChatConversationSchema,
  messages: z.array(ChatMessageSchema),
}).openapi('ChatConversationDetailResponse')

export const ChatDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('ChatDeleteResponse')

// ─── Upload schemas ────────────────────────────────────────────────────

export const ChatUploadSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  conversation_id: z.string().uuid().nullable(),
  filename: z.string(),
  original_name: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  bucket: z.string(),
  created_at: z.string(),
}).openapi('ChatUpload')

export const ChatUploadListResponseSchema = z.object({
  uploads: z.array(ChatUploadSchema),
  count: z.number().int().nonnegative(), // number of rows in this page
  total: z.number().int().nonnegative(), // total rows for the user
}).openapi('ChatUploadListResponse')

export const ChatUploadSingleResponseSchema = z.object({
  upload: ChatUploadSchema,
}).openapi('ChatUploadSingleResponse')

export const UploadFormSchema = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary' }),
  conversation_id: z.string().uuid().optional().openapi({ type: 'string' }),
}).openapi('ChatUploadForm')

// ─── Settings schemas ──────────────────────────────────────────────────

export const ChatSettingsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  defaultProvider: z.enum(PROVIDERS).optional(),
  defaultModel: z.string().max(128, 'Model must be 128 characters or fewer').optional(),
}).strict().openapi('ChatSettings')

export const SettingsSavedSchema = z.object({
  success: z.literal(true),
}).openapi('ChatSettingsSaved')

// ─── Providers status schema ───────────────────────────────────────────

export const ProviderStatusSchema = z.object({
  id: z.enum(PROVIDERS),
  name: z.string(),
  configured: z.boolean(),
  defaultModel: z.string(),
  configuredModel: z.string().nullable(),
}).openapi('ChatProviderStatus')

export const ProvidersResponseSchema = z.object({
  providers: z.array(ProviderStatusSchema),
}).openapi('ChatProvidersResponse')
