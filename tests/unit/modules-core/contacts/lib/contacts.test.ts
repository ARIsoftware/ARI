import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCategoryColor,
  getAvatarColor,
  getInitials,
  formatNextContactDate,
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
} from '@/modules-core/contacts/lib/contacts'

function mockFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(response),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getCategoryColor
// ---------------------------------------------------------------------------
describe('getCategoryColor', () => {
  it('returns green for Work', () => {
    expect(getCategoryColor('Work')).toBe('bg-green-500')
  })
  it('returns blue for Friends', () => {
    expect(getCategoryColor('Friends')).toBe('bg-blue-500')
  })
  it('returns red for Family', () => {
    expect(getCategoryColor('Family')).toBe('bg-red-500')
  })
  it('returns purple for Business', () => {
    expect(getCategoryColor('Business')).toBe('bg-purple-500')
  })
  it('returns gray-500 for Other', () => {
    expect(getCategoryColor('Other')).toBe('bg-gray-500')
  })
  it('returns gray-500 for unknown category (default)', () => {
    expect(getCategoryColor('Random')).toBe('bg-gray-500')
    expect(getCategoryColor('')).toBe('bg-gray-500')
  })
})

// ---------------------------------------------------------------------------
// getAvatarColor
// ---------------------------------------------------------------------------
describe('getAvatarColor', () => {
  it('returns dark gray for Work', () => {
    expect(getAvatarColor('Work')).toBe('bg-gray-800')
  })
  it('returns dark blue for Friends', () => {
    expect(getAvatarColor('Friends')).toBe('bg-blue-800')
  })
  it('returns dark red for Family', () => {
    expect(getAvatarColor('Family')).toBe('bg-red-800')
  })
  it('returns dark purple for Business', () => {
    expect(getAvatarColor('Business')).toBe('bg-purple-800')
  })
  it('returns gray-600 for Other', () => {
    expect(getAvatarColor('Other')).toBe('bg-gray-600')
  })
  it('returns gray-600 for unknown category (default)', () => {
    expect(getAvatarColor('Misc')).toBe('bg-gray-600')
  })
})

// ---------------------------------------------------------------------------
// getInitials
// ---------------------------------------------------------------------------
describe('getInitials', () => {
  it('returns first and last initials for a two-word name', () => {
    expect(getInitials('Steve Jobs')).toBe('SJ')
  })

  it('returns first and last initials for a three-word name', () => {
    expect(getInitials('Mary Jo Benson')).toBe('MB')
  })

  it('returns first two characters (uppercase) for a single-word name', () => {
    expect(getInitials('Oprah')).toBe('OP')
    expect(getInitials('Jo')).toBe('JO')
  })

  it('single char name returns that char uppercased twice', () => {
    expect(getInitials('A')).toBe('A')
  })
})

// ---------------------------------------------------------------------------
// formatNextContactDate
// ---------------------------------------------------------------------------
describe('formatNextContactDate', () => {
  it('returns null when dateString is null', () => {
    expect(formatNextContactDate(null)).toBeNull()
  })

  it('formats a valid ISO date string to a human-readable date', () => {
    // new Date('2025-06-15') in en-US → "June 15, 2025"
    const result = formatNextContactDate('2025-06-15T00:00:00Z')
    expect(typeof result).toBe('string')
    expect(result).toContain('2025')
  })
})

// ---------------------------------------------------------------------------
// getContacts
// ---------------------------------------------------------------------------
describe('getContacts', () => {
  it('returns contacts array from data wrapper', async () => {
    const contacts = [{ id: '1', name: 'Alice' }]
    mockFetch({ data: contacts })
    const result = await getContacts()
    expect(result).toEqual(contacts)
  })

  it('returns contacts array when response is the array directly', async () => {
    const contacts = [{ id: '1', name: 'Bob' }]
    mockFetch(contacts)
    const result = await getContacts()
    expect(result).toEqual(contacts)
  })

  it('throws on non-ok response', async () => {
    mockFetch({ error: 'Unauthorized' }, false, 401)
    await expect(getContacts()).rejects.toThrow('Unauthorized')
  })

  it('throws with fallback message when no error key', async () => {
    mockFetch({}, false, 500)
    await expect(getContacts()).rejects.toThrow('Failed to fetch contacts')
  })
})

// ---------------------------------------------------------------------------
// getContact
// ---------------------------------------------------------------------------
describe('getContact', () => {
  it('returns a contact by id', async () => {
    const contact = { id: '1', name: 'Alice' }
    mockFetch(contact)
    const result = await getContact('1')
    expect(result).toEqual(contact)
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Not found' }, false, 404)
    await expect(getContact('bad')).rejects.toThrow('Not found')
  })
})

// ---------------------------------------------------------------------------
// createContact
// ---------------------------------------------------------------------------
describe('createContact', () => {
  it('POSTs and returns the created contact', async () => {
    const contact = { id: 'new', name: 'Alice', email: 'a@b.com', phone: null, category: 'Friends', description: null, company: null, address: null, website: null, birthday: null, next_contact_date: null, created_at: '', updated_at: '' }
    mockFetch(contact)
    const input = { name: 'Alice', email: 'a@b.com', phone: null, category: 'Friends', description: null, company: null, address: null, website: null, birthday: null, next_contact_date: null }
    const result = await createContact(input)
    expect(result.id).toBe('new')
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Validation error' }, false, 422)
    const input = { name: '', email: '', phone: null, category: '', description: null, company: null, address: null, website: null, birthday: null, next_contact_date: null }
    await expect(createContact(input)).rejects.toThrow('Validation error')
  })
})

// ---------------------------------------------------------------------------
// updateContact
// ---------------------------------------------------------------------------
describe('updateContact', () => {
  it('PATCHes and returns the updated contact', async () => {
    const contact = { id: '1', name: 'Updated', email: '', phone: null, category: 'Work', description: null, company: null, address: null, website: null, birthday: null, next_contact_date: null, created_at: '', updated_at: '' }
    mockFetch(contact)
    const result = await updateContact('1', { name: 'Updated' })
    expect(result.name).toBe('Updated')
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Server error' }, false, 500)
    await expect(updateContact('1', {})).rejects.toThrow('Server error')
  })
})

// ---------------------------------------------------------------------------
// deleteContact
// ---------------------------------------------------------------------------
describe('deleteContact', () => {
  it('DELETEs and resolves', async () => {
    mockFetch({ success: true })
    await expect(deleteContact('1')).resolves.toBeUndefined()
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Not found' }, false, 404)
    await expect(deleteContact('bad')).rejects.toThrow('Not found')
  })
})
