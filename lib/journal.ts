export interface JournalEntry {
  id: string
  user_id: string
  entry_type: string
  limiting_thoughts: string | null
  barrier_behaviors: string | null
  stuck_emotions: string | null
  empowering_thoughts: string | null
  daily_behaviors: string | null
  reinforcement_practices: string | null
  future_feelings: string | null
  embody_now: string | null
  daily_actions: string | null
  created_at: string
  updated_at: string
}

export async function getJournalEntry(entryType: string, getToken: () => Promise<string | null>): Promise<JournalEntry | null> {
  const token = await getToken()

  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch(`/api/journal?entry_type=${encodeURIComponent(entryType)}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching journal entry:", error)
    throw new Error(error.error || 'Failed to fetch journal entry')
  }

  return await response.json()
}

export async function saveJournalEntry(entry: Partial<JournalEntry>, getToken: () => Promise<string | null>): Promise<JournalEntry> {
  const token = await getToken()

  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/journal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ entry }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error saving journal entry:", error)
    throw new Error(error.error || 'Failed to save journal entry')
  }

  return await response.json()
}
