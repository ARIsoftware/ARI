/**
 * Tests for lib/branding.ts — login-logo upload constraints shared by the
 * branding API route and the Settings → Themes card.
 */
import { describe, it, expect } from 'vitest'
import {
  LOGIN_LOGO_MAX_MB,
  LOGIN_LOGO_MAX_BYTES,
  LOGIN_LOGO_ALLOWED_TYPES,
  LOGIN_LOGO_TYPE_LABEL,
  LOGIN_LOGO_ACCEPT,
  isAllowedLogoType,
} from '@/lib/branding'

describe('constants', () => {
  it('keeps the byte cap derived from the MB cap', () => {
    expect(LOGIN_LOGO_MAX_BYTES).toBe(LOGIN_LOGO_MAX_MB * 1024 * 1024)
  })

  it('accept attribute and label cover every allowed type', () => {
    expect(LOGIN_LOGO_ACCEPT).toBe(LOGIN_LOGO_ALLOWED_TYPES.join(','))
    expect(LOGIN_LOGO_TYPE_LABEL).toBe('PNG, JPEG, WebP, or GIF')
  })
})

describe('isAllowedLogoType', () => {
  it('accepts each allowed type, case-insensitively', () => {
    for (const type of LOGIN_LOGO_ALLOWED_TYPES) {
      expect(isAllowedLogoType(type)).toBe(true)
      expect(isAllowedLogoType(type.toUpperCase())).toBe(true)
    }
  })

  it('rejects everything else', () => {
    expect(isAllowedLogoType('image/svg+xml')).toBe(false) // scriptable — deliberately not allowed
    expect(isAllowedLogoType('application/pdf')).toBe(false)
    expect(isAllowedLogoType('')).toBe(false)
  })
})
