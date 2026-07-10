/**
 * Morning Brief Module - Greeting API
 *
 * GET /api/modules/morning-brief/greeting?taskCount=&meetingCount=
 *
 * Returns the brief's opening: a "Good Morning {name}" line plus an
 * AI-written motivational message. The motivational message is generated ONCE
 * per calendar day (in the user's timezone) and cached in
 * morning_brief_greetings; every later visit that day reuses it. The greeting
 * line itself is rebuilt fresh each request so a name change reflects instantly.
 *
 * Tasks and calendar items are intentionally NOT part of this cache — the page
 * fetches those live on every visit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { greetingQuerySchema, GreetingResponseSchema } from '@/modules/morning-brief/lib/validation'
import { getProviderCredentials } from '@/modules/morning-brief/lib/provider-keys'
import { callLLM } from '@/modules/morning-brief/lib/llm-clients'
import { getLocalDateString } from '@/modules/morning-brief/lib/google'
import { AI_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { moduleSettings, userPreferences, morningBriefGreetings } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

const MODULE_ID = 'morning-brief'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/greeting',
  operationId: 'getMorningBriefGreeting',
  summary: "Get today's cached greeting + motivational message (generated via the selected AI provider)",
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  request: { query: greetingQuerySchema },
  responses: {
    200: { description: "Today's greeting", content: { 'application/json': { schema: GreetingResponseSchema } } },
    400: { description: 'No AI provider selected / no API key / validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    502: { description: 'Upstream AI provider error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

function firstName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0]
}

function buildGreetingLine(name: string | null): string {
  return name ? `Good Morning ${name}.` : 'Good Morning.'
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, greetingQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }
    const taskCount = queryValidation.data.taskCount ?? 0
    const meetingCount = queryValidation.data.meetingCount ?? 0

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Name + timezone from the /settings "Name" and "Timezone" fields.
    const prefsRows = await withRLS((db) =>
      db.select({ name: userPreferences.name, timezone: userPreferences.timezone })
        .from(userPreferences)
        .where(eq(userPreferences.userId, user.id))
        .limit(1)
    )
    const prefs = prefsRows[0]
    const timezone = prefs?.timezone || 'UTC'
    const displayName = firstName(prefs?.name)
      ?? firstName(user.user_metadata?.full_name)
      ?? firstName(user.user_metadata?.first_name)
    const greeting = buildGreetingLine(displayName)

    // The cache key needs the timezone-derived date, so this read depends on the
    // prefs read above — a single indexed (user_id, brief_date) lookup.
    const briefDate = getLocalDateString(timezone)

    type GreetingRow = { message: string; provider: string | null; model: string | null }
    const loadCached = () =>
      withRLS((db) =>
        db.select({ message: morningBriefGreetings.message, provider: morningBriefGreetings.provider, model: morningBriefGreetings.model })
          .from(morningBriefGreetings)
          .where(and(eq(morningBriefGreetings.userId, user.id), eq(morningBriefGreetings.briefDate, briefDate)))
          .limit(1)
      )
    const respond = (row: GreetingRow, cached: boolean) =>
      NextResponse.json({ greeting, message: row.message, brief_date: briefDate, cached, provider: row.provider, model: row.model })

    const cachedRows = await loadCached()
    if (cachedRows[0]) {
      return respond(cachedRows[0], true)
    }

    // No cache yet → generate with the user's selected AI provider. Explicit
    // user_id filter is mandatory (BYPASSRLS — see docs/SECURITY.md).
    const settingsRows = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, MODULE_ID)))
        .limit(1)
    )
    const settings = (settingsRows[0]?.settings ?? {}) as {
      selectedAiProvider?: AiProviderId | null
      aiProviderModels?: Partial<Record<AiProviderId, string>>
    }
    const provider = settings.selectedAiProvider ?? null

    if (!provider) {
      return createErrorResponse('No AI provider selected. Choose one in Morning Brief settings.', 400)
    }
    if (!AI_PROVIDERS.some((p) => p.id === provider)) {
      return createErrorResponse('Selected AI provider is not recognized', 400)
    }

    const { apiKey, model } = await getProviderCredentials(
      user.id,
      provider,
      settings.aiProviderModels?.[provider],
    )
    if (!apiKey) {
      return createErrorResponse('The selected AI provider has no API key configured. Add one under Settings → Integrations.', 400)
    }

    let message: string
    try {
      const result = await callLLM({
        provider,
        apiKey,
        model,
        maxTokens: 200,
        system:
          'You are a warm, articulate executive secretary writing the opening lines of your principal\'s morning brief. ' +
          'Your tone is encouraging, composed, and quietly confident — never cheesy or over-eager. You have already organized their day for them.',
        prompt:
          `Write ONE short motivational message (1–2 sentences, ~40 words max) to open today's brief. ` +
          `Today there are ${taskCount} priority task(s) and ${meetingCount} meeting(s) scheduled. ` +
          `Reference the day's load naturally when it helps (a full day vs. an open one). ` +
          `Do NOT include a greeting, the words "good morning", or the person's name — those are added separately. ` +
          `Output only the message text, with no surrounding quotes.`,
      })
      message = result.text.replace(/^["'\s]+|["'\s]+$/g, '').trim()
    } catch (err) {
      console.error('morning-brief greeting upstream error:', err instanceof Error ? err.message : err)
      return createErrorResponse('The AI provider failed to write the brief. Check the API key and model.', 502)
    }

    // Cache it. onConflictDoNothing handles the race where two morning visits
    // land at once — the loser just keeps the message it already generated.
    const inserted = await withRLS((db) =>
      db.insert(morningBriefGreetings)
        .values({ userId: user.id, briefDate, greeting, message, provider, model })
        .onConflictDoNothing({ target: [morningBriefGreetings.userId, morningBriefGreetings.briefDate] })
        .returning({ message: morningBriefGreetings.message })
    )

    // If a concurrent request won the insert, return the stored value for consistency.
    if (inserted.length === 0) {
      const winner = await loadCached()
      if (winner[0]) {
        return respond(winner[0], true)
      }
    }

    return respond({ message, provider, model }, false)
  } catch (error) {
    console.error('GET /api/modules/morning-brief/greeting error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
