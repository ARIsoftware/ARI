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
const crypto = require('crypto');

/**
 * Compute the SHA-256 hash of a module's database/schema.sql, hex-encoded.
 * Returns undefined if the file doesn't exist or can't be read — modules
 * without tables pass through cleanly without a marker.
 *
 * The runtime self-heal gate (lib/modules/module-registry.ts) compares this
 * hash against the user's stored marker in module_settings.settings; a
 * mismatch triggers a re-run of schema.sql, which is how schema migrations
 * (added ALTER, new tables, etc.) auto-apply on next page load.
 */
function computeSchemaHash(modulePath) {
  const schemaPath = path.join(modulePath, 'database', 'schema.sql');
  try {
    const sqlText = fs.readFileSync(schemaPath, 'utf-8');
    return crypto.createHash('sha256').update(sqlText).digest('hex');
  } catch {
    return undefined;
  }
}

// Module directories in priority order (first = highest priority)
const MODULE_DIRECTORIES = ['modules-custom', 'modules-core'];
const OUTPUT_FILE = path.join(process.cwd(), 'lib/generated/module-pages-registry.ts');
const SUBMENU_OUTPUT_FILE = path.join(process.cwd(), 'lib/generated/module-submenu-registry.ts');
const API_REGISTRY_FILE = path.join(process.cwd(), 'lib/generated/module-api-registry.ts');
const TOPBAR_REGISTRY_FILE = path.join(process.cwd(), 'lib/generated/module-topbar-registry.ts');
const MANIFEST_FILE = path.join(process.cwd(), 'lib/generated/module-manifest.json');
const PROVIDER_REGISTRY_FILE = path.join(process.cwd(), 'lib/generated/module-provider-registry.ts');
const DASHBOARD_REGISTRY_FILE = path.join(process.cwd(), 'lib/generated/module-dashboard-registry.ts');
const SCHEMA_OUTPUT_FILE = path.join(process.cwd(), 'lib/db/schema/schema.ts');
const RELATIONS_OUTPUT_FILE = path.join(process.cwd(), 'lib/db/schema/relations.ts');

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
 * Read a route file and detect debug metadata exports:
 *   export const debugRole = 'some-key'
 *   export const isPublic = true
 *
 * These let core route files declare their identity to /debug and the
 * security system without /debug needing to hardcode any paths.
 */
function detectRouteMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const meta = {};
    const roleMatch = content.match(/export\s+const\s+debugRole\s*=\s*['"]([^'"]+)['"]/);
    if (roleMatch) meta.debugRole = roleMatch[1];
    if (/export\s+const\s+isPublic\s*=\s*true\b/.test(content)) meta.isPublic = true;
    if (/\bcheckRateLimit\b/.test(content)) meta.hasRateLimit = true;
    if (/\brequireAuthIfUsersExist\b/.test(content)) meta.requiresAuthIfUsers = true;
    // Reliability check: warn if a route is marked public but also pulls in
    // the auth helper — likely an accidental contradiction.
    if (meta.isPublic && /getAuthenticatedUser/.test(content)) {
      console.warn(`⚠️  ${filePath}: marked isPublic=true but imports getAuthenticatedUser — likely contradiction`);
    }
    return meta;
  } catch {
    return {};
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
      const metadata = detectRouteMetadata(actualFile);

      return {
        path: routePath || '(root)',
        fullPath: `/api/${routePath}`,
        methods: methods.length > 0 ? methods : ['unknown'],
        ...(metadata.debugRole ? { debugRole: metadata.debugRole } : {}),
        ...(metadata.isPublic ? { isPublic: true } : {}),
        ...(metadata.hasRateLimit ? { hasRateLimit: true } : {}),
        ...(metadata.requiresAuthIfUsers ? { requiresAuthIfUsers: true } : {}),
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
    const schemaSha256 = computeSchemaHash(modulePath);
    modules.push({
      ...manifest,
      path: modulePath,
      sourceDir: dirName,
      isOverridden: false,
      ...(schemaSha256 ? { schemaSha256 } : {}),
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
          const overriddenPath = path.join(coreDir, entry.name);
          const schemaSha256 = computeSchemaHash(overriddenPath);
          modules.push({
            ...manifest,
            path: overriddenPath,
            sourceDir: 'modules-core',
            isOverridden: true,
            ...(schemaSha256 ? { schemaSha256 } : {}),
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

  // Append intentionally-public core routes into the top-level publicRoutes
  // list. Core route files declare themselves with `export const isPublic = true`,
  // so middleware, the security tab, and the public-endpoint security tester
  // all get a single source of truth with no hardcoding in /debug.
  for (const route of coreApiRoutes) {
    if (route.isPublic) {
      publicRoutes.push({
        moduleId: 'core',
        path: route.path,
        fullPath: route.fullPath,
        methods: route.methods,
        security: {
          type: 'core',
          ...(route.hasRateLimit ? { rateLimit: true } : {}),
          ...(route.requiresAuthIfUsers ? { requiresAuthIfUsers: true } : {}),
        },
        description: 'Core route declared public via export const isPublic = true',
      });
    }
  }

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
 * To regenerate: pnpm run generate-module-registry
 *
 * This file is auto-generated before each build to ensure
 * all modules in /modules-custom and /modules-core are registered for dynamic routing.
 * Modules in modules-custom take precedence over modules-core with the same ID.
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
/**
 * Scan modules for a manifest field that points to a component file.
 * Returns sorted array of { id, folder, importPath, manifest } entries.
 * Used by submenu, topbar, and provider registry generators.
 */
function scanModuleComponents(moduleMap, fieldPath, label) {
  const entries = [];

  for (const [id, { dirName, folder, manifest }] of moduleMap) {
    // Resolve nested field path (e.g. 'submenu.component' or 'topBarIcon.component')
    const parts = fieldPath.split('.');
    let value = manifest;
    for (const part of parts) {
      value = value?.[part];
    }
    if (!value) continue;

    const modulePath = path.join(process.cwd(), dirName, folder);
    const componentRelative = value.replace(/^\.\//, '');
    const componentAbsolute = path.join(modulePath, componentRelative);

    if (!fs.existsSync(componentAbsolute)) {
      console.warn(`⚠️  ${id}: ${label} component not found at ${componentRelative}`);
      continue;
    }

    const importSuffix = componentRelative.replace(/\.(tsx?|jsx?)$/, '');
    entries.push({ id, folder, importPath: `@/modules/${folder}/${importSuffix}`, manifest });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

function generateSubmenuRegistry(moduleMap) {
  const entries = scanModuleComponents(moduleMap, 'submenu.component', 'submenu');
  const imports = entries.map(e => `  '${e.id}': () => import('${e.importPath}'),`).join('\n');

  return `/**
 * Auto-Generated Module Submenu Registry
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * To regenerate: pnpm run generate-module-registry
 */

import type { ModuleSubmenuProps } from '@/lib/modules/submenu-types'
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
  const entries = scanModuleComponents(moduleMap, 'topBarIcon.component', 'topBarIcon');
  const imports = entries.map(e => `  '${e.id}': () => import('${e.importPath}'),`).join('\n');

  return `/**
 * Auto-Generated Module Top Bar Icon Registry
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * To regenerate: pnpm run generate-module-registry
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TopBarIconLoader = () => Promise<any>

export const MODULE_TOPBAR_ICONS: Record<string, TopBarIconLoader> = {
${imports}
}
`;
}

function generateProviderRegistry(moduleMap) {
  const entries = scanModuleComponents(moduleMap, 'globalProvider.component', 'globalProvider');

  const imports = entries.map(e => {
    const exportName = e.manifest.globalProvider.exportName || 'default';
    return `  '${e.id}': { loader: () => import('${e.importPath}'), exportName: '${exportName}' },`;
  }).join('\n');

  return `/**
 * Auto-Generated Module Global Provider Registry
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * To regenerate: pnpm run generate-module-registry
 *
 * Modules can declare a globalProvider in module.json to wrap the app
 * with a context provider. The provider component must accept
 * { children, isAuthenticated } props.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderEntry = { loader: () => Promise<any>; exportName: string }

export const MODULE_PROVIDERS: Record<string, ProviderEntry> = {
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
 * To regenerate: pnpm run generate-module-registry
 *
 * This file is auto-generated before each build to ensure
 * all module API routes are registered for dynamic routing.
 * Modules in modules-custom take precedence over modules-core with the same ID.
 */

export const MODULE_API_ROUTES: Record<string, Record<string, () => Promise<any>>> = {
${moduleBlocks.join('\n')}
}
`;
}

/**
 * Extract exported symbol names from a TypeScript file.
 * Matches: export const X, export function X, export type X, etc.
 */
function extractExportedSymbols(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const symbols = [];
    const regex = /export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      symbols.push(match[1]);
    }
    return symbols;
  } catch {
    return [];
  }
}

/**
 * Collect all symbol names exported by the schema barrel (core-schema + module schemas).
 * Used to validate that relations files only reference tables that actually exist.
 */
function collectAvailableSchemaExports(moduleMap) {
  const exports = new Set();

  // Core schema exports
  const coreSchemaPath = path.join(process.cwd(), 'lib/db/schema/core-schema.ts');
  for (const sym of extractExportedSymbols(coreSchemaPath)) {
    exports.add(sym);
  }

  // Module schema exports
  for (const [id, { dirName, folder }] of moduleMap) {
    const schemaPath = path.join(process.cwd(), dirName, folder, 'database', 'schema.ts');
    for (const sym of extractExportedSymbols(schemaPath)) {
      exports.add(sym);
    }
  }

  return exports;
}

/**
 * Parse a relations file and return any imports from @/lib/db/schema that
 * are not in the available exports set.
 */
function findUnsatisfiedSchemaImports(filePath, availableExports) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const unsatisfied = [];

    // Match: import { foo, bar } from "@/lib/db/schema"
    // Also handles @/lib/db/schema/index or @/lib/db/schema/schema
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']@\/lib\/db\/schema(?:\/(?:index|schema))?["']/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const symbols = match[1].split(',').map(s => s.trim()).filter(Boolean);
      for (const sym of symbols) {
        // Handle aliased imports: "foo as bar" → check "foo"
        const actualName = sym.split(/\s+as\s+/)[0].trim();
        if (actualName && !availableExports.has(actualName)) {
          unsatisfied.push(actualName);
        }
      }
    }

    return unsatisfied;
  } catch {
    return [];
  }
}

/**
 * Generate a barrel file that re-exports a core file + matching module database files.
 * Used for both schema.ts and relations.ts barrels.
 *
 * When availableSchemaExports is provided (for relations barrels), each file's
 * imports from @/lib/db/schema are checked. Files with unsatisfied imports are
 * skipped with a warning instead of breaking the build.
 */
function generateDatabaseBarrel(moduleMap, fileName, coreExport, label, availableSchemaExports) {
  const imports = [];

  for (const [id, { dirName, folder }] of moduleMap) {
    const filePath = path.join(process.cwd(), dirName, folder, 'database', fileName);
    if (fs.existsSync(filePath)) {
      if (availableSchemaExports) {
        const unsatisfied = findUnsatisfiedSchemaImports(filePath, availableSchemaExports);
        if (unsatisfied.length > 0) {
          console.warn(`⚠️  ${id}: Skipping ${fileName} (requires missing exports: ${unsatisfied.join(', ')})`);
          continue;
        }
      }
      imports.push({ id, importPath: `@/modules/${folder}/database/${fileName.replace('.ts', '')}` });
    }
  }

  imports.sort((a, b) => a.id.localeCompare(b.id));

  const lines = imports.map(e => `export * from '${e.importPath}'`).join('\n');

  return `/**
 * Auto-Generated ${label} Barrel
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * To regenerate: pnpm run generate-module-registry
 *
 * Re-exports core ${label.toLowerCase()} + all installed module ${label.toLowerCase()}.
 */

export * from '${coreExport}'
${lines}
`;
}

/**
 * Generate dashboard registry for modules that declare dashboard.statCards or dashboard.widgetComponents
 * Scans the arrays and verifies each component file exists
 */
function generateDashboardRegistry(moduleMap) {
  const statCardEntries = [];
  const widgetEntries = [];

  for (const [id, { dirName, folder, manifest }] of moduleMap) {
    const dashboard = manifest.dashboard;
    if (!dashboard || !dashboard.widgets) continue;

    const modulePath = path.join(process.cwd(), dirName, folder);

    // Process statCards
    if (Array.isArray(dashboard.statCards)) {
      for (const componentPath of dashboard.statCards) {
        const relative = componentPath.replace(/^\.\//, '');
        const absolute = path.join(modulePath, relative);
        if (!fs.existsSync(absolute)) {
          console.warn(`⚠️  ${id}: dashboard statCard not found at ${relative}`);
          continue;
        }
        const importSuffix = relative.replace(/\.(tsx?|jsx?)$/, '');
        statCardEntries.push({ id, importPath: `@/modules/${folder}/${importSuffix}` });
      }
    }

    // Process widgetComponents
    if (Array.isArray(dashboard.widgetComponents)) {
      for (const componentPath of dashboard.widgetComponents) {
        const relative = componentPath.replace(/^\.\//, '');
        const absolute = path.join(modulePath, relative);
        if (!fs.existsSync(absolute)) {
          console.warn(`⚠️  ${id}: dashboard widget not found at ${relative}`);
          continue;
        }
        const importSuffix = relative.replace(/\.(tsx?|jsx?)$/, '');
        widgetEntries.push({ id, importPath: `@/modules/${folder}/${importSuffix}` });
      }
    }
  }

  statCardEntries.sort((a, b) => a.id.localeCompare(b.id));
  widgetEntries.sort((a, b) => a.id.localeCompare(b.id));

  // Group entries by module ID
  function groupById(entries) {
    const grouped = {};
    for (const e of entries) {
      if (!grouped[e.id]) grouped[e.id] = [];
      grouped[e.id].push(e.importPath);
    }
    return grouped;
  }

  const statCardsByModule = groupById(statCardEntries);
  const widgetsByModule = groupById(widgetEntries);

  const statCardLines = Object.entries(statCardsByModule).map(([id, paths]) => {
    const loaders = paths.map(p => `    () => import('${p}'),`).join('\n');
    return `  '${id}': [\n${loaders}\n  ],`;
  }).join('\n');

  const widgetLines = Object.entries(widgetsByModule).map(([id, paths]) => {
    const loaders = paths.map(p => `    () => import('${p}'),`).join('\n');
    return `  '${id}': [\n${loaders}\n  ],`;
  }).join('\n');

  return `/**
 * Auto-Generated Module Dashboard Registry
 *
 * DO NOT EDIT THIS FILE MANUALLY!
 * Generated by: scripts/generate-module-registry.js
 * To regenerate: pnpm run generate-module-registry
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DashboardComponentLoader = () => Promise<any>

export const MODULE_DASHBOARD_STAT_CARDS: Record<string, DashboardComponentLoader[]> = {
${statCardLines}
}

export const MODULE_DASHBOARD_WIDGETS: Record<string, DashboardComponentLoader[]> = {
${widgetLines}
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

  // Generate global provider registry
  console.log('📝 Generating provider registry...');
  const providerRegistry = generateProviderRegistry(moduleMap);
  fs.writeFileSync(PROVIDER_REGISTRY_FILE, providerRegistry, 'utf-8');
  console.log('✅ Provider registry generated at:', PROVIDER_REGISTRY_FILE);

  // Generate API route registry
  console.log('📝 Generating API route registry...');
  const moduleApiMap = buildApiMapFromModules(moduleMap);
  const apiRegistry = generateApiRegistry(moduleApiMap);
  fs.writeFileSync(API_REGISTRY_FILE, apiRegistry, 'utf-8');
  console.log(`✅ API registry generated at: ${API_REGISTRY_FILE} (${moduleApiMap.size} modules with API routes)`);

  // Generate dashboard registry
  console.log('📝 Generating dashboard registry...');
  const dashboardRegistry = generateDashboardRegistry(moduleMap);
  fs.writeFileSync(DASHBOARD_REGISTRY_FILE, dashboardRegistry, 'utf-8');
  console.log('✅ Dashboard registry generated at:', DASHBOARD_REGISTRY_FILE);

  // Generate JSON manifest (for runtime use without filesystem scanning)
  console.log('📝 Generating module manifest...');
  const manifest = generateManifest(moduleMap, moduleApiMap);
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('✅ Manifest generated at:', MANIFEST_FILE);

  // Generate schema barrel (lib/db/schema/schema.ts)
  console.log('📝 Generating schema barrel...');
  const schemaBarrel = generateDatabaseBarrel(moduleMap, 'schema.ts', './core-schema', 'Schema');
  fs.writeFileSync(SCHEMA_OUTPUT_FILE, schemaBarrel, 'utf-8');
  console.log('✅ Schema barrel generated at:', SCHEMA_OUTPUT_FILE);

  // Collect available schema exports so relations can be validated
  const availableSchemaExports = collectAvailableSchemaExports(moduleMap);

  // Generate relations barrel (lib/db/schema/relations.ts)
  // Relations files with unsatisfied imports are skipped with a warning
  console.log('📝 Generating relations barrel...');
  const relationsBarrel = generateDatabaseBarrel(moduleMap, 'relations.ts', './core-relations', 'Relations', availableSchemaExports);
  fs.writeFileSync(RELATIONS_OUTPUT_FILE, relationsBarrel, 'utf-8');
  console.log('✅ Relations barrel generated at:', RELATIONS_OUTPUT_FILE);

  // Mirror lib/db/setup.sql into lib/db/setup-sql.ts so /welcome's bootstrap
  // route always runs the canonical schema (no manual sync, no drift).
  console.log('📝 Generating setup-sql.ts...');
  require('./generate-setup-sql.js')();

  console.log('');
  console.log('Registered modules:');
  for (const [id, { dirName, folder }] of moduleMap) {
    console.log(`  - ${id} (from ${dirName}/${folder})`);
  }
  console.log('');
}

main();
