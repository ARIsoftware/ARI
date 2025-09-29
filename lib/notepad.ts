export interface Notepad {
  content: string
  updated_at: string | null
}

export async function getNotepad(): Promise<Notepad> {
  const response = await fetch('/api/notepad', {
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching notepad:", error)
    throw new Error(error.error || 'Failed to fetch notepad')
  }

  return await response.json()
}

export async function saveNotepad(content: string): Promise<Notepad> {
  const response = await fetch('/api/notepad', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ content }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error saving notepad:", error)
    throw new Error(error.error || 'Failed to save notepad')
  }

  return await response.json()
}