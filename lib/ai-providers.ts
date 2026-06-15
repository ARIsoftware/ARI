/**
 * Canonical list of AI providers ARI integrates with.
 *
 * Single source of truth for:
 * - The integrations settings tab (cards + save/reveal flow)
 * - The api-keys route handler (encryption / plaintext storage decision)
 * - Per-module provider pickers
 * - Zod enums and TS unions that need to enumerate provider ids
 *
 * Add new providers here; downstream consumers pick them up automatically.
 */

export const AI_PROVIDER_IDS = [
  'openrouter',
  'claude',
  'openai',
  'gemini',
  'xai',
  'mistral',
  'deepseek',
  'groq',
  'perplexity',
  'ollama',
] as const

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]

export interface AiProvider {
  id: AiProviderId
  name: string
  description: string
  primaryEnvKey: string
  primaryPlaceholder: string
  // When true, the primary env var is not a secret (e.g. a base URL): stored
  // unencrypted and rendered as a normal text input rather than masked.
  keyIsPlaintext?: boolean
  modelEnvKey: string
  modelPlaceholder: string
}

export const AI_PROVIDERS: readonly AiProvider[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified API gateway for multiple LLM providers.',
    primaryEnvKey: 'OPENROUTER_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'OPENROUTER_MODEL',
    modelPlaceholder: 'openrouter/auto',
  },
  {
    id: 'claude',
    name: 'Claude',
    description: "Anthropic's Claude models for advanced reasoning.",
    primaryEnvKey: 'ANTHROPIC_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'ANTHROPIC_MODEL',
    modelPlaceholder: 'claude-sonnet-4-5',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models for chat, code, and embeddings.',
    primaryEnvKey: 'OPENAI_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'OPENAI_MODEL',
    modelPlaceholder: 'gpt-5',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: "Google's Gemini models for multimodal tasks.",
    primaryEnvKey: 'GOOGLE_GEMINI_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'GOOGLE_GEMINI_MODEL',
    modelPlaceholder: 'gemini-2.5-flash',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    description: "xAI's Grok models with real-time knowledge.",
    primaryEnvKey: 'XAI_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'XAI_MODEL',
    modelPlaceholder: 'grok-4',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: "Mistral's open-weight and frontier models.",
    primaryEnvKey: 'MISTRAL_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'MISTRAL_MODEL',
    modelPlaceholder: 'mistral-large-latest',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Strong reasoning models at low cost.',
    primaryEnvKey: 'DEEPSEEK_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'DEEPSEEK_MODEL',
    modelPlaceholder: 'deepseek-chat',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference for open-source models.',
    primaryEnvKey: 'GROQ_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'GROQ_MODEL',
    modelPlaceholder: 'llama-3.3-70b-versatile',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Search-augmented LLMs with online sources.',
    primaryEnvKey: 'PERPLEXITY_API_KEY',
    primaryPlaceholder: '',
    modelEnvKey: 'PERPLEXITY_MODEL',
    modelPlaceholder: 'sonar',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run open-source models locally or on a self-hosted endpoint.',
    primaryEnvKey: 'OLLAMA_BASE_URL',
    primaryPlaceholder: 'http://localhost:11434',
    keyIsPlaintext: true,
    modelEnvKey: 'OLLAMA_MODEL',
    modelPlaceholder: 'llama3.3',
  },
]

export const AI_PROVIDER_SECRET_ENV_KEYS = AI_PROVIDERS
  .filter((p) => !p.keyIsPlaintext)
  .map((p) => p.primaryEnvKey)

export const AI_PROVIDER_PLAINTEXT_ENV_KEYS = [
  ...AI_PROVIDERS.filter((p) => p.keyIsPlaintext).map((p) => p.primaryEnvKey),
  ...AI_PROVIDERS.map((p) => p.modelEnvKey),
]
