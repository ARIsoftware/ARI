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
const SUBMENU_OUTPUT_FILE = path.join(process.cwd(), 'lib/generated/module-submenu-registry.ts');
const MANIFEST_FILE = path.join(process.cwd(), 'lib/generated/module-manifest.json');

// Ensure output directory exists
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Recursively scan for page files in a directory
 * Returns array of relative paths like ['page.tsx', 'radar/page.tsx', 'add/page.tsx']
 */
function scanPagesRecursively(appDir, relativePath = '') {
  const pages = [];

  if (!fs.existsSync(appDir)) {
    return pages;
  }

  const entries = fs.readdirSync(appDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(appDir, entry.name);
    const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Handle [param] dynamic route folders - register the parent path
      if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
        // Check if there's a page inside the dynamic folder
        const dynamicPageTsx = path.join(entryPath, 'page.tsx');
        const dynamicPageJsx = path.join(entryPath, 'page.jsx');
        if (fs.existsSync(dynamicPageTsx) || fs.existsSync(dynamicPageJsx)) {
          // Register the parent path (e.g., 'edit' for 'edit/[id]/page.tsx')
          // The component will use useParams() to get the dynamic segment
          pages.push({ path: relativePath, isDynamic: true, dynamicFolder: entry.name });
        }
        continue;
      }
      // Recursively scan subdirectories
      pages.push(...scanPagesRecursively(entryPath, entryRelative));
    } else if (entry.name === 'page.tsx' || entry.name === 'page.jsx') {
      // Found a page file
      pages.push(relativePath || '');
    }
  }

  return pages;
}

/**
 * Scan a single modules directory
 * Returns array of { id: moduleId, dirName: 'modules-custom' | 'modules-core', subRoutes: string[] }
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
    const appDir = path.join(modulePath, 'app');
    const pagePathTsx = path.join(appDir, 'page.tsx');
    const pagePathJsx = path.join(appDir, 'page.jsx');

    // Check if module.json exists
    if (!fs.existsSync(manifestPath)) {
      console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: No module.json found`);
      continue;
    }

    // Read module manifest
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!manifest.id) {
        console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: No id in module.json`);
        continue;
      }
    } catch (e) {
      console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: Invalid module.json`);
      continue;
    }

    // Check if app/page.tsx or app/page.jsx exists (main page required)
    if (!fs.existsSync(pagePathTsx) && !fs.existsSync(pagePathJsx)) {
      console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: No app/page.tsx found`);
      continue;
    }

    // Scan for all pages (including sub-routes)
    const subRoutes = scanPagesRecursively(appDir);

    modules.push({ id: manifest.id, dirName, folder: moduleFolder, subRoutes, manifest });
  }

  return modules;
}

/**
 * Scan all module directories with override precedence
 * Returns Map of moduleId -> { dirName, folder, subRoutes }
 */
function scanAllModules() {
  // Map moduleId -> { dirName, folder, subRoutes }
  const moduleMap = new Map();

  for (const dirName of MODULE_DIRECTORIES) {
    console.log(`🔍 Scanning ${dirName}...`);
    const modules = scanModulesDirectory(dirName);

    for (const mod of modules) {
      // Only add if not already present (override takes precedence)
      if (!moduleMap.has(mod.id)) {
        moduleMap.set(mod.id, { dirName: mod.dirName, folder: mod.folder, subRoutes: mod.subRoutes, manifest: mod.manifest });
        if (mod.subRoutes.length > 1) {
          console.log(`  ↳ ${mod.id}: Found ${mod.subRoutes.length} pages (${mod.subRoutes.join(', ')})`);
        }
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

  // First pass: collect all modules using cached manifests
  for (const [id, { dirName, folder, manifest }] of moduleMap) {
    const modulePath = path.join(process.cwd(), dirName, folder);
    modules.push({
      ...manifest,
      path: modulePath,
      sourceDir: dirName,
      isOverridden: false
    });
    addedIds.add(id);
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

  // Extract all public routes with full paths
  const publicRoutes = [];
  for (const mod of modules) {
    if (mod.publicRoutes && Array.isArray(mod.publicRoutes)) {
      for (const route of mod.publicRoutes) {
        publicRoutes.push({
          moduleId: mod.id,
          path: route.path,
          fullPath: `/api/modules/${mod.id}/${route.path}`,
          methods: route.methods,
          security: route.security,
          description: route.description
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    modules,
    publicRoutes
  };
}

// Generate TypeScript registry file
function generateRegistry(moduleMap) {
  // Convert Map to sorted array of [id, { dirName, folder, subRoutes }]
  const entries = Array.from(moduleMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Generate imports for all pages (main + sub-routes)
  const allImports = [];
  for (const [id, { folder, subRoutes }] of entries) {
    for (const route of subRoutes) {
      // Handle both string routes and dynamic route objects
      if (typeof route === 'object' && route.isDynamic) {
        // Dynamic route like edit/[id] - register parent path
        const routeKey = route.path ? `${id}/${route.path}` : id;
        const importPath = route.path
          ? `@/modules/${folder}/app/${route.path}/${route.dynamicFolder}/page`
          : `@/modules/${folder}/app/${route.dynamicFolder}/page`;
        allImports.push(`  '${routeKey}': () => import('${importPath}'),`);
      } else {
        // Static route
        const routeKey = route ? `${id}/${route}` : id;
        const importPath = route ? `@/modules/${folder}/app/${route}/page` : `@/modules/${folder}/app/page`;
        allImports.push(`  '${routeKey}': () => import('${importPath}'),`);
      }
    }
  }

  // Sort imports alphabetically
  allImports.sort();
  const imports = allImports.join('\n');

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

/**
 * Generate submenu registry for modules that declare a submenu component
 * Reads the "submenu.component" field from module.json and verifies the file exists
 */
function generateSubmenuRegistry(moduleMap) {
  const entries = [];

  for (const [id, { dirName, folder, manifest }] of moduleMap) {
    if (!manifest.submenu || !manifest.submenu.component) continue;

    const modulePath = path.join(process.cwd(), dirName, folder);

    // Resolve the component path relative to the module directory
    const componentRelative = manifest.submenu.component.replace(/^\.\//, '');
    const componentAbsolute = path.join(modulePath, componentRelative);

    if (!fs.existsSync(componentAbsolute)) {
      console.warn(`⚠️  ${id}: submenu component not found at ${componentRelative}`);
      continue;
    }

    // Strip .tsx/.ts extension for the import path
    const importSuffix = componentRelative.replace(/\.(tsx?|jsx?)$/, '');
    entries.push({ id, folder, importPath: `@/modules/${folder}/${importSuffix}` });
  }

  // Sort alphabetically
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const imports = entries.map(e => `  '${e.id}': () => import('${e.importPath}'),`).join('\n');

  return `/**
 * Auto-Generated Module Submenu Registry
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * Generated at: ${new Date().toISOString()}
 *
 * To regenerate: npm run generate-module-registry
 */

import type { ModuleSubmenuProps } from '@/components/sidebar-submenu-renderer'
import type { ComponentType } from 'react'

type SubmenuLoader = () => Promise<{ default: ComponentType<ModuleSubmenuProps> }>

export const MODULE_SUBMENUS: Record<string, SubmenuLoader> = {
${imports}
}
`;
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

  // Generate submenu registry
  console.log('📝 Generating submenu registry...');
  const submenuRegistry = generateSubmenuRegistry(moduleMap);
  fs.writeFileSync(SUBMENU_OUTPUT_FILE, submenuRegistry, 'utf-8');
  console.log('✅ Submenu registry generated at:', SUBMENU_OUTPUT_FILE);

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
