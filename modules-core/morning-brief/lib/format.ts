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
