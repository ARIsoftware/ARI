/**
 * Havoc Companions Module — Type Definitions
 *
 * `CompanionSpecies` lives in `lib/animals.ts` so the runtime species
 * list and the TS union stay in lockstep. It is re-exported from here
 * for import-site convenience.
 */

import type { CompanionSpecies } from '@/modules/havoc-companions/lib/animals'

export type { CompanionSpecies }

/** A single havoc companion as stored in module_settings.settings.animals */
export interface HavocCompanion {
  /** Stable id used as React key + slot identifier */
  id: string
  species: CompanionSpecies
  name: string
}

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
