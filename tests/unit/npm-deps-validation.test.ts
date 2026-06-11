import { describe, it, expect } from 'vitest'
import { validateNpmDeps } from '@/lib/modules/npm-installer'

describe('validateNpmDeps — valid entries', () => {
  it('returns null for a valid package name and semver spec', () => {
    expect(validateNpmDeps('my-module', [['react', '^18.0.0']])).toBeNull()
  })

  it('returns null for a scoped package name', () => {
    expect(validateNpmDeps('my-module', [['@scope/pkg', '^1.0.0']])).toBeNull()
  })

  it('returns null for empty entries (zero deps)', () => {
    expect(validateNpmDeps('my-module', [])).toBeNull()
  })
})

describe('validateNpmDeps — invalid package names', () => {
  it('rejects uppercase package names', () => {
    const result = validateNpmDeps('my-module', [['UPPER', '1.0.0']])
    expect(result).toMatch(/UPPER/)
  })

  it('rejects names with spaces', () => {
    const result = validateNpmDeps('my-module', [['bad name', '1.0.0']])
    expect(result).toMatch(/bad name/)
  })

  it('rejects path-traversal package names', () => {
    const result = validateNpmDeps('my-module', [['../evil', '1.0.0']])
    expect(result).not.toBeNull()
  })
})

describe('validateNpmDeps — forbidden version specs', () => {
  it('rejects git: protocol', () => {
    expect(validateNpmDeps('m', [['pkg', 'git:user/repo']])).toMatch(/git:/)
  })

  it('rejects https: protocol', () => {
    expect(validateNpmDeps('m', [['pkg', 'https://example.com/pkg.tgz']])).toMatch(/https:/)
  })

  it('rejects file: protocol', () => {
    expect(validateNpmDeps('m', [['pkg', 'file:../local']])).toMatch(/file:/)
  })

  it('rejects link: protocol', () => {
    expect(validateNpmDeps('m', [['pkg', 'link:../local']])).toMatch(/link:/)
  })

  it('rejects workspace: protocol', () => {
    expect(validateNpmDeps('m', [['pkg', 'workspace:*']])).toMatch(/workspace:/)
  })

  it('rejects npm: alias protocol', () => {
    expect(validateNpmDeps('m', [['pkg', 'npm:other-pkg@1.0.0']])).toMatch(/npm:/)
  })

  it('rejects specs containing ..', () => {
    expect(validateNpmDeps('m', [['pkg', '../evil']])).not.toBeNull()
  })
})

describe('validateNpmDeps — spec length and type', () => {
  it('rejects empty spec', () => {
    expect(validateNpmDeps('m', [['pkg', '']])).not.toBeNull()
  })

  it('rejects non-string spec', () => {
    expect(validateNpmDeps('m', [['pkg', 123 as unknown as string]])).not.toBeNull()
  })

  it('rejects spec over 100 characters', () => {
    const longSpec = '^' + '1'.repeat(100)
    expect(validateNpmDeps('m', [['pkg', longSpec]])).not.toBeNull()
  })
})

describe('validateNpmDeps — dep count limit', () => {
  it('rejects 26 deps (over the limit of 25)', () => {
    const entries: Array<[string, string]> = Array.from(
      { length: 26 },
      (_, i) => [`pkg-${i}`, '^1.0.0']
    )
    const result = validateNpmDeps('my-module', entries)
    expect(result).toMatch(/limit is 25/)
  })

  it('accepts exactly 25 deps', () => {
    const entries: Array<[string, string]> = Array.from(
      { length: 25 },
      (_, i) => [`pkg-${i}`, '^1.0.0']
    )
    expect(validateNpmDeps('my-module', entries)).toBeNull()
  })
})
