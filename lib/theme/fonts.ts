import type { FontOption } from './types'

/**
 * Available Font Options
 * 10 fonts including the existing 6 plus 4 new additions
 */

export const FONTS: FontOption[] = [
  // Existing fonts (already loaded in layout.tsx)
  {
    id: 'overpass-mono',
    name: 'Overpass Mono',
    family: '"Overpass Mono", monospace',
  },
  {
    id: 'geist',
    name: 'Geist',
    family: '"Geist", sans-serif',
  },
  {
    id: 'geist-mono',
    name: 'Geist Mono',
    family: '"Geist Mono", monospace',
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    family: '"Open Sans", sans-serif',
  },
  {
    id: 'outfit',
    name: 'Outfit',
    family: '"Outfit", sans-serif',
  },
  {
    id: 'science-gothic',
    name: 'Science Gothic',
    family: '"Science Gothic", sans-serif',
  },
  // New fonts (need to be added to layout.tsx)
  {
    id: 'inter',
    name: 'Inter',
    family: '"Inter", sans-serif',
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    family: '"JetBrains Mono", monospace',
  },
  {
    id: 'ibm-plex-sans',
    name: 'IBM Plex Sans',
    family: '"IBM Plex Sans", sans-serif',
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    family: '"Fira Code", monospace',
  },
  {
    id: 'crimson-pro',
    name: 'Crimson Pro',
    family: '"Crimson Pro", serif',
  },
  {
    id: 'press-start-2p',
    name: 'Press Start 2P',
    family: '"Press Start 2P", monospace',
  },
]

// Default font ID
export const DEFAULT_FONT_ID = 'overpass-mono'

// Helper to get a font by ID
export function getFontById(id: string): FontOption | undefined {
  return FONTS.find((font) => font.id === id)
}

// Helper to get font family by ID (with fallback)
export function getFontFamily(id: string): string {
  const font = getFontById(id)
  return font?.family ?? FONTS[0].family
}
