/**
 * Morning Brief - ElevenLabs error decoding
 *
 * ElevenLabs returns HTTP 401 for several distinct conditions — an invalid key,
 * a restricted key missing the endpoint permission, AND an exhausted credit
 * quota — so the status code alone can't tell them apart. It does, however, put
 * a machine-readable reason in the JSON body (`detail.status` / `detail.message`),
 * which we surface so the user knows exactly what to fix.
 */
export function describeElevenLabsError(status: number, rawBody: string): string {
  let detailStatus: string | undefined
  let detailMessage: string | undefined
  try {
    const detail = (JSON.parse(rawBody) as { detail?: unknown })?.detail
    if (typeof detail === 'string') {
      detailMessage = detail
    } else if (detail && typeof detail === 'object') {
      const d = detail as { status?: unknown; message?: unknown }
      if (typeof d.status === 'string') detailStatus = d.status
      if (typeof d.message === 'string') detailMessage = d.message
    }
  } catch {
    // Non-JSON body — fall back to the status code alone.
  }
  const suffix = detailMessage ? `: ${detailMessage}` : ''

  if (detailStatus === 'quota_exceeded') {
    return `ElevenLabs is out of credits${suffix}. Add credits to your ElevenLabs account, then try again.`
  }
  if (detailStatus === 'missing_permissions') {
    return `Your ElevenLabs key is missing a required permission${suffix} (HTTP ${status}). Enable the needed endpoint on the key, or use an unrestricted key.`
  }
  if (detailStatus === 'invalid_api_key' || status === 401) {
    return `ElevenLabs rejected the key${suffix} (HTTP ${status}). Check it under Settings → AI Providers, and confirm the key's endpoint permissions and credit balance.`
  }
  return `ElevenLabs request failed${suffix} (HTTP ${status}).`
}
