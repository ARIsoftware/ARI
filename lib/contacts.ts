import { supabase, type Contact } from "./supabase"

export type { Contact }

export async function getContacts(): Promise<Contact[]> {
  console.log("Fetching contacts from database...")
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("first_name", { ascending: true })

  if (error) {
    console.error("Error fetching contacts:", error)
    throw error
  }

  console.log("Successfully fetched contacts:", data?.length || 0)
  return data || []
}

export async function getContact(id: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching contact:", error)
    throw error
  }

  return data
}

export async function createContact(contact: Omit<Contact, "id" | "created_at" | "updated_at">): Promise<Contact> {
  console.log("Creating contact:", contact)
  
  const { data, error } = await supabase
    .from("contacts")
    .insert([contact])
    .select()
    .single()

  if (error) {
    console.error("Error creating contact:", error)
    throw error
  }

  console.log("Successfully created contact:", data)
  return data
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<Contact> {
  console.log("Updating contact:", id, updates)
  
  const { data, error } = await supabase
    .from("contacts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating contact:", error)
    throw error
  }

  console.log("Successfully updated contact:", data)
  return data
}

export async function deleteContact(id: string): Promise<void> {
  console.log("Deleting contact:", id)
  
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Error deleting contact:", error)
    throw error
  }

  console.log("Successfully deleted contact:", id)
}

export async function toggleContactFavorite(id: string): Promise<Contact> {
  // First get the current contact
  const { data: currentContact, error: fetchError } = await supabase
    .from("contacts")
    .select("favorite")
    .eq("id", id)
    .single()

  if (fetchError) {
    console.error("Error fetching contact:", fetchError)
    throw fetchError
  }

  return updateContact(id, {
    favorite: !currentContact.favorite,
  })
}

export async function searchContacts(query: string): Promise<Contact[]> {
  console.log("Searching contacts:", query)
  
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%,job_title.ilike.%${query}%`)
    .order("first_name", { ascending: true })

  if (error) {
    console.error("Error searching contacts:", error)
    throw error
  }

  return data || []
}

export async function getContactsByTag(tag: string): Promise<Contact[]> {
  console.log("Getting contacts by tag:", tag)
  
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .contains("tags", [tag])
    .order("first_name", { ascending: true })

  if (error) {
    console.error("Error getting contacts by tag:", error)
    throw error
  }

  return data || []
}

export async function getFavoriteContacts(): Promise<Contact[]> {
  console.log("Getting favorite contacts...")
  
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("favorite", true)
    .order("first_name", { ascending: true })

  if (error) {
    console.error("Error getting favorite contacts:", error)
    throw error
  }

  return data || []
}

export async function getAllTags(): Promise<string[]> {
  console.log("Getting all tags...")
  
  const { data, error } = await supabase
    .from("contacts")
    .select("tags")

  if (error) {
    console.error("Error getting tags:", error)
    throw error
  }

  // Extract all unique tags
  const allTags = new Set<string>()
  data?.forEach(contact => {
    contact.tags?.forEach((tag: string) => allTags.add(tag))
  })

  return Array.from(allTags).sort()
}

// Utility function to get contact's full name
export function getContactFullName(contact: Contact): string {
  return `${contact.first_name} ${contact.last_name}`.trim()
}

// Utility function to get contact's initials for avatar
export function getContactInitials(contact: Contact): string {
  const firstName = contact.first_name?.charAt(0)?.toUpperCase() || ""
  const lastName = contact.last_name?.charAt(0)?.toUpperCase() || ""
  return `${firstName}${lastName}`
}