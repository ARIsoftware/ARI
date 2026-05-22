// Provider error redaction
//
// The cloud-storage SDKs surface error messages that include bucket names,
// object keys, and request ids. Logging those raw leaks PII (the key prefix
// contains the user id) and storage configuration detail. This helper turns
// any provider error into a stable code for the response + a separate object
// safe to log with `console.error`.
//
// Usage in a route handler:
//   try {
//     await storage.upload(...)
//   } catch (err) {
//     const redacted = redactProviderError('supabase', 'upload', err)
//     console.error('[documents]', redacted.log)
//     throw new Error(redacted.code)
//   }

export type ProviderName = 'supabase' | 'r2' | 's3' | 'local'
export type ProviderOp = 'upload' | 'download' | 'sign' | 'delete' | 'exists'

export interface RedactedError {
  code: string
  log: {
    provider: ProviderName
    op: ProviderOp
    // SDKs sometimes attach a non-PII status code or AWS error name; keep those.
    status?: number | string
    name?: string
  }
}

export function redactProviderError(
  provider: ProviderName,
  op: ProviderOp,
  err: unknown
): RedactedError {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; statusCode?: number }
  return {
    code: `${provider}_${op}_failed`,
    log: {
      provider,
      op,
      status: e?.$metadata?.httpStatusCode ?? e?.statusCode,
      name: e?.name,
    },
  }
}

// Wrap a provider operation so any thrown error is logged with a redacted
// payload and re-thrown as a stable code. Avoids repeating try/catch in each
// provider method.
export async function withProviderRedaction<T>(
  provider: ProviderName,
  op: ProviderOp,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const redacted = redactProviderError(provider, op, err)
    console.error('[documents]', redacted.log)
    throw new Error(redacted.code)
  }
}
