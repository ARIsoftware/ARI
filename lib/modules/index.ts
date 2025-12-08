import { scanInstalledModules, scanForDuplicateModuleIds, type DuplicateModuleError } from './scanner';

// Cache the module list in memory after first scan
let cachedModules: string[] | null = null;
let cachedDuplicateErrors: DuplicateModuleError[] | null = null;

/**
 * Gets the list of installed modules (cached after first call)
 * For use in Server Components
 */
export function getInstalledModules(): string[] {
  if (cachedModules === null) {
    cachedModules = scanInstalledModules();
    console.log('📦 Discovered modules:', cachedModules);
  }
  return cachedModules;
}

/**
 * Checks if a module is installed
 * For use in Server Components
 *
 * @param moduleName - The directory name of the module (e.g., 'daily-fitness')
 * @returns true if the module is installed, false otherwise
 *
 * @example
 * ```tsx
 * import { isModuleInstalled } from '@/lib/modules'
 *
 * if (isModuleInstalled('daily-fitness')) {
 *   return <FitnessWidget />
 * }
 * ```
 */
export function isModuleInstalled(moduleName: string): boolean {
  const modules = getInstalledModules();
  return modules.includes(moduleName);
}

/**
 * Force a rescan of the modules directory
 * Useful for development when adding/removing modules
 */
export function refreshModuleCache(): void {
  cachedModules = null;
  cachedDuplicateErrors = null;
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
