import type { AiProviderId } from '@/lib/ai-providers'
export type { AiProviderId }
import type { AdvisorSex } from '@/modules/board-of-advisors/lib/voices'
export type { AdvisorSex }

export type BoardRole = 'user' | 'advisor'

/** Row in board_advisors (snake_case — what the API returns after toSnakeCase). */
export interface BoardAdvisor {
  id: string
  user_id: string
  name: string
  description: string
  color: string
  sort_order: number
  /** Drives the automatic voice pick when voice_id is unset. */
  sex: AdvisorSex
  /** Explicit ElevenLabs voice id, or null = auto (resolved by sex at playback). */
  voice_id: string | null
  created_at: string
  updated_at: string
}

/** Row in board_conversations. */
export interface BoardConversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

/**
 * Row in board_messages. advisor_* fields are set for role 'advisor' only;
 * advisor_name/advisor_color are snapshots that survive advisor deletion.
 */
export interface BoardMessage {
  id: string
  conversation_id: string
  user_id: string
  role: BoardRole
  advisor_id: string | null
  advisor_name: string | null
  advisor_color: string | null
  content: string
  created_at: string
}

/** Module settings stored in module_settings.settings (JSONB). */
export interface BoardSettings {
  onboardingCompleted: boolean
  selectedAiProvider: AiProviderId | null
  /**
   * Per-module model override, keyed by provider id (e.g. { openai: 'gpt-5' }).
   * Blank/absent for a provider = fall back to the global model from
   * Settings → Integrations, then the provider's built-in default.
   */
  aiProviderModels?: Partial<Record<AiProviderId, string>>
}

/** Response from GET /api/modules/board-of-advisors/providers. */
export interface BoardProviderStatus {
  selected: {
    id: AiProviderId
    name: string
    model: string
    configured: boolean
  } | null
  configured_count: number
}
