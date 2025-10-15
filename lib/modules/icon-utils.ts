/**
 * Icon Utilities for Modules
 *
 * Provides helper functions to get Lucide icons by name for module nav items.
 */

import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Get a Lucide icon component by name
 *
 * @param iconName - Name of the Lucide icon (e.g., "Package", "Zap", "Home")
 * @returns Lucide icon component or default Package icon if not found
 *
 * @example
 * ```tsx
 * const Icon = getLucideIcon('Package')
 * return <Icon className="w-4 h-4" />
 * ```
 */
export function getLucideIcon(iconName?: string): LucideIcon {
  if (!iconName) {
    return LucideIcons.Package // Default icon
  }

  // Get the icon from lucide-react by name
  const Icon = (LucideIcons as any)[iconName]

  // If icon doesn't exist, return default Package icon
  if (!Icon || typeof Icon !== 'function') {
    console.warn(`[Icon Utils] Icon "${iconName}" not found in lucide-react, using default Package icon`)
    return LucideIcons.Package
  }

  return Icon as LucideIcon
}

/**
 * Validate if an icon name exists in Lucide
 *
 * @param iconName - Name to check
 * @returns true if icon exists, false otherwise
 */
export function isValidLucideIcon(iconName: string): boolean {
  return !!(LucideIcons as any)[iconName]
}

/**
 * Get list of all available Lucide icon names
 *
 * Useful for development/debugging
 *
 * @returns Array of icon names
 */
export function getAllLucideIconNames(): string[] {
  return Object.keys(LucideIcons).filter(key => {
    const value = (LucideIcons as any)[key]
    return typeof value === 'function'
  })
}
