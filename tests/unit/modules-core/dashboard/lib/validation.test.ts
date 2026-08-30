import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_LAYOUTS,
  DashboardSettingsSchema,
  DashboardSettingsSavedSchema,
} from '@/modules-core/dashboard/lib/validation'

describe('DASHBOARD_LAYOUTS', () => {
  it('contains default and boxy', () => {
    expect(DASHBOARD_LAYOUTS).toEqual(['default', 'boxy'])
  })
})

describe('DashboardSettingsSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(DashboardSettingsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts every known layout', () => {
    for (const layout of DASHBOARD_LAYOUTS) {
      expect(DashboardSettingsSchema.safeParse({ layout }).success).toBe(true)
    }
  })

  it('rejects an unknown layout value with a readable message', () => {
    const result = DashboardSettingsSchema.safeParse({ layout: 'grid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Layout must be 'default' or 'boxy'")
    }
  })

  it('rejects unknown keys (.strict())', () => {
    expect(DashboardSettingsSchema.safeParse({ layout: 'boxy', extra: true }).success).toBe(false)
  })

  it('rejects system-managed __-prefixed keys', () => {
    expect(DashboardSettingsSchema.safeParse({ __schema_installed_hash: 'abc' }).success).toBe(
      false,
    )
  })
})

describe('DashboardSettingsSavedSchema', () => {
  it('accepts { success: true }', () => {
    expect(DashboardSettingsSavedSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(DashboardSettingsSavedSchema.safeParse({ success: false }).success).toBe(false)
  })
})
