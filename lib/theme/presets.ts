import type { ThemePreset } from './types'
import { THEME_PRESETS } from '@/lib/generated/theme-registry'

/**
 * Theme Presets
 *
 * The presets themselves live as files in themes-core/<id>/theme.json (with
 * optional per-theme CSS in theme.css), overridable per-id from
 * themes-custom/<id>/ — see themes-core/README.md. They are compiled into
 * lib/generated/theme-registry.ts by scripts/generate-theme-registry.js,
 * which runs with the module registry on every dev boot and build.
 *
 * This module re-exports the generated registry so all existing consumers
 * (theme-context, light-layout, the theme API) keep their import path.
 */

export { THEME_PRESETS }

// Helper to get a theme by ID
export function getThemeById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((theme) => theme.id === id)
}

// Default theme ID — applied to new installs and any user without a saved
// theme choice (existing saved choices in module_settings always win).
export const DEFAULT_THEME_ID = 'sovereign-day'
