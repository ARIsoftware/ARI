/**
 * Havoc Companions Module — Type Definitions
 *
 * `CompanionSpecies` and `HavocCompanion` live in `lib/animals.ts` so the
 * runtime species list and the TS types stay in lockstep. They are
 * re-exported from here for import-site convenience.
 */

export type { CompanionSpecies, HavocCompanion } from '../lib/animals'

import type { HavocCompanion } from '../lib/animals'

/**
 * Settings persisted in module_settings.settings (JSONB).
 * `animals` is created on first run with 3 random species.
 */
export interface HavocCompanionSettings {
  /** True once first-run animal selection has been persisted */
  initialized: boolean
  /** Always exactly 3 companions once initialized */
  animals: HavocCompanion[]
  /** Mischief intensity, 1 (gentle) to 10 (chaos) */
  intensity: number
  /** Walker movement speed, 1 (sloth) to 10 (zoomies) */
  speed: number
}

export type GetHavocSettingsResponse = Partial<HavocCompanionSettings>
export type UpdateHavocSettingsRequest = Partial<HavocCompanionSettings>
