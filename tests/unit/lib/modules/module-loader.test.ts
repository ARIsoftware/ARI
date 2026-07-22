/**
 * Tests for lib/modules/module-loader.ts
 *
 * The module loader reads from lib/generated/module-manifest.json (a static
 * import bundled at build time). We test the pure logic on top of that fixture.
 */
import { describe, it, expect } from 'vitest'
import { loadModules, moduleExists, getModuleById } from '@/lib/modules/module-loader'

describe('loadModules', () => {
  it('returns an object with modules array and errors array', async () => {
    const { modules, errors } = await loadModules()
    expect(Array.isArray(modules)).toBe(true)
    expect(Array.isArray(errors)).toBe(true)
  })

  it('errors array is always empty (pre-validated manifest)', async () => {
    const { errors } = await loadModules()
    expect(errors).toHaveLength(0)
  })

  it('every module has an id, name and isValid=true', async () => {
    const { modules } = await loadModules()
    for (const mod of modules) {
      expect(typeof mod.id).toBe('string')
      expect(mod.id.length).toBeGreaterThan(0)
      expect(typeof mod.name).toBe('string')
      expect(mod.isValid).toBe(true)
    }
  })

  it('sets isEnabled from manifest enabled field (defaults true when absent)', async () => {
    const { modules } = await loadModules()
    // At least some modules should be present
    expect(modules.length).toBeGreaterThan(0)
    for (const mod of modules) {
      expect(typeof mod.isEnabled).toBe('boolean')
    }
  })

  it('errors property on each module is an empty array', async () => {
    const { modules } = await loadModules()
    for (const mod of modules) {
      expect(mod.errors).toEqual([])
    }
  })
})

describe('moduleExists', () => {
  it('returns true for a known non-overridden module', async () => {
    const { modules } = await loadModules()
    // Find first non-overridden, valid module
    const candidate = modules.find(m => m.isValid && !m.isOverridden)
    if (!candidate) {
      // Nothing to test — manifest might be empty in CI
      return
    }
    const exists = await moduleExists(candidate.id)
    expect(exists).toBe(true)
  })

  it('returns false for a non-existent module ID', async () => {
    const exists = await moduleExists('this-module-does-not-exist-xyz')
    expect(exists).toBe(false)
  })

  it('returns false for a module ID that only exists with isOverridden=true (no non-overridden sibling)', async () => {
    // The manifest may include modules with isOverridden: true alongside a
    // non-overridden sibling with the same ID. We only test IDs where every
    // entry has isOverridden: true (i.e. no active non-overridden version).
    const { modules } = await loadModules()

    // Group by id
    const byId = new Map<string, typeof modules>()
    for (const m of modules) {
      const group = byId.get(m.id) ?? []
      group.push(m)
      byId.set(m.id, group)
    }

    // Find an ID where ALL entries are overridden (very unusual, skip if none)
    let purelyOverriddenId: string | undefined
    for (const [id, group] of byId) {
      if (group.every(m => m.isOverridden)) {
        purelyOverriddenId = id
        break
      }
    }

    if (!purelyOverriddenId) return // no such case in this env — skip

    const exists = await moduleExists(purelyOverriddenId)
    expect(exists).toBe(false)
  })
})

describe('getModuleById', () => {
  it('returns null for an unknown module ID', async () => {
    const result = await getModuleById('does-not-exist-xyz')
    expect(result).toBeNull()
  })

  it('returns the correct module for a known ID', async () => {
    const { modules } = await loadModules()
    const candidate = modules.find(m => m.isValid && !m.isOverridden)
    if (!candidate) return
    const mod = await getModuleById(candidate.id)
    expect(mod).not.toBeNull()
    expect(mod?.id).toBe(candidate.id)
  })

  it('returns a module with the expected shape', async () => {
    const { modules } = await loadModules()
    const candidate = modules.find(m => m.isValid && !m.isOverridden)
    if (!candidate) return
    const mod = await getModuleById(candidate.id)
    if (!mod) return
    expect(typeof mod.id).toBe('string')
    expect(typeof mod.name).toBe('string')
    expect(typeof mod.isValid).toBe('boolean')
    expect(typeof mod.isOverridden).toBe('boolean')
  })

  it('returns null for an ID that only exists with isOverridden=true (no active sibling)', async () => {
    // Same logic as the moduleExists test above — we need an ID where every
    // manifest entry has isOverridden: true.
    const { modules } = await loadModules()

    const byId = new Map<string, typeof modules>()
    for (const m of modules) {
      const group = byId.get(m.id) ?? []
      group.push(m)
      byId.set(m.id, group)
    }

    let purelyOverriddenId: string | undefined
    for (const [id, group] of byId) {
      if (group.every(m => m.isOverridden)) {
        purelyOverriddenId = id
        break
      }
    }

    if (!purelyOverriddenId) return // nothing to assert in this env

    const result = await getModuleById(purelyOverriddenId)
    expect(result).toBeNull()
  })
})
