import { supabase, getAuthenticatedSupabase } from "./supabase"

export type Contact = {
  id: string
  name: string
  email: string
  phone: string
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

export async function getContacts(userId: string): Promise<Contact[]> {
  const client = await getAuthenticatedSupabase()
  const { data, error } = await client
    .from("contacts")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true })

  if (error) {
    console.error("Error fetching contacts:", error)
    throw error
  }

  return data || []
}

export async function getContact(id: string, userId: string): Promise<Contact | null> {
  const client = await getAuthenticatedSupabase()
  const { data, error } = await client
    .from("contacts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId) // Ensure user can only access their own contacts
    .single()

  if (error) {
    console.error("Error fetching contact:", error)
    throw error
  }

  return data
}

export async function createContact(
  contact: Omit<Contact, "id" | "created_at" | "updated_at">,
  userId: string
): Promise<Contact> {
  const client = await getAuthenticatedSupabase()
  const { data, error } = await client
    .from("contacts")
    .insert([{ ...contact, user_id: userId }])
    .select()
    .single()

  if (error) {
    console.error("Error creating contact:", error)
    throw error
  }

  return data
}

export async function updateContact(
  id: string,
  updates: Partial<Omit<Contact, "id" | "created_at" | "updated_at">>,
  userId: string
): Promise<Contact> {
  const client = await getAuthenticatedSupabase()
  const { data, error } = await client
    .from("contacts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId) // Ensure user can only update their own contacts
    .select()
    .single()

  if (error) {
    console.error("Error updating contact:", error)
    throw error
  }

  return data
}

export async function deleteContact(id: string, userId: string): Promise<void> {
  const client = await getAuthenticatedSupabase()
  const { error } = await client
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId) // Ensure user can only delete their own contacts

  if (error) {
    console.error("Error deleting contact:", error)
    throw error
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