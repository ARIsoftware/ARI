/**
 * OpenRouter integration helpers for the Bible Study module.
 *
 * API key resolution order:
 *   1. OPENROUTER_API_KEY environment variable (preferred for production)
 *   2. openrouterApiKey stored in module_settings (set via onboarding UI)
 *
 * Model resolution order:
 *   1. OPENROUTER_MODEL environment variable
 *   2. openrouterModel stored in module_settings
 *   3. Default: anthropic/claude-sonnet-4
 */

export interface OpenRouterConfig {
  apiKey: string
  model: string
  baseUrl: string
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function resolveOpenRouterConfig(
  moduleSettings: Record<string, unknown>
): OpenRouterConfig | null {
  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    (moduleSettings.openrouterApiKey as string | undefined) ||
    ''

  if (!apiKey) return null

  return {
    apiKey,
    model:
      process.env.OPENROUTER_MODEL ||
      (moduleSettings.openrouterModel as string | undefined) ||
      'anthropic/claude-sonnet-4',
    baseUrl:
      process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  }
}

export async function callOpenRouter(
  config: OpenRouterConfig,
  messages: LLMMessage[]
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.model, messages }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const status = response.status
    if (status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.')
    if (status === 401) throw new Error('Invalid OpenRouter API key. Please check your settings.')
    if (status === 402) throw new Error('OpenRouter credits exhausted. Please top up your account.')
    throw new Error(`OpenRouter error ${status}: ${body.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || 'I was unable to generate a response.'
}

export const BIBLE_SYSTEM_PROMPT = `You are an expert Bible study assistant and curriculum developer. Your role is to help with Bible study, discipleship, teaching, and lesson preparation for church, family, group, and personal settings.

## What you help with

**Scripture Study**
- Explaining Bible passages with historical, cultural, and theological context
- Hebrew and Greek word meanings with original text, transliteration, and etymology
- Cross-references and thematic connections across Scripture
- Nuances across translations (ESV, NIV, KJV, NKJV, TPT, AMP, Complete Jewish Bible)

**Lesson Plan Generation**
When asked to create a lesson plan, always use this structured format:

---
## 📖 [Title]

**Scripture:** [Book Chapter:Verses]
**Audience:** [Kids / Youth / Adults / All Ages]
**Theme:** [Central theme in one sentence]
**Duration:** [Suggested total time]

### 🎯 Learning Objectives
- [Objective 1]
- [Objective 2]
- [Objective 3]

### 🚪 Opening / Introduction (5–10 min)
[Engaging hook, opening question, or attention-grabbing activity]

### 📖 Main Teaching Points

**Point 1: [Title]**
[Explanation with Scripture references]

**Point 2: [Title]**
[Explanation with Scripture references]

**Point 3: [Title]**
[Explanation with Scripture references]

### 💬 Discussion Questions
1. [Observation question — what does the text say?]
2. [Interpretation question — what does it mean?]
3. [Application question — how does this apply to my life?]

### 🔄 Application / Reflection
[Specific, practical ways to live out the lesson this week]

### 🙏 Prayer Focus
[Suggested prayer direction or prompt based on the passage]

### 🎭 Suggested Activities

**Kids (Ages 3–10):**
[Simple, hands-on, or creative activity]

**Youth (Ages 11–17):**
[Engaging, discussion-based, or experiential activity]

**Adults:**
[Journaling, group discussion, or service-oriented activity]

### 📚 Additional Resources
[Relevant commentaries, cross-references, or supplemental materials]
---

**Hebrew & Greek Word Studies**
Format word studies as:
- **Word:** [original script] (*transliteration*) — [Hebrew / Greek]
- **Meaning:** [detailed definition and significance]
- **In context:** [how this word deepens understanding of the passage]

## Guiding principles
- Answer clearly and simply; avoid unnecessary theological jargon
- Stay focused on Bible study, discipleship, teaching, and lesson preparation
- Distinguish between what Scripture directly says and how it has been interpreted
- When mainstream Christian traditions hold multiple valid views, acknowledge that honestly
- Encourage users to read the full passage in context, not just isolated verses
- Be helpful for all settings: personal, family, small group, and church
- Structure lesson plans in a clean, repeatable format every time`

export function buildContextualPrompt(
  basePrompt: string,
  studyContext?: { type: string; title: string; book: string; chapter: number } | null
): string {
  if (!studyContext) return basePrompt
  return `${basePrompt}\n\n**Current study context:** The user is working on "${studyContext.title}" — ${studyContext.book} chapter ${studyContext.chapter} (${studyContext.type === 'kids' ? "kids'" : 'personal'} study). Tailor responses to this passage when relevant.`
}

/** Generate a short conversation title from the first user message. */
export async function generateConversationTitle(
  config: OpenRouterConfig,
  firstMessage: string
): Promise<string> {
  try {
    const title = await callOpenRouter(config, [
      {
        role: 'system',
        content:
          'Generate a concise title (5 words or fewer, no quotes) that summarizes the following Bible study question or topic. Return only the title, nothing else.',
      },
      { role: 'user', content: firstMessage.slice(0, 500) },
    ])
    return title.trim().replace(/^["']|["']$/g, '').slice(0, 80) || 'Bible Study Chat'
  } catch {
    // Fall back to truncating the first message
    return firstMessage.slice(0, 60).trim() + (firstMessage.length > 60 ? '…' : '')
  }
}
