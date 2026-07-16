export type ChatProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter'
export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatAttachment {
  upload_id: string
  filename: string
  original_name: string
  mime: string
  size: number
  bucket: string
}

export interface ChatConversation {
  id: string
  user_id: string
  title: string
  provider: ChatProvider
  model: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  user_id: string
  role: ChatRole
  content: string
  attachments: ChatAttachment[]
  created_at: string
}

export interface ChatUpload {
  id: string
  user_id: string
  conversation_id: string | null
  filename: string
  original_name: string
  mime: string
  size: number
  bucket: string
  created_at: string
}

export interface ChatProviderStatus {
  id: ChatProvider
  name: string
  configured: boolean
  defaultModel: string
  configuredModel: string | null
}

export interface ChatSettings {
  onboardingCompleted: boolean
  defaultProvider: ChatProvider
  defaultModel: string
}

export interface ApiErrorResponse {
  error: string
  details?: unknown
}
