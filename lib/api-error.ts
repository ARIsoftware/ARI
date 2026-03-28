/**
 * Returns a safe error message, hiding internal details in production.
 */
export function safeErrorResponse(error: unknown): string {
  if (process.env.NODE_ENV !== 'production') {
    return error instanceof Error ? error.message : 'Internal server error'
  }
  return 'Internal server error'
}
