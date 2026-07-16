/**
 * Advisor avatar palette. Colors are intentional illustrative accents (stable
 * per advisor, stored on the row) — surrounding chrome uses semantic tokens.
 */
const ADVISOR_COLORS = [
  '#e11d48', // rose
  '#ea580c', // orange
  '#d97706', // amber
  '#65a30d', // lime
  '#059669', // emerald
  '#0d9488', // teal
  '#0284c7', // sky
  '#4f46e5', // indigo
  '#7c3aed', // violet
  '#c026d3', // fuchsia
  '#db2777', // pink
  '#64748b', // slate
] as const

export function pickAdvisorColor(existingCount: number): string {
  return ADVISOR_COLORS[existingCount % ADVISOR_COLORS.length]
}

/** "Steve Jobs" → "SJ", "Oprah" → "OP". */
export function advisorInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function errorDescription(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Please try again.'
}

/** Standard destructive-toast payload for mutation onError callbacks. */
export function destructiveToast(title: string, err: unknown) {
  return { variant: 'destructive' as const, title, description: errorDescription(err) }
}
