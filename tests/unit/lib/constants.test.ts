import { describe, it, expect } from 'vitest'
import { INTEGRATIONS_MODULE_ID, API_INTEGRATIONS_DOCS_URL } from '@/lib/constants'

describe('constants', () => {
  it('INTEGRATIONS_MODULE_ID is "integrations"', () => {
    expect(INTEGRATIONS_MODULE_ID).toBe('integrations')
  })

  it('API_INTEGRATIONS_DOCS_URL is a valid https URL', () => {
    expect(API_INTEGRATIONS_DOCS_URL).toMatch(/^https:\/\//)
  })

  it('API_INTEGRATIONS_DOCS_URL points to ari.software docs', () => {
    expect(API_INTEGRATIONS_DOCS_URL).toContain('ari.software')
  })
})
