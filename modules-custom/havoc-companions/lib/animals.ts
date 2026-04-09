/**
 * Havoc Companions Module — Species library
 *
 * Single source of truth for the available cute species. Both the TS
 * `CompanionSpecies` union and the API Zod enum are derived from
 * `ALL_SPECIES`, so adding a species is a one-line change.
 */

import type { HavocCompanion } from '@/modules/havoc-companions/types'

export const ALL_SPECIES = [
  'cat',
  'dog',
  'bunny',
  'fox',
  'hamster',
  'duck',
  'panda',
  'sheep',
  'pig',
  'raccoon',
  'tiger',
  'lion',
] as const

export type CompanionSpecies = (typeof ALL_SPECIES)[number]

export const SPECIES_LABEL: Record<CompanionSpecies, string> = {
  cat: 'Cat',
  dog: 'Dog',
  bunny: 'Bunny',
  fox: 'Fox',
  hamster: 'Hamster',
  duck: 'Duck',
  panda: 'Panda',
  sheep: 'Sheep',
  pig: 'Pig',
  raccoon: 'Raccoon',
  tiger: 'Tiger',
  lion: 'Lion',
}

const DEFAULT_NAMES: Record<CompanionSpecies, string[]> = {
  cat: ['Whiskers', 'Mochi', 'Pebble', 'Biscuit', 'Marble'],
  dog: ['Buddy', 'Cocoa', 'Pippin', 'Scout', 'Nugget'],
  bunny: ['Hop', 'Clover', 'Cinnamon', 'Marshmallow', 'Pip'],
  fox: ['Ember', 'Sienna', 'Rusty', 'Maple', 'Fennec'],
  hamster: ['Peanut', 'Nibbles', 'Crumb', 'Bean', 'Acorn'],
  duck: ['Waddles', 'Puddle', 'Quackers', 'Splash', 'Pond'],
  panda: ['Bao', 'Mochi', 'Bamboo', 'Tofu', 'Roly'],
  sheep: ['Cloud', 'Wooly', 'Pillow', 'Fluff', 'Lamby'],
  pig: ['Truffle', 'Hammy', 'Snout', 'Porkchop', 'Curly'],
  raccoon: ['Bandit', 'Pocket', 'Mischief', 'Crumbs', 'Trash'],
  tiger: ['Stripes', 'Rajah', 'Tigger', 'Saber', 'Ember'],
  lion: ['Leo', 'Simba', 'Mufasa', 'Goldie', 'Roary'],
}

/** Pick 3 distinct species and assign a default name from each species' name pool. */
export function generateDefaultCompanions(): HavocCompanion[] {
  const pool: CompanionSpecies[] = [...ALL_SPECIES]
  const picks: HavocCompanion[] = []
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    const species = pool.splice(idx, 1)[0]
    const names = DEFAULT_NAMES[species]
    picks.push({
      id: crypto.randomUUID(),
      species,
      name: names[Math.floor(Math.random() * names.length)],
    })
  }
  return picks
}
