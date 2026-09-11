import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { reconcileCustomModuleDeps } from '@/scripts/reconcile-module-deps.js'

// Manifest value: an object is serialized, a raw string is written verbatim
// (for malformed-JSON cases), and null creates the directory with no module.json.
type Manifest = Record<string, unknown> | string | null

const roots: string[] = []

function makeProject(pkg: Record<string, unknown>, modules: Record<string, Manifest> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ari-reconcile-'))
  roots.push(root)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  const customDir = path.join(root, 'modules-custom')
  fs.mkdirSync(customDir)
  for (const [id, manifest] of Object.entries(modules)) {
    const dir = path.join(customDir, id)
    fs.mkdirSync(dir)
    if (manifest === null) continue
    const body = typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
    fs.writeFileSync(path.join(dir, 'module.json'), body)
  }
  return root
}

function readPkg(root: string) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true })
  delete process.env.VERCEL
})

describe('adding missing deps', () => {
  it('adds a dep declared by a module and absent from the root', () => {
    const root = makeProject(
      { name: 'ari', dependencies: { react: '^19.0.0' } },
      { mymod: { npmDependencies: { 'ical-expander': '^3.1.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(true)
    expect(result.added).toEqual([{ name: 'ical-expander', spec: '^3.1.0', sources: ['mymod'] }])
    expect(readPkg(root).dependencies).toEqual({
      react: '^19.0.0',
      'ical-expander': '^3.1.0',
    })
  })

  it('is a no-op on the second run', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { mymod: { npmDependencies: { 'ical-expander': '^3.1.0' } } },
    )
    expect(reconcileCustomModuleDeps(root).changed).toBe(true)
    const after = reconcileCustomModuleDeps(root)
    expect(after.changed).toBe(false)
    expect(after.added).toEqual([])
    expect(after.satisfied).toEqual(['ical-expander'])
  })

  it('sorts dependencies and preserves unrelated package.json fields', () => {
    const root = makeProject(
      {
        name: 'ari',
        version: '2.0.5',
        type: 'module',
        dependencies: { zod: '^3.0.0' },
        scripts: { dev: 'next dev' },
      },
      { mymod: { npmDependencies: { axios: '^1.0.0' } } },
    )
    reconcileCustomModuleDeps(root)
    const pkg = readPkg(root)

    expect(Object.keys(pkg.dependencies)).toEqual(['axios', 'zod'])
    expect(pkg.version).toBe('2.0.5')
    expect(pkg.type).toBe('module')
    expect(pkg.scripts).toEqual({ dev: 'next dev' })
  })

  it('leaves package.json untouched when there is nothing to add', () => {
    const root = makeProject(
      { name: 'ari', dependencies: { react: '^19.0.0' } },
      { mymod: { npmDependencies: { react: '^18.0.0' } } },
    )
    const before = fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    const result = reconcileCustomModuleDeps(root)

    expect(result.changed).toBe(false)
    expect(result.conflicts).toHaveLength(1)
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before)
  })

  it('does not leave the atomic temp file behind', () => {
    const root = makeProject({ name: 'ari' }, { mymod: { npmDependencies: { axios: '^1.0.0' } } })
    reconcileCustomModuleDeps(root)
    expect(fs.existsSync(path.join(root, 'package.json.ari-reconcile.tmp'))).toBe(false)
  })
})

describe('every installed root dependency block counts as present', () => {
  it.each([['devDependencies'], ['optionalDependencies']])(
    'a compatible dep in %s is satisfied, not re-added',
    (block) => {
      const root = makeProject(
        { name: 'ari', dependencies: {}, [block]: { '@types/three': '^0.184.1' } },
        { mymod: { npmDependencies: { '@types/three': '^0.184.0' } } },
      )
      const result = reconcileCustomModuleDeps(root)

      expect(result.changed).toBe(false)
      expect(result.satisfied).toEqual(['@types/three'])
      expect(readPkg(root).dependencies).toEqual({})
    },
  )

  it('reports which block an incompatible dep lives in, without copying it across', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {}, devDependencies: { three: '^0.170.0' } },
      { mymod: { npmDependencies: { three: '^0.184.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.added).toEqual([])
    expect(result.changed).toBe(false)
    expect(result.conflicts).toEqual([
      {
        name: 'three',
        declared: '^0.184.0',
        existing: '^0.170.0',
        block: 'devDependencies',
        sources: ['mymod'],
      },
    ])
    // Never duplicated into dependencies — that would leave one package in two
    // blocks at two ranges.
    expect(readPkg(root).dependencies).toEqual({})
  })

  it('lets dependencies win over a conflicting devDependencies entry', () => {
    const root = makeProject(
      {
        name: 'ari',
        dependencies: { three: '^0.184.0' },
        devDependencies: { three: '^0.170.0' },
      },
      { mymod: { npmDependencies: { three: '^0.184.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.conflicts).toEqual([])
    expect(result.satisfied).toEqual(['three'])
  })

  it('does not treat peerDependencies as present, since pnpm never installs them', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {}, peerDependencies: { react: '^19.0.0' } },
      { mymod: { npmDependencies: { react: '^19.0.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.satisfied).toEqual([])
    expect(result.added).toEqual([{ name: 'react', spec: '^19.0.0', sources: ['mymod'] }])
    expect(readPkg(root).dependencies).toEqual({ react: '^19.0.0' })
  })
})

describe('range comparison', () => {
  // Root pins 1.5.0. These ranges all include it, so they are satisfied — and
  // crucially they are evaluated, not waved through for being hard to parse.
  it.each([
    ['>1.0.0'],
    ['1.x'],
    ['^1 || ^2'],
    ['>=1.0.0 <2.0.0'],
    ['1.2.3 - 2.0.0'],
    ['~1.5.0'],
    ['1.5'],
    ['>=1.5.0'],
  ])('accepts the satisfied range %s without a warning', (spec) => {
    const root = makeProject(
      { name: 'ari', dependencies: { pkg: '^1.5.0' } },
      { mymod: { npmDependencies: { pkg: spec } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.conflicts).toEqual([])
    expect(result.invalid).toEqual([])
    expect(result.satisfied).toEqual(['pkg'])
    expect(result.changed).toBe(false)
  })

  // The regression that matters: these plainly exclude the root's 19.2.0 and
  // must not be silently accepted just because they are not caret ranges.
  it.each([['18.x'], ['>=16 <18'], ['^17 || ^18'], ['16.0.0 - 18.9.9'], ['<19.0.0'], ['~18.2.0']])(
    'reports the conflicting range %s instead of assuming it is fine',
    (spec) => {
      const root = makeProject(
        { name: 'ari', dependencies: { react: '^19.2.0' } },
        { mymod: { npmDependencies: { react: spec } } },
      )
      const result = reconcileCustomModuleDeps(root)

      expect(result.satisfied).toEqual([])
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0]).toMatchObject({ name: 'react', declared: spec })
    },
  )

  it('reports a range it cannot read as skipped, never as satisfied', () => {
    const root = makeProject(
      { name: 'ari', dependencies: { pkg: '^1.5.0' } },
      { mymod: { npmDependencies: { pkg: '^not-a-version' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.satisfied).toEqual([])
    expect(result.conflicts).toEqual([])
    expect(result.invalid).toEqual([
      { module: 'mymod', name: 'pkg', reason: 'unreadable version range "^not-a-version"' },
    ])
    expect(result.changed).toBe(false)
  })

  it('rejects an unreadable range even when the package is absent from the root', () => {
    // The comparison path never runs for a missing package, so the range has to
    // be validated up front or an unchecked spec gets written and pnpm chokes.
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { mymod: { npmDependencies: { weird: '^not-a-version' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.added).toEqual([])
    expect(result.changed).toBe(false)
    expect(result.invalid).toEqual([
      { module: 'mymod', name: 'weird', reason: 'unreadable version range "^not-a-version"' },
    ])
    expect(readPkg(root).dependencies).toEqual({})
  })

  it.each([['*'], ['x'], ['latest'], ['']])(
    'treats the versionless existing spec %s as satisfied and never overwrites it',
    (existing) => {
      const root = makeProject(
        { name: 'ari', dependencies: { pkg: existing } },
        { mymod: { npmDependencies: { pkg: '^9.9.9' } } },
      )
      const result = reconcileCustomModuleDeps(root)

      expect(result.added).toEqual([])
      expect(result.satisfied).toEqual(['pkg'])
      expect(readPkg(root).dependencies.pkg).toBe(existing)
    },
  )

  it('still reports a genuinely incompatible range', () => {
    const root = makeProject(
      { name: 'ari', dependencies: { react: '^19.0.0' } },
      { mymod: { npmDependencies: { react: '^18.0.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.conflicts).toEqual([
      {
        name: 'react',
        declared: '^18.0.0',
        existing: '^19.0.0',
        block: 'dependencies',
        sources: ['mymod'],
      },
    ])
  })
})

describe('prototype-chain safety', () => {
  // "constructor" is the only Object.prototype member that is also a legal npm
  // package name — the rest (toString, valueOf, hasOwnProperty, …) carry
  // uppercase letters and __proto__ starts with an underscore, so NPM_NAME_RE
  // rejects them before they can reach a lookup.
  it('adds a dep named constructor instead of resolving it against Object.prototype', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { mymod: { npmDependencies: { constructor: '^1.0.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.satisfied).toEqual([])
    expect(result.added).toEqual([{ name: 'constructor', spec: '^1.0.0', sources: ['mymod'] }])
    expect(Object.keys(readPkg(root).dependencies)).toContain('constructor')
  })

  it('compares an existing constructor entry normally rather than inheriting one', () => {
    const root = makeProject(
      { name: 'ari', dependencies: { constructor: '^1.0.0' } },
      { mymod: { npmDependencies: { constructor: '^2.0.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.added).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].name).toBe('constructor')
  })

  it('rejects __proto__ as an invalid package name before it can reach a write', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { mymod: { npmDependencies: { __proto__: '^1.0.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.added).toEqual([])
    expect(result.changed).toBe(false)
    expect(Object.getPrototypeOf(readPkg(root).dependencies)).toBe(Object.prototype)
  })
})

describe('module directory scanning', () => {
  it('ignores dot-prefixed directories, matching lib/modules/scanner.ts', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { '.task-monsters-old': { npmDependencies: { three: '^0.184.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.added).toEqual([])
    expect(result.changed).toBe(false)
  })

  it('reports a manifest that exists but does not parse', () => {
    const root = makeProject({ name: 'ari', dependencies: {} }, { broken: '{ "npmDependencies": ' })
    const result = reconcileCustomModuleDeps(root)

    expect(result.invalid).toEqual([
      { module: 'broken', name: '(manifest)', reason: 'unparseable module.json' },
    ])
  })

  it('stays silent for a directory with no module.json', () => {
    const root = makeProject({ name: 'ari', dependencies: {} }, { 'not-a-module': null })
    const result = reconcileCustomModuleDeps(root)

    expect(result.invalid).toEqual([])
    expect(result.added).toEqual([])
  })

  it('reports a manifest that exists but cannot be read', () => {
    // module.json as a directory: readFileSync fails with EISDIR, not ENOENT.
    // Only the missing case may be silent.
    const root = makeProject({ name: 'ari', dependencies: {} }, { weird: null })
    fs.mkdirSync(path.join(root, 'modules-custom', 'weird', 'module.json'))
    const result = reconcileCustomModuleDeps(root)

    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0]).toMatchObject({ module: 'weird', name: '(manifest)' })
    expect(result.invalid[0].reason).toContain('could not read module.json')
  })

  it('ignores a manifest with no or empty npmDependencies', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { a: { id: 'a' }, b: { npmDependencies: {} }, c: { npmDependencies: 'nope' } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.added).toEqual([])
    expect(result.invalid).toEqual([])
  })
})

describe('dep validation', () => {
  it('rejects an invalid package name', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { mymod: { npmDependencies: { Bad_Name: '^1.0.0' } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.invalid).toEqual([
      { module: 'mymod', name: 'Bad_Name', reason: 'invalid npm package name' },
    ])
    expect(result.added).toEqual([])
  })

  it.each([
    ['file:../evil', 'file:'],
    ['git:whatever', 'git:'],
    ['https://example.com/x.tgz', 'https:'],
    ['workspace:*', 'workspace:'],
  ])('rejects the forbidden spec %s', (spec, token) => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { mymod: { npmDependencies: { evil: spec } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.invalid).toEqual([
      { module: 'mymod', name: 'evil', reason: `contains forbidden token "${token}"` },
    ])
    expect(readPkg(root).dependencies).toEqual({})
  })

  it.each([
    ['an empty spec', ''],
    ['an over-long spec', '^' + '1'.repeat(200)],
    ['a non-string spec', 123 as unknown as string],
  ])('rejects %s', (_label, spec) => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { mymod: { npmDependencies: { pkg: spec } } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.invalid).toEqual([
      { module: 'mymod', name: 'pkg', reason: 'invalid version spec' },
    ])
  })

  it('rejects a manifest declaring more than 25 deps', () => {
    const many: Record<string, string> = {}
    for (let i = 0; i < 26; i++) many[`pkg-${i}`] = '^1.0.0'
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      { mymod: { npmDependencies: many } },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.invalid).toEqual([
      { module: 'mymod', name: '(manifest)', reason: 'declares 26 deps; limit is 25' },
    ])
    expect(result.added).toEqual([])
  })
})

describe('inter-module comparison', () => {
  it('merges compatible declarations and records both sources', () => {
    // Identical specs, so the result does not depend on readdir order deciding
    // which module is anchored first.
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      {
        a: { npmDependencies: { zod: '^3.22.0' } },
        b: { npmDependencies: { zod: '^3.22.0' } },
      },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.conflicts).toEqual([])
    expect(result.added).toHaveLength(1)
    expect(result.added[0].sources.sort()).toEqual(['a', 'b'])
  })

  it('writes neither spec when two modules want incompatible majors', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      {
        a: { npmDependencies: { zod: '^3.22.0' } },
        b: { npmDependencies: { zod: '^4.0.0' } },
      },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].name).toBe('zod')
    // Module-vs-module conflicts carry no root block — the other range belongs
    // to a sibling module, not package.json.
    expect(result.conflicts[0].block).toBeUndefined()
    // Picking a side would silently break the losing module at runtime.
    expect(result.added).toEqual([])
    expect(result.changed).toBe(false)
    expect(readPkg(root).dependencies).toEqual({})
  })

  it('still adds the other deps of modules that disagree on one package', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      {
        a: { npmDependencies: { zod: '^3.22.0', axios: '^1.0.0' } },
        b: { npmDependencies: { zod: '^4.0.0', dayjs: '^1.11.0' } },
      },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.added.map((a: { name: string }) => a.name).sort()).toEqual(['axios', 'dayjs'])
    expect(Object.keys(readPkg(root).dependencies).sort()).toEqual(['axios', 'dayjs'])
  })

  it('accepts a compatible second declaration expressed as a different range form', () => {
    const root = makeProject(
      { name: 'ari', dependencies: {} },
      {
        a: { npmDependencies: { zod: '^3.22.0' } },
        b: { npmDependencies: { zod: '>=3.20.0 <4' } },
      },
    )
    const result = reconcileCustomModuleDeps(root)

    expect(result.conflicts).toEqual([])
    expect(result.added).toHaveLength(1)
  })
})

describe('skip and error paths', () => {
  it('skips on Vercel', () => {
    const root = makeProject({ name: 'ari' }, { mymod: { npmDependencies: { axios: '^1.0.0' } } })
    process.env.VERCEL = '1'
    const result = reconcileCustomModuleDeps(root)

    expect(result.skipped).toBe('vercel')
    expect(result.changed).toBe(false)
    expect(readPkg(root).dependencies).toBeUndefined()
  })

  it('skips when there is no package.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ari-reconcile-'))
    roots.push(root)
    fs.mkdirSync(path.join(root, 'modules-custom'))

    expect(reconcileCustomModuleDeps(root).skipped).toBe('no-package-json')
  })

  it('skips when there is no modules-custom directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ari-reconcile-'))
    roots.push(root)
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"ari"}')

    expect(reconcileCustomModuleDeps(root).skipped).toBe('no-custom-modules')
  })

  it('returns ok:false rather than throwing on an unparseable package.json', () => {
    const root = makeProject({ name: 'ari' }, {})
    fs.writeFileSync(path.join(root, 'package.json'), '{ not json')
    const result = reconcileCustomModuleDeps(root)

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.changed).toBe(false)
  })
})
