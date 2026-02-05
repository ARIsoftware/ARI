// Retry helper with exponential backoff
import { logger } from '@/lib/logger'

interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  operationName?: string
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'operationName'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
}

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
  } = { ...DEFAULT_OPTIONS, ...options }

  const operationName = options.operationName || 'operation'

  let lastError: Error | undefined
  let delay = initialDelayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error

      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        logger.warn(`[Retry] ${operationName}: Non-retryable error, failing immediately: ${error.message}`)
        throw error
      }

      if (attempt < maxAttempts) {
        logger.warn(
          `[Retry] ${operationName}: Attempt ${attempt}/${maxAttempts} failed: ${error.message}. Retrying in ${delay}ms...`
        )
        await sleep(delay)
        delay = Math.min(delay * backoffMultiplier, maxDelayMs)
      } else {
        logger.error(
          `[Retry] ${operationName}: All ${maxAttempts} attempts failed. Last error: ${error.message}`
        )
      }
    }
  }

  throw lastError
}

/**
 * Check if an error should not be retried
 */
function isNonRetryableError(error: any): boolean {
  const message = error?.message?.toLowerCase() || ''
  const code = error?.code || ''

  // Don't retry on authentication/authorization errors
  if (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('access denied') ||
    message.includes('invalid credentials') ||
    code === '401' ||
    code === '403'
  ) {
    return true
  }

  // Don't retry on not found errors (these won't succeed on retry)
  if (
    message.includes('not found') ||
    message.includes('does not exist') ||
    code === '404'
  ) {
    return true
  }

  // Don't retry on validation errors
  if (
    message.includes('invalid') ||
    message.includes('malformed') ||
    code === '400'
  ) {
    return true
  }

  return false
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Create a timeout promise that rejects after the specified time
 */
export function createTimeout<T>(
  ms: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), ms)
  )
}

/**
 * Run an operation with a timeout
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    operation,
    createTimeout<T>(timeoutMs, errorMessage),
  ])
}
