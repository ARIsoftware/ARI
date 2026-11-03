/** Welcome-screen content: a time-of-day greeting. */

export function greeting(now: Date, firstName?: string | null): string {
  const hour = now.getHours()
  const part = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const name = firstName?.trim()
  return name ? `${part}, ${name}` : part
}
