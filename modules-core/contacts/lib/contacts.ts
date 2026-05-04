export type Contact = {
  id: string
  name: string
  email: string
  phone: string | null
  category: string
  description: string | null
  company: string | null
  address: string | null
  website: string | null
  birthday: string | null
  next_contact_date: string | null
  created_at: string
  updated_at: string
}

export async function getContacts(): Promise<Contact[]> {
  const response = await fetch('/api/modules/contacts')

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching contacts:", error)
    throw new Error(error.error || 'Failed to fetch contacts')
  }

  const result = await response.json()
  return result.data ?? result
}

export async function getContact(id: string): Promise<Contact | null> {
  const response = await fetch(`/api/modules/contacts/${id}`)

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching contact:", error)
    throw new Error(error.error || 'Failed to fetch contact')
  }

  return await response.json()
}

export async function createContact(
  contact: Omit<Contact, "id" | "created_at" | "updated_at">,
): Promise<Contact> {
  const response = await fetch('/api/modules/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contact }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating contact:", error)
    throw new Error(error.error || 'Failed to create contact')
  }

  return await response.json()
}

export async function updateContact(
  id: string,
  updates: Partial<Omit<Contact, "id" | "created_at" | "updated_at">>,
): Promise<Contact> {
  const response = await fetch(`/api/modules/contacts/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contact: updates }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating contact:", error)
    throw new Error(error.error || 'Failed to update contact')
  }

  return await response.json()
}

export async function deleteContact(id: string): Promise<void> {
  const response = await fetch(`/api/modules/contacts/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting contact:", error)
    throw new Error(error.error || 'Failed to delete contact')
  }
}

// Helper function to get category color
export function getCategoryColor(category: string): string {
  switch (category) {
    case "Work":
      return "bg-green-500"
    case "Friends":
      return "bg-blue-500"
    case "Family":
      return "bg-red-500"
    case "Business":
      return "bg-purple-500"
    case "Other":
      return "bg-gray-500"
    default:
      return "bg-gray-500"
  }
}

// Helper function to get avatar background color
export function getAvatarColor(category: string): string {
  switch (category) {
    case "Work":
      return "bg-gray-800"
    case "Friends":
      return "bg-blue-800"
    case "Family":
      return "bg-red-800"
    case "Business":
      return "bg-purple-800"
    case "Other":
      return "bg-gray-600"
    default:
      return "bg-gray-600"
  }
}

// Helper function to get initials from name
export function getInitials(name: string): string {
  const parts = name.split(" ")
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

// Helper function to format date for display
export function formatNextContactDate(dateString: string | null): string | null {
  if (!dateString) return null
  
  const date = new Date(dateString)
  const options: Intl.DateTimeFormatOptions = { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  }
  
  return date.toLocaleDateString('en-US', options)
}