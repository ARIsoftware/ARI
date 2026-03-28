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
const API_REGISTRY_FILE = path.join(process.cwd(), 'lib/generated/module-api-registry.ts');
const TOPBAR_REGISTRY_FILE = path.join(process.cwd(), 'lib/generated/module-topbar-registry.ts');
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
      // Recursively scan subdirectories (including [param] dynamic route folders)
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

    // Scan for pages if app directory exists
    let subRoutes = [];
    if (fs.existsSync(pagePathTsx) || fs.existsSync(pagePathJsx)) {
      subRoutes = scanPagesRecursively(appDir);
    } else if (manifest.routes && manifest.routes.length > 0) {
      // Module declares routes but has no app/page.tsx - skip it
      console.warn(`⚠️  Skipping ${dirName}/${moduleFolder}: No app/page.tsx found`);
      continue;
    }
    // Modules with no routes and no pages are valid (e.g., top-bar-only modules)

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

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Read a route file and detect which HTTP methods it exports.
 */
function detectExportedMethods(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return HTTP_METHODS.filter(method =>
      new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(content)
    );
  } catch {
    return [];
  }
}

/**
 * Discover all core API routes under app/api/.
 * Returns array of { path, fullPath, methods }.
 */
function discoverCoreApiRoutes() {
  const apiDir = path.join(process.cwd(), 'app', 'api');
  const routePaths = scanApiRoutesRecursively(apiDir);

  return routePaths
    .filter(p => {
      // Exclude auth catch-all (Better Auth) and module proxy route
      if (p === 'auth/[...all]') return false;
      if (p === 'modules/[module]/[[...path]]') return false;
      return true;
    })
    .map(routePath => {
      const routeFile = path.join(apiDir, routePath, 'route.ts');
      const routeFileJs = path.join(apiDir, routePath, 'route.js');
      const actualFile = fs.existsSync(routeFile) ? routeFile : routeFileJs;
      const methods = detectExportedMethods(actualFile);

      return {
        path: routePath || '(root)',
        fullPath: `/api/${routePath}`,
        methods: methods.length > 0 ? methods : ['unknown'],
      };
    })
    .sort((a, b) => a.fullPath.localeCompare(b.fullPath));
}

/**
 * Discover all module API routes with their HTTP methods.
 * Reuses the pre-scanned moduleApiMap to avoid double directory traversal.
 * Returns array of { path, fullPath, moduleId, methods }.
 */
function discoverModuleApiRoutes(moduleMap, moduleApiMap) {
  const routes = [];

  for (const [id, { dirName, folder }] of moduleMap) {
    const apiData = moduleApiMap.get(id);
    if (!apiData) continue;

    const apiDir = path.join(process.cwd(), dirName, folder, 'api');
    for (const routePath of apiData.apiRoutes) {
      const routeFile = routePath
        ? path.join(apiDir, routePath, 'route.ts')
        : path.join(apiDir, 'route.ts');
      const routeFileJs = routeFile.replace('.ts', '.js');
      const actualFile = fs.existsSync(routeFile) ? routeFile : routeFileJs;
      const methods = detectExportedMethods(actualFile);

      const fullPath = routePath
        ? `/api/modules/${id}/${routePath}`
        : `/api/modules/${id}`;

      routes.push({
        path: routePath || '(root)',
        fullPath,
        moduleId: id,
        methods: methods.length > 0 ? methods : ['unknown'],
      });
    }
  }

  return routes.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
}

/**
 * Generate JSON manifest with full module metadata
 * This is used by module-loader.ts at runtime to avoid filesystem scanning
 */
function generateManifest(moduleMap, moduleApiMap) {
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

  // Discover all core API routes under app/api/
  const coreApiRoutes = discoverCoreApiRoutes();

  // Discover all module API routes with methods
  const moduleApiRoutes = discoverModuleApiRoutes(moduleMap, moduleApiMap);

  return {
    generatedAt: new Date().toISOString(),
    modules,
    publicRoutes,
    coreApiRoutes,
    moduleApiRoutes
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
      const routeKey = route ? `${id}/${route}` : id;
      const importPath = route ? `@/modules/${folder}/app/${route}/page` : `@/modules/${folder}/app/page`;
      allImports.push(`  '${routeKey}': () => import('${importPath}'),`);
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

/**
 * Recursively scan for route files in an api directory
 * Returns array of relative path keys like ['', 'data', '[id]', 'data/[id]', 'files/[id]/download']
 */
function scanApiRoutesRecursively(apiDir, relativePath = '') {
  const routes = [];

  if (!fs.existsSync(apiDir)) {
    return routes;
  }

  const entries = fs.readdirSync(apiDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(apiDir, entry.name);
    const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Recursively scan subdirectories (including [param] folders)
      routes.push(...scanApiRoutesRecursively(entryPath, entryRelative));
    } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
      // Found a route file - use the parent directory's relative path as the key
      routes.push(relativePath);
    }
  }

  return routes;
}

/**
 * Generate top bar icon component registry for modules that declare topBarIcon.component
 */
function generateTopBarRegistry(moduleMap) {
  const entries = [];

  for (const [id, { dirName, folder, manifest }] of moduleMap) {
    if (!manifest.topBarIcon || !manifest.topBarIcon.component) continue;

    const modulePath = path.join(process.cwd(), dirName, folder);
    const componentRelative = manifest.topBarIcon.component.replace(/^\.\//, '');
    const componentAbsolute = path.join(modulePath, componentRelative);

    if (!fs.existsSync(componentAbsolute)) {
      console.warn(`⚠️  ${id}: topBarIcon component not found at ${componentRelative}`);
      continue;
    }

    const importSuffix = componentRelative.replace(/\.(tsx?|jsx?)$/, '');
    entries.push({ id, folder, importPath: `@/modules/${folder}/${importSuffix}` });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const imports = entries.map(e => `  '${e.id}': () => import('${e.importPath}'),`).join('\n');

  return `/**
 * Auto-Generated Module Top Bar Icon Registry
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * Generated at: ${new Date().toISOString()}
 *
 * To regenerate: npm run generate-module-registry
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TopBarIconLoader = () => Promise<any>

export const MODULE_TOPBAR_ICONS: Record<string, TopBarIconLoader> = {
${imports}
}
`;
}

/**
 * Build API route map from existing moduleMap (avoids re-reading module.json files)
 * Returns Map of moduleId -> { folder, apiRoutes: string[] }
 */
function buildApiMapFromModules(moduleMap) {
  const moduleApiMap = new Map();

  for (const [id, { dirName, folder }] of moduleMap) {
    const apiDir = path.join(process.cwd(), dirName, folder, 'api');
    if (!fs.existsSync(apiDir)) continue;

    const apiRoutes = scanApiRoutesRecursively(apiDir);
    if (apiRoutes.length === 0) continue;

    moduleApiMap.set(id, { folder, apiRoutes });
  }

  return moduleApiMap;
}

/**
 * Generate API route registry TypeScript file
 */
function generateApiRegistry(moduleApiMap) {
  // Convert to sorted entries
  const entries = Array.from(moduleApiMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const moduleBlocks = [];

  for (const [id, { folder, apiRoutes }] of entries) {
    // Sort routes for consistent output
    const sortedRoutes = [...apiRoutes].sort((a, b) => a.localeCompare(b));

    const routeLines = sortedRoutes.map(route => {
      const importPath = route
        ? `@/modules/${folder}/api/${route}/route`
        : `@/modules/${folder}/api/route`;
      return `    '${route}': () => import('${importPath}'),`;
    });

    moduleBlocks.push(`  '${id}': {\n${routeLines.join('\n')}\n  },`);
  }

  return `/**
 * Auto-Generated Module API Route Registry
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * Generated at: ${new Date().toISOString()}
 *
 * This file is auto-generated before each build to ensure
 * all module API routes are registered for dynamic routing.
 * Modules in modules-custom take precedence over modules-core with the same ID.
 *
 * To regenerate: npm run generate-module-registry
 */

export const MODULE_API_ROUTES: Record<string, Record<string, () => Promise<any>>> = {
${moduleBlocks.join('\n')}
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

  // Generate top bar icon registry
  console.log('📝 Generating top bar icon registry...');
  const topbarRegistry = generateTopBarRegistry(moduleMap);
  fs.writeFileSync(TOPBAR_REGISTRY_FILE, topbarRegistry, 'utf-8');
  console.log('✅ Top bar icon registry generated at:', TOPBAR_REGISTRY_FILE);

  // Generate API route registry
  console.log('📝 Generating API route registry...');
  const moduleApiMap = buildApiMapFromModules(moduleMap);
  const apiRegistry = generateApiRegistry(moduleApiMap);
  fs.writeFileSync(API_REGISTRY_FILE, apiRegistry, 'utf-8');
  console.log(`✅ API registry generated at: ${API_REGISTRY_FILE} (${moduleApiMap.size} modules with API routes)`);

  // Generate JSON manifest (for runtime use without filesystem scanning)
  console.log('📝 Generating module manifest...');
  const manifest = generateManifest(moduleMap, moduleApiMap);
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
