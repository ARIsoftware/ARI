import { z } from 'zod'
import '@/lib/openapi/registry'
import { AI_PROVIDER_IDS, MODEL_ID_MAX_LENGTH } from '@/lib/ai-providers'

// ─── Settings ───────────────────────────────────────────────────────────────
export const MorningBriefSettingsSchema = z.object({
  selectedAiProvider: z.enum(AI_PROVIDER_IDS).nullable().optional(),
  selectedVoiceProvider: z.enum(AI_PROVIDER_IDS).nullable().optional(),
  elevenLabsVoiceId: z.string().max(100).nullable().optional(),
  // Keys are deliberately NOT restricted to the current AI_PROVIDER_IDS: the
  // client round-trips the whole stored map, so a stale key from a provider
  // that was later removed from the registry must not brick every save.
  aiProviderModels: z.record(z.string().max(64), z.string().max(MODEL_ID_MAX_LENGTH)).optional(),
}).strict().openapi('MorningBriefSettings')

export const SettingsSavedSchema = z.object({
  success: z.literal(true),
}).openapi('MorningBriefSettingsSaved')

// ─── Greeting ───────────────────────────────────────────────────────────────
export const greetingQuerySchema = z.object({
  taskCount: z.coerce.number().int().min(0, 'taskCount must be 0 or more').max(10000).optional(),
  meetingCount: z.coerce.number().int().min(0, 'meetingCount must be 0 or more').max(10000).optional(),
})

export const GreetingResponseSchema = z.object({
  greeting: z.string(),
  message: z.string(),
  brief_date: z.string(),
  cached: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
}).openapi('MorningBriefGreeting')

// ─── Calendar ───────────────────────────────────────────────────────────────
export const BriefMeetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  startLabel: z.string(),
  endLabel: z.string().nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  start: z.string().nullable(),
}).openapi('MorningBriefMeeting')

export const CalendarResponseSchema = z.object({
  connected: z.boolean(),
  events: z.array(BriefMeetingSchema),
  timezone: z.string(),
}).openapi('MorningBriefCalendar')

// ─── Weather ─────────────────────────────────────────────────────────────────
export const WeatherResponseSchema = z.object({
  available: z.boolean(),
  city: z.string().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  unit: z.enum(['C', 'F']),
  code: z.number().nullable(),
  description: z.string().nullable(),
}).openapi('MorningBriefWeather')

// ─── Read aloud (ElevenLabs text-to-speech) ──────────────────────────────────
export const TtsRequestSchema = z.object({
  text: z.string().min(1, 'text is required').max(5000, 'text is too long (max 5000 characters)'),
}).strict().openapi('MorningBriefTtsRequest')

export const ElevenLabsVoiceSchema = z.object({
  voiceId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  previewUrl: z.string().nullable(),
  labels: z.record(z.string()).nullable(),
}).openapi('MorningBriefVoice')

export const VoicesResponseSchema = z.object({
  configured: z.boolean(),
  voices: z.array(ElevenLabsVoiceSchema),
}).openapi('MorningBriefVoices')

// ─── iCal subscription (alternative to OAuth) ────────────────────────────────
export const IcalSubscribeSchema = z.object({
  url: z.string().url('Enter a valid calendar URL').max(2000),
}).strict().openapi('MorningBriefIcalSubscribe')

export const IcalStatusResponseSchema = z.object({
  subscribed: z.boolean(),
  /** Hostname of the subscribed feed for display (never the secret path). */
  host: z.string().nullable(),
}).openapi('MorningBriefIcalStatus')

// ─── Google connection status ────────────────────────────────────────────────
export const GoogleStatusResponseSchema = z.object({
  connected: z.boolean(),
  configured: z.boolean(),
  email: z.string().nullable(),
}).openapi('MorningBriefGoogleStatus')

export const GoogleDisconnectResponseSchema = z.object({
  success: z.literal(true),
}).openapi('MorningBriefGoogleDisconnect')
