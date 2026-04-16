import { scanInstalledModules, scanForDuplicateModuleIds, type DuplicateModuleError } from './scanner';

// Cache the module list in memory after first scan
let cachedModules: string[] | null = null;

/**
 * Gets the list of installed modules (cached after first call)
 * For use in Server Components
 */
export function getInstalledModules(): string[] {
  if (cachedModules === null) {
    cachedModules = scanInstalledModules();
  }
  return cachedModules;
}

/**
 * Gets any duplicate module ID errors
 * Always rescans to detect new duplicates (no caching for errors)
 * For use in Server Components
 */
export function getDuplicateModuleErrors(): DuplicateModuleError[] {
  // Always rescan for duplicates - this is a critical error check
  // that should detect newly added duplicate modules
  const errors = scanForDuplicateModuleIds();
  if (errors.length > 0) {
    console.error('🚨 Duplicate module IDs detected:', errors);
  }
  return errors;
}

export type { DuplicateModuleError };
