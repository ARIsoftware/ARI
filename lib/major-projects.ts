export interface MajorProject {
  id: string
  user_id: string
  project_name: string
  project_description: string | null
  project_due_date: string | null
  created_at: string
  updated_at: string
}

export async function getMajorProjects(): Promise<MajorProject[]> {
  const response = await fetch('/api/major-projects', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch major projects')
  }

  return response.json()
}

export async function createMajorProject(
  project_name: string,
  project_description: string | null,
  project_due_date: string | null
): Promise<MajorProject> {
  const response = await fetch('/api/major-projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_name,
      project_description,
      project_due_date,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create major project')
  }

  return response.json()
}

export async function updateMajorProject(
  id: string,
  project_name?: string,
  project_description?: string | null,
  project_due_date?: string | null
): Promise<MajorProject> {
  const response = await fetch(`/api/major-projects/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_name,
      project_description,
      project_due_date,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update major project')
  }

  return response.json()
}

export async function deleteMajorProject(id: string): Promise<void> {
  const response = await fetch(`/api/major-projects/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete major project')
  }
}
