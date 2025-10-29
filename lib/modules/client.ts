'use client';

import { useModulesContext } from './context';

/**
 * Checks if a module is installed
 * For use in Client Components
 *
 * @param moduleName - The directory name of the module (e.g., 'daily-fitness')
 * @returns true if the module is installed, false otherwise
 *
 * @example
 * ```tsx
 * 'use client'
 * import { isModuleInstalled } from '@/lib/modules/client'
 *
 * function MyComponent() {
 *   if (isModuleInstalled('daily-fitness')) {
 *     return <p>Hello, the daily-fitness module is installed.</p>
 *   }
 *   return <p>Module not found.</p>
 * }
 * ```
 */
export function isModuleInstalled(moduleName: string): boolean {
  const { modules } = useModulesContext();
  return modules.includes(moduleName);
}

/**
 * Gets the list of all installed modules
 * For use in Client Components
 */
export function getInstalledModules(): string[] {
  const { modules } = useModulesContext();
  return modules;
}
