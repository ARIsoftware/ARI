/**
 * Tests for lib/modules/scanner.ts
 *
 * Mocks the Node `fs` module to provide in-memory fixture directory/file
 * structures. All filesystem access is stubbed so no real files are read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── fs mock ───────────────────────────────────────────────────────────────────
// Use vi.hoisted so the object is available inside the vi.mock factory.

const { fakeFs } = vi.hoisted(() => ({
  fakeFs: {
    existsSync: vi.fn<(path: string) => boolean>(),
    readdirSync: vi.fn<(path: string, opts: { withFileTypes: boolean }) => any[]>(),
    readFileSync: vi.fn<(path: string, enc: string) => string>(),
  },
}))

vi.mock('fs', () => ({
  existsSync: fakeFs.existsSync,
  readdirSync: fakeFs.readdirSync,
  readFileSync: fakeFs.readFileSync,
}))

// ── import SUT after mock ─────────────────────────────────────────────────────
import { scanInstalledModules, scanForDuplicateModuleIds } from '@/lib/modules/scanner'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a fake Dirent-like object */
function dir(name: string) {
  return { name, isDirectory: () => true, isFile: () => false }
}

/** Empty directory — readdirSync returns nothing */
function setupEmpty() {
  fakeFs.existsSync.mockReturnValue(false)
  fakeFs.readdirSync.mockReturnValue([])
}

/**
 * Configure the fs mock for a typical two-directory layout.
 *
 * @param customModules  directory names under modules-custom (no manifests by default)
 * @param coreModules    directory names under modules-core
 */
function setupDirs(
  customModules: string[],
  coreModules: string[],
  manifestFn?: (dir: string) => string,
) {
  fakeFs.existsSync.mockImplementation((p: string) => {
    // Let the manifest existence check be handled by readFileSync throwing
    // but existsSync for directories should return true
    if (p.endsWith('modules-custom') || p.endsWith('modules-core')) return true
    if (p.endsWith('module.json')) return true
    return false
  })

  fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
    if (p.includes('modules-custom')) return customModules.map(dir)
    if (p.includes('modules-core')) return coreModules.map(dir)
    return []
  })

  fakeFs.readFileSync.mockImplementation((p: string, _enc: string) => {
    const parts = (p as string).split(/[/\\]/)
    // parts: [..., 'modules-{custom|core}', '<moduleName>', 'module.json']
    const moduleName = parts[parts.length - 2]
    if (manifestFn) return manifestFn(moduleName)
    return JSON.stringify({ id: moduleName, name: moduleName })
  })
}

// ── scanInstalledModules ──────────────────────────────────────────────────────

describe('scanInstalledModules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no directories exist', () => {
    setupEmpty()
    expect(scanInstalledModules()).toEqual([])
  })

  it('returns modules from modules-core when modules-custom is absent', () => {
    fakeFs.existsSync.mockImplementation((p: string) => !p.includes('modules-custom'))
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-core')) return ['tasks', 'contacts'].map(dir)
      return []
    })
    const result = scanInstalledModules()
    expect(result).toEqual(['contacts', 'tasks']) // sorted
  })

  it('returns modules from modules-custom when modules-core is absent', () => {
    fakeFs.existsSync.mockImplementation((p: string) => !p.includes('modules-core'))
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-custom')) return ['my-module'].map(dir)
      return []
    })
    const result = scanInstalledModules()
    expect(result).toEqual(['my-module'])
  })

  it('deduplicates modules present in both directories', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-custom')) return ['tasks'].map(dir)
      if (p.includes('modules-core')) return ['tasks', 'contacts'].map(dir)
      return []
    })
    const result = scanInstalledModules()
    expect(result).toEqual(['contacts', 'tasks'])
    // 'tasks' appears once despite being in both dirs
    expect(result.filter(m => m === 'tasks')).toHaveLength(1)
  })

  it('excludes hidden directories (names starting with .)', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((_p: string, _opts: any) => [
      { name: '.hidden', isDirectory: () => true, isFile: () => false },
      { name: 'tasks', isDirectory: () => true, isFile: () => false },
    ])
    const result = scanInstalledModules()
    expect(result).not.toContain('.hidden')
    expect(result).toContain('tasks')
  })

  it('excludes non-directory entries', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((_p: string, _opts: any) => [
      { name: 'README.md', isDirectory: () => false, isFile: () => true },
      { name: 'tasks', isDirectory: () => true, isFile: () => false },
    ])
    const result = scanInstalledModules()
    expect(result).not.toContain('README.md')
    expect(result).toContain('tasks')
  })

  it('returns sorted results', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-core')) return ['zebra', 'alpha', 'mango'].map(dir)
      return []
    })
    const result = scanInstalledModules()
    expect(result).toEqual(['alpha', 'mango', 'zebra'])
  })

  it('returns empty array when readdirSync throws', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation(() => { throw new Error('permission denied') })
    expect(scanInstalledModules()).toEqual([])
  })
})

// ── scanForDuplicateModuleIds ─────────────────────────────────────────────────

describe('scanForDuplicateModuleIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no modules exist', () => {
    setupEmpty()
    expect(scanForDuplicateModuleIds()).toEqual([])
  })

  it('returns empty array when no directory exists', () => {
    fakeFs.existsSync.mockReturnValue(false)
    expect(scanForDuplicateModuleIds()).toEqual([])
  })

  it('returns empty when all modules have unique IDs', () => {
    setupDirs(['my-module'], ['tasks', 'contacts'])
    expect(scanForDuplicateModuleIds()).toEqual([])
  })

  it('detects duplicate IDs within modules-core', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-custom')) return []
      if (p.includes('modules-core')) return ['folder-a', 'folder-b'].map(dir)
      return []
    })
    fakeFs.readFileSync.mockReturnValue(JSON.stringify({ id: 'duplicate-id' }))
    const errors = scanForDuplicateModuleIds()
    expect(errors).toHaveLength(1)
    expect(errors[0].moduleId).toBe('duplicate-id')
    expect(errors[0].directories).toHaveLength(2)
  })

  it('does NOT flag override (same ID in custom then core) as duplicate', () => {
    // modules-custom has "tasks", modules-core also has "tasks" — this is an override, not an error
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-custom')) return ['tasks-custom'].map(dir)
      if (p.includes('modules-core')) return ['tasks-core'].map(dir)
      return []
    })
    // Both report the same ID "tasks"
    fakeFs.readFileSync.mockReturnValue(JSON.stringify({ id: 'tasks' }))
    const errors = scanForDuplicateModuleIds()
    expect(errors).toEqual([])
  })

  it('skips modules with missing manifest (existsSync returns false for manifest)', () => {
    fakeFs.existsSync.mockImplementation((p: string) => {
      if (p.endsWith('module.json')) return false
      return true
    })
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-core')) return ['tasks'].map(dir)
      return []
    })
    expect(scanForDuplicateModuleIds()).toEqual([])
  })

  it('skips modules with invalid JSON in manifest', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-core')) return ['bad-json'].map(dir)
      return []
    })
    fakeFs.readFileSync.mockReturnValue('{ invalid json }')
    expect(scanForDuplicateModuleIds()).toEqual([])
  })

  it('skips modules with no id in manifest', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-core')) return ['no-id'].map(dir)
      return []
    })
    fakeFs.readFileSync.mockReturnValue(JSON.stringify({ name: 'No ID Module' }))
    expect(scanForDuplicateModuleIds()).toEqual([])
  })

  it('skips modules with non-string id in manifest', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-core')) return ['numeric-id'].map(dir)
      return []
    })
    fakeFs.readFileSync.mockReturnValue(JSON.stringify({ id: 42 }))
    expect(scanForDuplicateModuleIds()).toEqual([])
  })

  it('detects duplicates within modules-custom', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-custom')) return ['dir-a', 'dir-b'].map(dir)
      if (p.includes('modules-core')) return []
      return []
    })
    fakeFs.readFileSync.mockReturnValue(JSON.stringify({ id: 'same-id' }))
    const errors = scanForDuplicateModuleIds()
    expect(errors).toHaveLength(1)
    expect(errors[0].moduleId).toBe('same-id')
    expect(errors[0].directories.length).toBe(2)
  })

  it('reports directory paths with the folder prefix', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p.includes('modules-core')) return ['a', 'b'].map(dir)
      return []
    })
    fakeFs.readFileSync.mockReturnValue(JSON.stringify({ id: 'dup' }))
    const errors = scanForDuplicateModuleIds()
    expect(errors[0].directories[0]).toMatch(/modules-core\/a/)
    expect(errors[0].directories[1]).toMatch(/modules-core\/b/)
  })

  it('handles readdirSync throwing for a directory gracefully', () => {
    fakeFs.existsSync.mockReturnValue(true)
    fakeFs.readdirSync.mockImplementation(() => { throw new Error('EACCES') })
    // Should not throw; returns empty errors
    expect(scanForDuplicateModuleIds()).toEqual([])
  })
})
