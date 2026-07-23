import { z } from 'zod'
import '@/lib/openapi/registry'
import { AI_PROVIDER_IDS, MODEL_ID_MAX_LENGTH } from '@/lib/ai-providers'
import {
  ADVISOR_NAME_MAX,
  ADVISOR_DESCRIPTION_MAX,
  CONVERSATION_TITLE_MAX,
  QUESTION_MAX,
} from './limits'

const advisorIdSchema = z.string().uuid('Invalid advisor id format')
const conversationIdSchema = z.string().uuid('Invalid conversation id format')

const advisorNameSchema = z.string().trim()
  .min(1, 'Name is required')
  .max(ADVISOR_NAME_MAX, `Name must be ${ADVISOR_NAME_MAX} characters or fewer`)

const advisorDescriptionSchema = z.string().trim()
  .min(1, 'Personality description is required')
  .max(ADVISOR_DESCRIPTION_MAX, `Description must be ${ADVISOR_DESCRIPTION_MAX} characters or fewer`)

const conversationTitleSchema = z.string().trim()
  .min(1, 'Title is required')
  .max(CONVERSATION_TITLE_MAX, `Title must be ${CONVERSATION_TITLE_MAX} characters or fewer`)

// Advisor voice (ElevenLabs). sex drives the automatic voice pick; voice_id is
// an optional explicit voice. '' or null both mean "auto by sex".
const advisorSexSchema = z.enum(['male', 'female', 'not_specified'])
const voiceIdSchema = z.string().min(1, 'Voice id is required').max(100, 'Voice id must be 100 characters or fewer').nullable()

// ─── Advisors ──────────────────────────────────────────────────────────

export const createAdvisorSchema = z.object({
  name: advisorNameSchema,
  description: advisorDescriptionSchema,
  sex: advisorSexSchema.optional(),
  voice_id: voiceIdSchema.optional(),
}).openapi('BoardCreateAdvisorBody')

export const updateAdvisorSchema = z.object({
  name: advisorNameSchema.optional(),
  description: advisorDescriptionSchema.optional(),
  sex: advisorSexSchema.optional(),
  voice_id: voiceIdSchema.optional(),
}).refine(
  (body) =>
    body.name !== undefined ||
    body.description !== undefined ||
    body.sex !== undefined ||
    body.voice_id !== undefined,
  { message: 'Provide a field to update' },
).openapi('BoardUpdateAdvisorBody')

export const reorderAdvisorsSchema = z.object({
  order: z.array(advisorIdSchema)
    .min(1, 'Order must contain at least one advisor id')
    .max(100, 'Order can contain at most 100 advisor ids'),
}).openapi('BoardReorderAdvisorsBody')

export const BoardAdvisorSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  sort_order: z.number().int(),
  sex: advisorSexSchema,
  voice_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('BoardAdvisor')

// Read a reply aloud with ElevenLabs. advisorId selects the voice (by the
// advisor's explicit voice_id or automatic sex-based pick); omitted → default.
// The route chunks long text into multiple ElevenLabs requests, so the cap here
// is a generous abuse guard rather than the per-request ElevenLabs limit.
export const TtsRequestSchema = z.object({
  text: z.string().min(1, 'text is required').max(20000, 'text is too long (max 20000 characters)'),
  advisorId: z.string().uuid().nullable().optional(),
}).strict().openapi('BoardTtsBody')

export const AdvisorListResponseSchema = z.object({
  advisors: z.array(BoardAdvisorSchema),
}).openapi('BoardAdvisorListResponse')

export const AdvisorSingleResponseSchema = z.object({
  advisor: BoardAdvisorSchema,
}).openapi('BoardAdvisorSingleResponse')

// ─── Conversations ─────────────────────────────────────────────────────

export const createConversationSchema = z.object({
  title: conversationTitleSchema.optional(),
}).openapi('BoardCreateConversationBody')

export const renameConversationSchema = z.object({
  title: conversationTitleSchema,
}).openapi('BoardRenameConversationBody')

export const BoardConversationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('BoardConversation')

// Shared limit/offset pagination for list endpoints. `.catch()` falls back to
// the default on any malformed value (missing param, empty `?limit=`, NaN)
// rather than 400-ing. The default cap is generous so first-party UI (which
// does not page yet) is not silently truncated; `total` lets clients detect
// when more rows exist.
export const boardListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).catch(1000).openapi({ type: 'integer', default: 1000 }),
  offset: z.coerce.number().int().min(0).catch(0).openapi({ type: 'integer', default: 0 }),
}).openapi('BoardListQuery')

export const ConversationListResponseSchema = z.object({
  conversations: z.array(BoardConversationSchema),
  count: z.number().int().nonnegative(), // number of rows in this page
  total: z.number().int().nonnegative(), // total rows for the user
}).openapi('BoardConversationListResponse')

export const BoardMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  user_id: z.string(),
  role: z.enum(['user', 'advisor']),
  advisor_id: z.string().uuid().nullable(),
  advisor_name: z.string().nullable(),
  advisor_color: z.string().nullable(),
  content: z.string(),
  created_at: z.string(),
}).openapi('BoardMessage')

export const ConversationDetailResponseSchema = z.object({
  conversation: BoardConversationSchema,
  messages: z.array(BoardMessageSchema),
}).openapi('BoardConversationDetailResponse')

export const ConversationSingleResponseSchema = z.object({
  conversation: BoardConversationSchema,
}).openapi('BoardConversationSingleResponse')

// ─── Roundtable ────────────────────────────────────────────────────────

export const askBoardSchema = z.object({
  content: z.string().trim()
    .min(1, 'Question is required')
    .max(QUESTION_MAX, `Question must be ${QUESTION_MAX} characters or fewer`),
}).openapi('BoardAskBody')

export const conversationIdParamSchema = z.object({
  id: conversationIdSchema,
}).openapi('BoardConversationIdParam')

export const advisorIdParamSchema = z.object({
  id: advisorIdSchema,
}).openapi('BoardAdvisorIdParam')

// ─── Providers & settings ──────────────────────────────────────────────

export const ProviderStatusResponseSchema = z.object({
  selected: z.object({
    id: z.enum(AI_PROVIDER_IDS),
    name: z.string(),
    model: z.string(),
    configured: z.boolean(),
  }).nullable(),
  configured_count: z.number().int().nonnegative(),
}).openapi('BoardProviderStatusResponse')

export const BoardSettingsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  selectedAiProvider: z.enum(AI_PROVIDER_IDS).nullable().optional(),
  // Keys are deliberately NOT restricted to the current AI_PROVIDER_IDS: the
  // client round-trips the whole stored map, so a stale key from a provider
  // that was later removed from the registry must not brick every save.
  aiProviderModels: z.record(
    z.string().max(64, 'Provider id must be 64 characters or fewer'),
    z.string().max(MODEL_ID_MAX_LENGTH, `Model id must be ${MODEL_ID_MAX_LENGTH} characters or fewer`),
  ).optional(),
}).strict().openapi('BoardSettings')

export const SettingsSavedSchema = z.object({
  success: z.literal(true),
}).openapi('BoardSettingsSaved')

export const DeleteResponseSchema = z.object({
  success: z.literal(true),
}).openapi('BoardDeleteResponse')
