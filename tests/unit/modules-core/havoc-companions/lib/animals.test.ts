import { describe, it, expect } from 'vitest'
import { ALL_SPECIES, SPECIES_LABEL, generateDefaultCompanions } from '@/modules-core/havoc-companions/lib/animals'

describe('ALL_SPECIES', () => {
  it('contains 12 species', () => {
    expect(ALL_SPECIES.length).toBe(12)
  })

  it('includes expected species', () => {
    expect(ALL_SPECIES).toContain('cat')
    expect(ALL_SPECIES).toContain('dog')
    expect(ALL_SPECIES).toContain('bunny')
    expect(ALL_SPECIES).toContain('fox')
    expect(ALL_SPECIES).toContain('hamster')
    expect(ALL_SPECIES).toContain('duck')
    expect(ALL_SPECIES).toContain('panda')
    expect(ALL_SPECIES).toContain('sheep')
    expect(ALL_SPECIES).toContain('pig')
    expect(ALL_SPECIES).toContain('raccoon')
    expect(ALL_SPECIES).toContain('tiger')
    expect(ALL_SPECIES).toContain('lion')
  })
})

describe('SPECIES_LABEL', () => {
  it('has a label for every species', () => {
    for (const species of ALL_SPECIES) {
      expect(SPECIES_LABEL[species]).toBeTruthy()
      expect(typeof SPECIES_LABEL[species]).toBe('string')
    }
  })

  it('cat maps to Cat', () => {
    expect(SPECIES_LABEL.cat).toBe('Cat')
  })

  it('lion maps to Lion', () => {
    expect(SPECIES_LABEL.lion).toBe('Lion')
  })

  it('raccoon maps to Raccoon', () => {
    expect(SPECIES_LABEL.raccoon).toBe('Raccoon')
  })
})

describe('generateDefaultCompanions', () => {
  it('returns exactly 3 companions', () => {
    const companions = generateDefaultCompanions()
    expect(companions.length).toBe(3)
  })

  it('each companion has id, species, and name', () => {
    const companions = generateDefaultCompanions()
    for (const c of companions) {
      expect(typeof c.id).toBe('string')
      expect(c.id.length).toBeGreaterThan(0)
      expect(ALL_SPECIES).toContain(c.species)
      expect(typeof c.name).toBe('string')
      expect(c.name.length).toBeGreaterThan(0)
    }
  })

  it('all three companions have distinct species', () => {
    const companions = generateDefaultCompanions()
    const speciesSet = new Set(companions.map((c) => c.species))
    expect(speciesSet.size).toBe(3)
  })

  it('all three companions have distinct ids', () => {
    const companions = generateDefaultCompanions()
    const idSet = new Set(companions.map((c) => c.id))
    expect(idSet.size).toBe(3)
  })

  it('generates different companions on successive calls (randomness check)', () => {
    // With 12 species choosing 3, successive calls should vary over many runs
    const results = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const companions = generateDefaultCompanions()
      results.add(companions.map((c) => c.species).join(','))
    }
    // With 12 choose 3 = 220 combinations, 20 runs should produce >1 distinct result
    expect(results.size).toBeGreaterThan(1)
  })
})
