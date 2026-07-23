export interface FriendlyChatError {
  title: string
  /** Friendly, plain-language explanation of what to do. */
  description: string
  /** The underlying provider/server message, shown verbatim for context. */
  detail?: string
  /** Whether to surface an "Open Integrations" call to action. */
  showIntegrations: boolean
}

const INTEGRATIONS_HINT = 'Please ensure your AI provider is configured correctly in Settings → Integrations.'

/** Recursively pull a human-readable `message` out of a parsed provider error body. */
function extractMessage(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  const o = obj as Record<string, unknown>
  if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
  if (o.error) return extractMessage(o.error)
  if (o.detail) return extractMessage(o.detail)
  return undefined
}

/**
 * Turn a raw chat error (e.g. `Provider request failed (401): {"type":"error",...}`)
 * into a friendly, actionable message while preserving the underlying provider text.
 */
export function humanizeChatError(raw: string): FriendlyChatError {
  const text = (raw || '').trim()

  const statusMatch = text.match(/\((\d{3})\)/)
  const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined

  // Pull out the provider's own message from any embedded JSON, else the trailing text.
  let detail: string | undefined
  const braceIdx = text.indexOf('{')
  if (braceIdx !== -1) {
    const jsonPart = text.slice(braceIdx)
    try {
      detail = extractMessage(JSON.parse(jsonPart))
    } catch {
      const m = jsonPart.match(/"message"\s*:\s*"([^"]+)"/)
      if (m) detail = m[1]
    }
  }
  if (!detail) {
    const stripped = text.replace(/^Provider request failed \(\d{3}\):\s*/i, '').trim()
    if (stripped && stripped !== text) detail = stripped
  }

  const haystack = `${detail ?? ''} ${text}`.toLowerCase()

  // Provider not configured at all (pre-flight 412 / create guard).
  if (status === 412 || /no api key configured|add an api key|not configured|configure your|provider configured/i.test(haystack)) {
    return {
      title: 'No AI provider configured',
      description: 'Add an API key for your provider in Settings → Integrations, then try again.',
      showIntegrations: true,
    }
  }

  // Invalid / expired / rejected key.
  if (status === 401 || status === 403 || /authentication|invalid x-api-key|incorrect api key|invalid api key|expired|unauthor|forbidden|permission|invalid_api_key/i.test(haystack)) {
    return {
      title: 'Your API key was rejected',
      description: `The provider says your API key is invalid or expired. ${INTEGRATIONS_HINT}`,
      detail,
      showIntegrations: true,
    }
  }

  // Throttling / quota / billing.
  if (status === 429 || /rate.?limit|too many requests|quota|insufficient_quota|insufficient.?(funds|credit|balance)|billing|payment/i.test(haystack)) {
    return {
      title: 'Rate limit or quota reached',
      description: 'Your provider is throttling requests, or your credit/quota is exhausted. Wait a moment, or check your plan and billing with the provider.',
      detail,
      showIntegrations: false,
    }
  }

  // Bad request — most often an unknown or unavailable model.
  if (status === 400 || status === 404 || /\bmodel\b|not.?found|does not exist|unsupported|invalid_request|not_found_error/i.test(haystack)) {
    return {
      title: 'The request was rejected',
      description: 'This usually means the selected model isn’t available for your account. Pick a different model in Chat → Settings, or double-check your provider setup.',
      detail,
      showIntegrations: true,
    }
  }

  // Provider-side outage / overload.
  if ((status !== undefined && status >= 500) || status === 529 || /overload|unavailable|temporarily|service|gateway|capacity|try again later/i.test(haystack)) {
    return {
      title: 'The AI provider is temporarily unavailable',
      description: 'The provider had trouble handling the request. Please try again in a moment.',
      detail,
      showIntegrations: false,
    }
  }

  // Couldn't reach the provider at all (network / timeout, no HTTP status).
  if (status === undefined && /failed to fetch|network|load failed|timeout|timed out|econn|enotfound|fetch failed/i.test(haystack)) {
    return {
      title: 'Couldn’t reach the AI provider',
      description: 'Check your internet connection and try again.',
      detail,
      showIntegrations: false,
    }
  }

  // Fallback.
  return {
    title: 'Something went wrong',
    description: `The AI provider returned an error. ${INTEGRATIONS_HINT}`,
    detail: detail ?? (text || undefined),
    showIntegrations: true,
  }
}
