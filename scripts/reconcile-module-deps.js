/**
 * Reconcile npm deps declared in modules-custom/*\/module.json with root
 * package.json. Called from .ari/cli.js — boot (`./ari start`) runs it before
 * its `pnpm install` so a module dropped into modules-custom/ by hand works
 * after a plain restart, `./ari update` runs it after a successful upstream
 * merge, and `./ari fix-deps` runs it on demand.
 *
 * Because boot runs it on every start, it must stay quiet and idempotent when
 * there is nothing to do: a dep already recorded in ANY root dependency block
 * counts as present, and a range form this checker cannot parse is assumed
 * satisfied rather than reported (see the satisfies() note below).
 *
 * Mirrors the conflict policy in lib/modules/npm-installer.ts but collects
 * conflicts in the return value instead of aborting, so the caller can keep
 * going. Only ever ADDS deps missing from every block — never edits or removes
 * an existing entry, and never copies one block's dep into another (that would
 * leave the same package in two blocks at two ranges).
 *
 * Returns:
 *   {
 *     ok: boolean,
 *     added:     Array<{ name, spec, sources: string[] }>,
 *     satisfied: string[],
 *     conflicts: Array<{ name, declared, existing, block?, sources: string[] }>,
 *     invalid:   Array<{ module, name, reason }>,
 *     changed:   boolean,
 *     skipped?:  'vercel' | 'no-custom-modules' | 'no-package-json',
 *     error?:    string,
 *   }
 *
 * `block` is set on root-vs-module conflicts (which dependency block already
 * holds the package) and absent on module-vs-module conflicts.
 *
 * Atomic write: serialize to package.json.ari-reconcile.tmp, then renameSync
 * over package.json. POSIX guarantees atomic same-volume rename; same on
 * Windows for same-volume.
 *
 * Concurrency note: no cross-process locking. A concurrent /api/modules/download
 * install racing with this reconciler can result in last-writer-wins on
 * content (atomic rename means corruption is impossible). MVP-acceptable.
 */

import fs from 'fs';
import path from 'path';
import { satisfies, rangeAnchor } from './lib/semver-range.js';

// Kept in sync with lib/modules/npm-installer.ts:29-32.
const MAX_DEPS_PER_MODULE = 25;
const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const FORBIDDEN_SPEC_TOKENS = ['git:', 'http:', 'https:', 'file:', 'link:', 'workspace:', 'npm:', '..'];
const MAX_SPEC_LEN = 100;

// Every block a dep can already be recorded in, lowest precedence first so
// `dependencies` wins the lookup. A dep found in any of these is "present" —
// we never copy it into `dependencies`, which would leave the same package in
// two blocks at two ranges. generate-module-registry.js:129 merges the same way.
const ROOT_DEP_BLOCKS = [
  'peerDependencies',
  'optionalDependencies',
  'devDependencies',
  'dependencies',
];

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

export function reconcileCustomModuleDeps(root) {
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
  const rootSpecs = collectRootSpecs(rootPkg);

  const { declared, invalid, conflicts: interModuleConflicts } = collectModuleDeps(customDir);

  const added = [];
  const satisfied = [];
  const conflicts = [...interModuleConflicts];

  for (const [name, { spec, sources }] of declared) {
    const current = rootSpecs[name];
    // Strict undefined check: an entry recorded as "" is present, not missing,
    // and overwriting it would break the never-edit-existing contract.
    if (current === undefined) {
      added.push({ name, spec, sources });
      continue;
    }
    const anchor = rangeAnchor(current.spec);
    // Two ways to be un-comparable, both treated as satisfied:
    //   anchor === null  — existing form carries no version ("*", "", git URL)
    //   satisfies(…) === null — declared range uses a form this checker does
    //     not parse (">1.0.0", "1.x", "^1 || ^2", ">=1.0.0 <2.0.0", ranges).
    // Only an explicit false is a real conflict. generate-module-registry.js:141
    // makes the same call; guessing otherwise would print a false conflict on
    // every boot for perfectly valid npm ranges.
    if (anchor === null || satisfies(anchor, spec) !== false) {
      satisfied.push(name);
      continue;
    }
    conflicts.push({
      name,
      declared: spec,
      existing: current.spec,
      block: current.block,
      sources,
    });
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

function collectRootSpecs(rootPkg) {
  // Prototype-free map: "constructor" is a legal npm package name and a member
  // of Object.prototype, so a plain-object lookup would report it as already
  // present and silently skip installing it. (The other prototype members carry
  // uppercase letters or a leading underscore, so NPM_NAME_RE rejects them
  // before they ever reach a lookup — constructor is the one that gets through.)
  const specs = Object.create(null);
  for (const block of ROOT_DEP_BLOCKS) {
    const entries = rootPkg[block];
    if (!entries || typeof entries !== 'object') continue;
    for (const name of Object.keys(entries)) {
      specs[name] = { spec: entries[name], block };
    }
  }
  return specs;
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
    // Dot-prefixed dirs are not modules — lib/modules/scanner.ts:28 filters them
    // the same way, so a shelved ".task-monsters-old" must not keep injecting
    // deps into package.json on every boot.
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const moduleId = entry.name;
    const manifestPath = path.join(customDir, moduleId, 'module.json');

    let raw;
    try {
      raw = fs.readFileSync(manifestPath, 'utf8');
    } catch {
      // No module.json at all — not a module directory. Silent by design.
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch {
      // A manifest that exists but does not parse is a real problem worth
      // surfacing: boot is the main path for hand-copied modules, so silence
      // here reads as "synced fine" and the module then fails to resolve.
      invalid.push({ module: moduleId, name: '(manifest)', reason: 'unparseable module.json' });
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
      // Same un-comparable-is-satisfied rule as the root comparison above:
      // only an explicit false counts as an inter-module conflict.
      const firstAnchor = rangeAnchor(existing.spec);
      const compatible = firstAnchor === null || satisfies(firstAnchor, spec) !== false;
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
