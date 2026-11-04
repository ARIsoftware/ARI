/**
 * The cache guard run as it is run: the real script, as a child process. The
 * rules it applies are covered by dev-cache-guard.test.ts.
 *
 * A lab suite: it spawns a process, so it is left out of the test report that
 * is generated on every dev boot. See vitest.config.ts.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAB_NODE, REPO_ROOT } from '../ari-cli/harness'

const posix = process.platform === 'win32' ? describe.skip : describe

posix('dev-cache-guard as the entry script', { timeout: 60_000 }, () => {
  it('runs when started through a symlinked checkout path', () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ari-cache-guard-link-'))
    try {
      const link = path.join(dir, 'ARI')
      fs.symlinkSync(REPO_ROOT, link, 'dir')
      const script = path.join(link, 'scripts', 'dev-cache-guard.mjs')
      expect(fs.realpathSync(script)).not.toBe(script) // the path really is a symlinked one
      // ARI_SKIP_CACHE_GUARD keeps it away from .next: the message proves the entry guard fired.
      const result = spawnSync(LAB_NODE, [script], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, ARI_SKIP_CACHE_GUARD: '1' },
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('[cache-guard] Skipped (ARI_SKIP_CACHE_GUARD=1).')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
