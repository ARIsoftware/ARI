/**
 * Reconcile npm deps declared in modules-custom/*\/module.json with root
 * package.json. Called from .ari/cli.js — `./ari update` runs it after a
 * successful upstream merge (before `pnpm install`), and `./ari fix-deps`
 * runs it on demand. Boot (`./ari start`) does NOT run it.
 *
 * Mirrors the conflict policy in lib/modules/npm-installer.ts but collects
 * conflicts in the return value instead of aborting, so the caller can keep
 * going. Only ever ADDS missing deps — never edits or removes existing ones.
 *
 * Returns:
 *   {
 *     ok: boolean,
 *     added:     Array<{ name, spec, sources: string[] }>,
 *     satisfied: string[],
 *     conflicts: Array<{ name, declared, existing, sources: string[] }>,
 *     invalid:   Array<{ module, name, reason }>,
 *     changed:   boolean,
 *     skipped?:  'vercel' | 'no-custom-modules' | 'no-package-json',
 *     error?:    string,
 *   }
 *
 * Atomic write: serialize to package.json.ari-reconcile.tmp, then renameSync
 * over package.json. POSIX guarantees atomic same-volume rename; same on
 * Windows for same-volume.
 *
 * Concurrency note: no cross-process locking. A concurrent /api/modules/download
 * install racing with this reconciler can result in last-writer-wins on
 * content (atomic rename means corruption is impossible). MVP-acceptable.
 */

const fs = require('fs');
const path = require('path');
const { satisfies, rangeAnchor } = require('./lib/semver-range.js');

// Kept in sync with lib/modules/npm-installer.ts:29-32.
const MAX_DEPS_PER_MODULE = 25;
const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const FORBIDDEN_SPEC_TOKENS = ['git:', 'http:', 'https:', 'file:', 'link:', 'workspace:', 'npm:', '..'];
const MAX_SPEC_LEN = 100;

function emptyResult(extra) {
  return {
    ok: true,
    added: [],
    satisfied: [],
    conflicts: [],
    invalid: [],
    changed: false,
    ...extra,
  };
}

function reconcileCustomModuleDeps(root) {
  if (process.env.VERCEL) return emptyResult({ skipped: 'vercel' });

  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return emptyResult({ skipped: 'no-package-json' });

  const customDir = path.join(root, 'modules-custom');
  if (!fs.existsSync(customDir)) return emptyResult({ skipped: 'no-custom-modules' });

  try {
    return reconcileInner(pkgPath, customDir);
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err), added: [], satisfied: [], conflicts: [], invalid: [], changed: false };
  }
}

function reconcileInner(pkgPath, customDir) {
  const rootPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const rootDeps = { ...(rootPkg.dependencies || {}) };

  const { declared, invalid, conflicts: interModuleConflicts } = collectModuleDeps(customDir);

  const added = [];
  const satisfied = [];
  const conflicts = [...interModuleConflicts];

  for (const [name, { spec, sources }] of declared) {
    const existing = rootDeps[name];
    if (!existing) {
      added.push({ name, spec, sources });
      continue;
    }
    const anchor = rangeAnchor(existing);
    if (!anchor) {
      // Existing form is unknown (e.g. "*", git URL). Don't second-guess.
      satisfied.push(name);
      continue;
    }
    const result = satisfies(anchor, spec);
    if (result === true) {
      satisfied.push(name);
    } else {
      conflicts.push({ name, declared: spec, existing, sources });
    }
  }

  if (added.length === 0) {
    return { ok: true, added, satisfied, conflicts, invalid, changed: false };
  }

  for (const { name, spec } of added) rootDeps[name] = spec;
  const sortedDeps = {};
  for (const k of Object.keys(rootDeps).sort()) sortedDeps[k] = rootDeps[k];

  const newPkg = { ...rootPkg, dependencies: sortedDeps };
  const serialized = JSON.stringify(newPkg, null, 2) + '\n';

  const tmpPath = pkgPath + '.ari-reconcile.tmp';
  try {
    fs.writeFileSync(tmpPath, serialized);
    fs.renameSync(tmpPath, pkgPath);
  } catch (err) {
    // Clean up an orphaned temp file so the next run doesn't see leftover state.
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }

  return { ok: true, added, satisfied, conflicts, invalid, changed: true };
}

function collectModuleDeps(customDir) {
  // Returns { declared: Map<name, { spec, sources: string[] }>, invalid, conflicts }
  const declared = new Map();
  const invalid = [];
  const conflicts = [];

  let entries;
  try {
    entries = fs.readdirSync(customDir, { withFileTypes: true });
  } catch {
    return { declared, invalid, conflicts };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const moduleId = entry.name;
    const manifestPath = path.join(customDir, moduleId, 'module.json');

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      // Missing or malformed module.json — skip this directory.
      continue;
    }

    const deps = manifest && manifest.npmDependencies;
    if (!deps || typeof deps !== 'object') continue;

    const depEntries = Object.entries(deps);
    if (depEntries.length === 0) continue;
    if (depEntries.length > MAX_DEPS_PER_MODULE) {
      invalid.push({
        module: moduleId,
        name: '(manifest)',
        reason: `declares ${depEntries.length} deps; limit is ${MAX_DEPS_PER_MODULE}`,
      });
      continue;
    }

    for (const [name, spec] of depEntries) {
      if (!NPM_NAME_RE.test(name)) {
        invalid.push({ module: moduleId, name, reason: 'invalid npm package name' });
        continue;
      }
      if (typeof spec !== 'string' || spec.length === 0 || spec.length > MAX_SPEC_LEN) {
        invalid.push({ module: moduleId, name, reason: 'invalid version spec' });
        continue;
      }
      const forbidden = FORBIDDEN_SPEC_TOKENS.find((t) => spec.includes(t));
      if (forbidden) {
        invalid.push({ module: moduleId, name, reason: `contains forbidden token "${forbidden}"` });
        continue;
      }

      const existing = declared.get(name);
      if (!existing) {
        declared.set(name, { spec, sources: [moduleId] });
        continue;
      }

      // Two modules want the same package. First declaration wins; the second
      // is logged either as a peer source (compatible) or as a conflict
      // (incompatible). We anchor on the first declaration's spec.
      const firstAnchor = rangeAnchor(existing.spec);
      const compatible =
        firstAnchor === null ? true : satisfies(firstAnchor, spec) === true;
      if (compatible) {
        existing.sources.push(moduleId);
      } else {
        conflicts.push({
          name,
          declared: spec,
          existing: existing.spec,
          sources: [moduleId, ...existing.sources],
        });
      }
    }
  }

  return { declared, invalid, conflicts };
}

module.exports = { reconcileCustomModuleDeps };
