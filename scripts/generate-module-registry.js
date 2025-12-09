#!/usr/bin/env node

/**
 * Generate Module Registry Script
 *
 * Scans /modules-custom and /modules-core directories and auto-generates
 * the MODULE_PAGES registry for /app/[module]/[[...slug]]/page.tsx
 *
 * Modules in modules-custom take precedence over modules-core with the same ID.
 *
 * Run this before build: node scripts/generate-module-registry.js
 */

const fs = require('fs');
const path = require('path');

// Module directories in priority order (first = highest priority)
const MODULE_DIRECTORIES = ['modules-custom', 'modules-core'];
const OUTPUT_FILE = path.join(process.cwd(), 'lib/generated/module-pages-registry.ts');
const MANIFEST_FILE = path.join(process.cwd(), 'lib/generated/module-manifest.json');

// Ensure output directory exists
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Scan a single modules directory
 * Returns array of { id: moduleId, dirName: 'modules-custom' | 'modules-core' }
 */
function scanModulesDirectory(dirName) {
  const modules = [];
  const modulesDir = path.join(process.cwd(), dirName);

  if (!fs.existsSync(modulesDir)) {
    return modules;
  }

  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const moduleFolder = entry.name;
    const modulePath = path.join(modulesDir, moduleFolder);
    const manifestPath = path.join(modulePath, 'module.json');
    const pagePathTsx = path.join(modulePath, 'app', 'page.tsx');
    const pagePathJsx = path.join(modulePath, 'app', 'page.jsx');

    // Check if module.json exists
    if (!fs.existsSync(manifestPath)) {
      console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: No module.json found`);
      continue;
    }

    // Read module ID from manifest
    let moduleId;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      moduleId = manifest.id;
      if (!moduleId) {
        console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: No id in module.json`);
        continue;
      }
    } catch (e) {
      console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: Invalid module.json`);
      continue;
    }

    // Check if app/page.tsx or app/page.jsx exists
    if (!fs.existsSync(pagePathTsx) && !fs.existsSync(pagePathJsx)) {
      console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: No app/page.tsx found`);
      continue;
    }

    modules.push({ id: moduleId, dirName, folder: moduleFolder });
  }

  return modules;
}

/**
 * Scan all module directories with override precedence
 * Returns Map of moduleId -> { dirName, folder }
 */
function scanAllModules() {
  // Map moduleId -> { dirName, folder }
  const moduleMap = new Map();

  for (const dirName of MODULE_DIRECTORIES) {
    console.log(`🔍 Scanning ${dirName}...`);
    const modules = scanModulesDirectory(dirName);

    for (const mod of modules) {
      // Only add if not already present (override takes precedence)
      if (!moduleMap.has(mod.id)) {
        moduleMap.set(mod.id, { dirName: mod.dirName, folder: mod.folder });
      } else {
        console.log(`  ↳ Skipping ${mod.id} from ${dirName} (overridden by ${moduleMap.get(mod.id).dirName})`);
      }
    }
  }

  return moduleMap;
}

/**
 * Generate JSON manifest with full module metadata
 * This is used by module-loader.ts at runtime to avoid filesystem scanning
 */
function generateManifest(moduleMap) {
  const modules = [];

  // Track which module IDs have been added (for override detection)
  const addedIds = new Set();

  // First pass: collect all modules from custom directory
  for (const [id, { dirName, folder }] of moduleMap) {
    const modulePath = path.join(process.cwd(), dirName, folder);
    const manifestPath = path.join(modulePath, 'module.json');

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      modules.push({
        ...manifest,
        path: modulePath,
        sourceDir: dirName,
        isOverridden: false
      });
      addedIds.add(id);
    } catch (e) {
      console.warn(`⚠️  Failed to read manifest for ${id}:`, e.message);
    }
  }

  // Second pass: find overridden modules in modules-core that were replaced by modules-custom
  const coreDir = path.join(process.cwd(), 'modules-core');
  if (fs.existsSync(coreDir)) {
    const coreEntries = fs.readdirSync(coreDir, { withFileTypes: true });
    for (const entry of coreEntries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = path.join(coreDir, entry.name, 'module.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        // Check if this module was overridden by modules-custom
        const existingModule = modules.find(m => m.id === manifest.id);
        if (existingModule && existingModule.sourceDir === 'modules-custom') {
          // This core module was overridden - add it as overridden
          modules.push({
            ...manifest,
            path: path.join(coreDir, entry.name),
            sourceDir: 'modules-core',
            isOverridden: true
          });
        }
      } catch (e) {
        // Skip invalid manifests
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    modules
  };
}

// Generate TypeScript registry file
function generateRegistry(moduleMap) {
  // Convert Map to sorted array of [id, { dirName, folder }]
  const entries = Array.from(moduleMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const imports = entries.map(([id, { dirName, folder }]) =>
    `  '${id}': () => import('@/${dirName}/${folder}/app/page'),`
  ).join('\n');

  const moduleIds = entries.map(([id]) => id);

  const content = `/**
 * Auto-Generated Module Pages Registry
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * Generated at: ${new Date().toISOString()}
 *
 * This file is auto-generated before each build to ensure
 * all modules in /modules-custom and /modules-core are registered for dynamic routing.
 * Modules in modules-custom take precedence over modules-core with the same ID.
 *
 * To regenerate: npm run generate-module-registry
 */

export const MODULE_PAGES: Record<string, any> = {
${imports}
}

/**
 * List of all registered module IDs
 */
export const REGISTERED_MODULE_IDS = [
  ${moduleIds.map(id => `'${id}'`).join(',\n  ')}
] as const

/**
 * Check if a module is registered
 */
export function isModuleRegistered(moduleId: string): boolean {
  return moduleId in MODULE_PAGES
}
`;

  return content;
}

// Main execution
function main() {
  console.log('');
  const moduleMap = scanAllModules();

  console.log(`✅ Found ${moduleMap.size} valid modules`);

  // Generate TypeScript registry
  console.log('📝 Generating registry file...');
  const registry = generateRegistry(moduleMap);
  fs.writeFileSync(OUTPUT_FILE, registry, 'utf-8');
  console.log('✅ Registry generated at:', OUTPUT_FILE);

  // Generate JSON manifest (for runtime use without filesystem scanning)
  console.log('📝 Generating module manifest...');
  const manifest = generateManifest(moduleMap);
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('✅ Manifest generated at:', MANIFEST_FILE);

  console.log('');
  console.log('Registered modules:');
  for (const [id, { dirName, folder }] of moduleMap) {
    console.log(`  - ${id} (from ${dirName}/${folder})`);
  }
  console.log('');
}

main();
