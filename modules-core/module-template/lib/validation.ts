import { z } from 'zod'
import '@/lib/openapi/registry'
import { safeText } from '@/lib/validation'
import { AI_PROVIDER_IDS } from '@/lib/ai-providers'

const uuidSchema = z.string().uuid('Invalid entry id format')

export const createEntrySchema = z.object({
  message: z.string().min(1, 'Message is required').max(500, 'Message must be 500 characters or fewer'),
}).openapi('CreateEntryBody')

export const updateEntrySchema = z.object({
  id: uuidSchema,
  message: z.string().min(1, 'Message is required').max(500, 'Message must be 500 characters or fewer'),
}).openapi('UpdateEntryBody')

export const listEntriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const deleteEntryQuerySchema = z.object({
  id: uuidSchema,
})

export const ModuleTemplateEntrySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  message: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('ModuleTemplateEntry')

export const EntryListResponseSchema = z.object({
  entries: z.array(ModuleTemplateEntrySchema),
  count: z.number().int().nonnegative(),
}).openapi('ModuleTemplateEntryListResponse')

export const EntrySingleResponseSchema = z.object({
  entry: ModuleTemplateEntrySchema,
}).openapi('ModuleTemplateEntrySingleResponse')

export const EntryDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('ModuleTemplateDeleteResponse')

export const ModuleTemplateSettingsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  sampleQuestion1: safeText(500).optional(),
  sampleQuestion2: safeText(500).optional(),
  sampleQuestion3: safeText(500).optional(),
  enableNotifications: z.boolean().optional(),
  showInDashboard: z.boolean().optional(),
  defaultMessage: safeText(500).optional(),
  userDisplayName: safeText(100).optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  refreshInterval: z.enum(['30', '60', '120']).optional(),
  selectedAiProvider: z.enum(AI_PROVIDER_IDS).nullable().optional(),
}).strict().openapi('ModuleTemplateSettings')

export const SettingsSavedSchema = z.object({
  success: z.literal(true),
}).openapi('ModuleTemplateSettingsSaved')

export const GenerateRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000, 'Prompt must be 2000 characters or fewer'),
}).openapi('ModuleTemplateGenerateRequest')

export const GenerateResponseSchema = z.object({
  text: z.string(),
  provider: z.enum(AI_PROVIDER_IDS),
  model: z.string(),
}).openapi('ModuleTemplateGenerateResponse')

// Multipart file upload — represented as binary string per OpenAPI conventions.
export const UploadFormSchema = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary' }),
}).openapi('ModuleTemplateUploadForm')

export const UploadResponseSchema = z.object({
  path: z.string(),
  name: z.string(),
}).openapi('ModuleTemplateUploadResponse')
