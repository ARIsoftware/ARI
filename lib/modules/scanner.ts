import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Represents a duplicate module ID error
 */
export interface DuplicateModuleError {
  moduleId: string;
  directories: string[];
}

/**
 * Module directories in priority order (first = highest priority)
 */
const MODULE_DIRECTORIES = ['modules-custom', 'modules-core'] as const;

/**
 * Scans a single modules directory and returns an array of directory names
 */
function scanModulesDirectory(dirName: string): string[] {
  try {
    const modulesPath = join(process.cwd(), dirName);
    if (!existsSync(modulesPath)) {
      return [];
    }
    const entries = readdirSync(modulesPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Scans both modules-custom and modules-core directories
 * Returns an array of installed module directory names (deduplicated)
 * This function only works server-side due to filesystem access
 */
export function scanInstalledModules(): string[] {
  const allModules = new Set<string>();

  for (const dir of MODULE_DIRECTORIES) {
    const modules = scanModulesDirectory(dir);
    modules.forEach(m => allModules.add(m));
  }

  return Array.from(allModules).sort();
}

/**
 * Scans for duplicate module IDs within the same folder
 * Override modules with the same ID as core modules are NOT considered duplicates
 * Returns an array of errors if duplicates are found within the same folder
 */
export function scanForDuplicateModuleIds(): DuplicateModuleError[] {
  const errors: DuplicateModuleError[] = [];

  // Track IDs from override folder (these take precedence)
  const overrideIds = new Set<string>();

  for (const dirName of MODULE_DIRECTORIES) {
    const modulesPath = join(process.cwd(), dirName);

    if (!existsSync(modulesPath)) {
      continue;
    }

    // Track IDs within this specific folder to detect duplicates
    const folderSeenIds = new Map<string, string[]>();

    try {
      const entries = readdirSync(modulesPath, { withFileTypes: true });
      const moduleDirs = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'));

      for (const dir of moduleDirs) {
        const manifestPath = join(modulesPath, dir.name, 'module.json');

        if (!existsSync(manifestPath)) {
          continue;
        }

        try {
          const manifestContent = readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);

          if (manifest.id && typeof manifest.id === 'string') {
            // For modules-core, skip IDs that exist in override (not an error)
            if (dirName === 'modules-core' && overrideIds.has(manifest.id)) {
              continue;
            }

            // Track for duplicate detection within this folder
            const existingPaths = folderSeenIds.get(manifest.id) || [];
            existingPaths.push(`/${dirName}/${dir.name}`);
            folderSeenIds.set(manifest.id, existingPaths);

            // If this is custom folder, track the ID for later
            if (dirName === 'modules-custom') {
              overrideIds.add(manifest.id);
            }
          }
        } catch {
          // Skip modules with invalid manifests - other validation will catch this
          continue;
        }
      }

      // Check for duplicates within this folder
      for (const [moduleId, paths] of folderSeenIds) {
        if (paths.length > 1) {
          errors.push({
            moduleId,
            directories: paths,
          });
        }
      }
    } catch (error) {
      console.error(`Failed to scan ${dirName} for duplicate module IDs:`, error);
    }
  }

  return errors;
}
