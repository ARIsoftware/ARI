// Wrapping quote-mark pairs to strip: straight/curly doubles and singles.
const QUOTE_PAIRS: Array<[string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ["'", "'"],
  ['‘', '’'],
]

/**
 * Remove quotation marks wrapping a stored quote so the brief can add its own
 * without doubling up ("The goal…" → The goal…). Only strips when BOTH ends
 * match a pair, and repeats for stacked wrapping (""text"").
 */
export function stripSurroundingQuotes(text: string): string {
  let out = text.trim()
  let changed = true
  while (changed && out.length >= 2) {
    changed = false
    for (const [open, close] of QUOTE_PAIRS) {
      if (out.startsWith(open) && out.endsWith(close)) {
        out = out.slice(open.length, -close.length).trim()
        changed = true
      }
    }
  }
  return out
}

/** Format the brief's date (YYYY-MM-DD, already the user's local day) for display. */
export function formatBriefDate(briefDate?: string): string {
  // Parse as local midnight so the weekday/day are taken from the date parts,
  // not shifted by the browser timezone.
  const date = briefDate ? new Date(`${briefDate}T00:00:00`) : new Date()
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
