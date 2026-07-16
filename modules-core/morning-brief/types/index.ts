/**
 * Morning Brief Module - Type Definitions
 *
 * Keep in sync with:
 * - lib/validation.ts (Zod schemas / API shapes)
 * - database/schema.ts (Drizzle tables)
 */

import type { AiProviderId } from '@/lib/ai-providers'
export type { AiProviderId }

/** Settings stored in module_settings.settings (JSONB), keyed by module id. */
export interface MorningBriefSettings {
  /** Which configured chat/LLM provider writes the greeting. */
  selectedAiProvider: AiProviderId | null
  /** Which configured voice provider narrates the brief (null = narration off). */
  selectedVoiceProvider: AiProviderId | null
  /** The chosen ElevenLabs voice id (null = provider default). */
  elevenLabsVoiceId: string | null
  /**
   * Per-module model override, keyed by provider id (e.g. { openai: 'gpt-5' }).
   * Blank/absent for a provider = fall back to the global model from
   * Settings → Integrations, then the provider's built-in default.
   */
  aiProviderModels?: Partial<Record<AiProviderId, string>>
}

/** A selectable ElevenLabs voice, as surfaced by GET /api/modules/morning-brief/voices. */
export interface ElevenLabsVoice {
  voiceId: string
  name: string
  category: string | null
  previewUrl: string | null
  labels: Record<string, string> | null
}

/** Response from GET /api/modules/morning-brief/voices */
export interface VoicesResponse {
  /** False when no ElevenLabs API key is configured under Settings → AI Providers. */
  configured: boolean
  voices: ElevenLabsVoice[]
}

/** Response from GET /api/modules/morning-brief/greeting */
export interface BriefGreeting {
  greeting: string
  message: string
  brief_date: string
  cached: boolean
  provider: string | null
  model: string | null
}

/** A quote from the Quotes module, shown in the letter when that module is enabled. */
export interface BriefQuote {
  quote: string
  author?: string | null
}

/** A single calendar meeting, display-ready (times pre-formatted in the user's tz). */
export interface BriefMeeting {
  id: string
  title: string
  startLabel: string
  endLabel: string | null
  allDay: boolean
  location: string | null
  start: string | null
}

/** Response from GET /api/modules/morning-brief/calendar */
export interface CalendarResponse {
  connected: boolean
  events: BriefMeeting[]
  timezone: string
}

/** Response from GET /api/modules/morning-brief/weather */
export interface BriefWeather {
  available: boolean
  city: string | null
  high: number | null
  low: number | null
  unit: 'C' | 'F'
  code: number | null
  description: string | null
}

/** Response from GET /api/modules/morning-brief/google/status */
export interface GoogleStatus {
  connected: boolean
  configured: boolean
  email: string | null
}

/** Response from GET /api/modules/morning-brief/ical/status */
export interface IcalStatus {
  subscribed: boolean
  /** Hostname of the subscribed feed (for display), or null when not subscribed. */
  host: string | null
}

/**
 * The top priority tasks shown in the brief. This is the subset of the Tasks
 * module's task shape (GET /api/modules/tasks/priorities) that the brief reads.
 * Declared locally so this module has no hard dependency on the Tasks module's
 * types — when Tasks is absent the brief simply shows nothing for this section.
 */
export interface BriefTask {
  id: string
  title: string
  due_date: string | null
  priority_score: string | null
  status: string | null
  completed: boolean | null
}
