/**
 * Reconcile npm deps declared in modules-custom/*\/module.json with root
 * package.json. Called from .ari/cli.js — boot (`./ari start`) runs it before
 * its `pnpm install` so a module dropped into modules-custom/ by hand works
 * after a plain restart, `./ari update` runs it after a successful upstream
 * merge, and `./ari fix-deps` runs it on demand.
 *
 * Because boot runs it on every start, it must stay quiet and idempotent when
 * there is nothing to do: a dep already recorded in any installed root block
 * (see ROOT_DEP_BLOCKS) counts as present and is left alone.
 *
 * Mirrors the conflict policy in lib/modules/npm-installer.ts but collects
 * conflicts in the return value instead of aborting, so the caller can keep
 * going. Only ever ADDS deps missing from every block — never edits or removes
 * an existing entry, and never copies one block's dep into another (that would
 * leave the same package in two blocks at two ranges).
 *
 * Nothing is ever assumed to be fine: a declared range semver-range cannot read
 * lands in `invalid` (reported and skipped) rather than in `satisfied`, and a
 * package two modules disagree on is dropped entirely — writing one module's
 * spec would silently break the other at runtime.
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
import { satisfies, rangeAnchor, isReadableRange } from './lib/semver-range.js';

// Kept in sync with lib/modules/npm-installer.ts:29-32.
const MAX_DEPS_PER_MODULE = 25;
const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const FORBIDDEN_SPEC_TOKENS = ['git:', 'http:', 'https:', 'file:', 'link:', 'workspace:', 'npm:', '..'];
const MAX_SPEC_LEN = 100;

// Blocks pnpm actually installs for this package, lowest precedence first so
// `dependencies` wins the lookup. A dep found in any of these is "present" —
// we never copy it into `dependencies`, which would leave the same package in
// two blocks at two ranges. generate-module-registry.js:129 merges the same way.
//
// `peerDependencies` is deliberately absent: pnpm resolves peers of your
// dependencies, not a root package's own peer declarations, so treating one as
// present would skip the install and leave the module unresolvable.
const ROOT_DEP_BLOCKS = ['optionalDependencies', 'devDependencies', 'dependencies'];

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
    if (anchor === null) {
      // The existing entry carries no comparable version ("*", "", a git URL).
      // Don't second-guess what the user pinned.
      satisfied.push(name);
      continue;
    }
    const result = satisfies(anchor, spec);
    if (result === true) {
      satisfied.push(name);
    } else if (result === false) {
      conflicts.push({ name, declared: spec, existing: current.spec, block: current.block, sources });
    } else {
      // Defensive: collectModuleDeps rejects unreadable ranges up front, so this
      // should be unreachable. If it ever fires, report rather than assume
      // satisfied — assuming would silently accept a version mismatch.
      invalid.push({
        module: sources.join(', '),
        name,
        reason: `unreadable version range "${spec}"`,
      });
    }
  }

  if (added.length === 0) {
    return { ok: true, added, satisfied, conflicts, invalid, changed: false };
  }

  // Only `dependencies` is ever written, so build that snapshot here rather
  // than on every call — the common boot path adds nothing.
  const rootDeps = { ...(rootPkg.dependencies || {}) };
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
  // Packages two modules disagree on — removed from `declared` at the end so
  // neither module's spec gets written.
  const unresolvable = new Set();

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
    } catch (err) {
      // A missing module.json just means "not a module directory" — silent by
      // design. Anything else (EISDIR, EACCES, a broken symlink) is a manifest
      // that exists but could not be read, which must not pass unnoticed.
      if (err && err.code === 'ENOENT') continue;
      invalid.push({
        module: moduleId,
        name: '(manifest)',
        reason: `could not read module.json (${(err && err.code) || 'unknown error'})`,
      });
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
      // Reject here, before the package can be added: a range we cannot read is
      // a range we cannot compare, so writing it would hand pnpm a spec nobody
      // validated. Checking only at comparison time would miss every package
      // that is absent from the root entirely.
      if (!isReadableRange(spec)) {
        invalid.push({ module: moduleId, name, reason: `unreadable version range "${spec}"` });
        continue;
      }

      const existing = declared.get(name);
      if (!existing) {
        declared.set(name, { spec, sources: [moduleId] });
        continue;
      }

      // Two modules want the same package. We anchor on the first declaration's
      // spec; a compatible second declaration just adds a source.
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
        // Installing either spec silently breaks the other module at runtime,
        // which is harder to diagnose than the "Module not found" this whole
        // path exists to prevent. Drop the package and let the user choose.
        unresolvable.add(name);
      }
    }
  }

  for (const name of unresolvable) declared.delete(name);

  return { declared, invalid, conflicts };
}
