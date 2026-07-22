import { describe, it, expect } from 'vitest'
import {
  HavocSettingsSchema,
  SaveSuccessSchema,
} from '@/modules-core/havoc-companions/lib/validation'
import { ALL_SPECIES } from '@/modules-core/havoc-companions/lib/animals'

// ─── HavocSettingsSchema ──────────────────────────────────────────────────────

const validAnimal = (species: string = ALL_SPECIES[0]) => ({
  id: 'animal-1',
  species,
  name: 'Whiskers',
})

const threeAnimals = [
  validAnimal(ALL_SPECIES[0]),
  validAnimal(ALL_SPECIES[1]),
  validAnimal(ALL_SPECIES[2]),
]

describe('HavocSettingsSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(HavocSettingsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts initialized boolean', () => {
    expect(HavocSettingsSchema.safeParse({ initialized: true }).success).toBe(true)
  })

  it('accepts exactly 3 valid animals', () => {
    expect(HavocSettingsSchema.safeParse({ animals: threeAnimals }).success).toBe(true)
  })

  it('accepts all valid species', () => {
    for (const species of ALL_SPECIES) {
      expect(HavocSettingsSchema.safeParse({
        animals: [
          validAnimal(species),
          validAnimal(ALL_SPECIES[1]),
          validAnimal(ALL_SPECIES[2]),
        ],
      }).success).toBe(true)
    }
  })

  it('rejects 2 animals (must be exactly 3)', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [validAnimal(), validAnimal()],
    }).success).toBe(false)
  })

  it('rejects 4 animals (must be exactly 3)', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [...threeAnimals, validAnimal()],
    }).success).toBe(false)
  })

  it('rejects unknown species', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [
        { id: 'a1', species: 'dragon', name: 'Spike' },
        validAnimal(ALL_SPECIES[1]),
        validAnimal(ALL_SPECIES[2]),
      ],
    }).success).toBe(false)
  })

  it('rejects empty animal id', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [
        { id: '', species: ALL_SPECIES[0], name: 'Name' },
        validAnimal(ALL_SPECIES[1]),
        validAnimal(ALL_SPECIES[2]),
      ],
    }).success).toBe(false)
  })

  it('rejects animal id exceeding 64 chars', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [
        { id: 'a'.repeat(65), species: ALL_SPECIES[0], name: 'Name' },
        validAnimal(ALL_SPECIES[1]),
        validAnimal(ALL_SPECIES[2]),
      ],
    }).success).toBe(false)
  })

  it('accepts animal id at exactly 64 chars', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [
        { id: 'a'.repeat(64), species: ALL_SPECIES[0], name: 'Name' },
        validAnimal(ALL_SPECIES[1]),
        validAnimal(ALL_SPECIES[2]),
      ],
    }).success).toBe(true)
  })

  it('rejects empty animal name', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [
        { id: 'a1', species: ALL_SPECIES[0], name: '' },
        validAnimal(ALL_SPECIES[1]),
        validAnimal(ALL_SPECIES[2]),
      ],
    }).success).toBe(false)
  })

  it('rejects animal name exceeding 40 chars', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [
        { id: 'a1', species: ALL_SPECIES[0], name: 'a'.repeat(41) },
        validAnimal(ALL_SPECIES[1]),
        validAnimal(ALL_SPECIES[2]),
      ],
    }).success).toBe(false)
  })

  it('accepts animal name at exactly 40 chars', () => {
    expect(HavocSettingsSchema.safeParse({
      animals: [
        { id: 'a1', species: ALL_SPECIES[0], name: 'a'.repeat(40) },
        validAnimal(ALL_SPECIES[1]),
        validAnimal(ALL_SPECIES[2]),
      ],
    }).success).toBe(true)
  })

  // intensity
  it('accepts intensity 1', () => {
    expect(HavocSettingsSchema.safeParse({ intensity: 1 }).success).toBe(true)
  })

  it('accepts intensity 10', () => {
    expect(HavocSettingsSchema.safeParse({ intensity: 10 }).success).toBe(true)
  })

  it('rejects intensity 0', () => {
    expect(HavocSettingsSchema.safeParse({ intensity: 0 }).success).toBe(false)
  })

  it('rejects intensity 11', () => {
    expect(HavocSettingsSchema.safeParse({ intensity: 11 }).success).toBe(false)
  })

  it('rejects non-integer intensity', () => {
    expect(HavocSettingsSchema.safeParse({ intensity: 5.5 }).success).toBe(false)
  })

  // speed
  it('accepts speed 1', () => {
    expect(HavocSettingsSchema.safeParse({ speed: 1 }).success).toBe(true)
  })

  it('accepts speed 10', () => {
    expect(HavocSettingsSchema.safeParse({ speed: 10 }).success).toBe(true)
  })

  it('rejects speed 0', () => {
    expect(HavocSettingsSchema.safeParse({ speed: 0 }).success).toBe(false)
  })

  it('rejects speed 11', () => {
    expect(HavocSettingsSchema.safeParse({ speed: 11 }).success).toBe(false)
  })

  it('rejects non-integer speed', () => {
    expect(HavocSettingsSchema.safeParse({ speed: 2.5 }).success).toBe(false)
  })
})

// ─── SaveSuccessSchema ────────────────────────────────────────────────────────

describe('SaveSuccessSchema', () => {
  it('accepts { success: true }', () => {
    expect(SaveSuccessSchema.safeParse({ success: true }).success).toBe(true)
  })

  it('rejects { success: false }', () => {
    expect(SaveSuccessSchema.safeParse({ success: false }).success).toBe(false)
  })

  it('rejects missing success field', () => {
    expect(SaveSuccessSchema.safeParse({}).success).toBe(false)
  })
})
