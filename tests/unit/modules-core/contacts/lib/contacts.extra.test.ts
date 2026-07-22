/**
 * Extra coverage for contacts/lib/contacts.ts.
 *
 * Targets uncovered branches:
 * - getContacts: fallback message when no .error key (line 23)
 * - getContact: fallback message when no .error key (line 36)
 * - createContact: fallback message (line 57)
 * - updateContact: fallback message (line 77)
 * - deleteContact: fallback message (line 91)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
} from '@/modules-core/contacts/lib/contacts'

function mockFetch(response: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(response),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('contacts fallback error messages', () => {
  it('getContacts throws fallback when no .error key', async () => {
    mockFetch({}, false)
    await expect(getContacts()).rejects.toThrow('Failed to fetch contacts')
  })

  it('getContact throws fallback when no .error key', async () => {
    mockFetch({}, false)
    await expect(getContact('id')).rejects.toThrow('Failed to fetch contact')
  })

  it('createContact throws fallback when no .error key', async () => {
    mockFetch({}, false)
    const input = { name: 'A', email: 'a@b.com', phone: null, category: '', description: null, company: null, address: null, website: null, birthday: null, next_contact_date: null }
    await expect(createContact(input)).rejects.toThrow('Failed to create contact')
  })

  it('updateContact throws fallback when no .error key', async () => {
    mockFetch({}, false)
    await expect(updateContact('id', {})).rejects.toThrow('Failed to update contact')
  })

  it('deleteContact throws fallback when no .error key', async () => {
    mockFetch({}, false)
    await expect(deleteContact('id')).rejects.toThrow('Failed to delete contact')
  })
})
