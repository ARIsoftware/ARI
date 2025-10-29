import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * Scans the /modules directory and returns an array of installed module names
 * This function only works server-side due to filesystem access
 */
export function scanInstalledModules(): string[] {
  try {
    const modulesPath = join(process.cwd(), 'modules');
    const entries = readdirSync(modulesPath, { withFileTypes: true });

    // Filter to only include directories, excluding any special folders
    const modules = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);

    return modules.sort(); // Sort alphabetically for consistency
  } catch (error) {
    console.error('Failed to scan modules directory:', error);
    return [];
  }
}
