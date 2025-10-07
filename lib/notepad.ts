export interface Notepad {
  content: string
  updated_at: string | null
}

export interface NotepadRevision {
  id: string
  content: string
  created_at: string
  revision_number: number
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

export async function getNotepadRevisions(): Promise<NotepadRevision[]> {
  const response = await fetch('/api/notepad/revisions', {
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching notepad revisions:", error)
    throw new Error(error.error || 'Failed to fetch notepad revisions')
  }

  return await response.json()
}

export async function restoreNotepadRevision(revisionId: string): Promise<Notepad> {
  const response = await fetch('/api/notepad/revisions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ revision_id: revisionId }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error restoring notepad revision:", error)
    throw new Error(error.error || 'Failed to restore notepad revision')
  }

  return await response.json()
}