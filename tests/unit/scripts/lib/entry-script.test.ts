/**
 * The entry guard shared by the scripts that must run their main only when
 * started directly (scripts/dev-cache-guard.mjs, generate-test-report.mjs,
 * vendor-google-fonts.mjs), never when a test imports them.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isEntryScript } from '@/scripts/lib/entry-script.js'

const posixIt = process.platform === 'win32' ? it.skip : it

describe('isEntryScript', () => {
  let dir: string
  let script: string
  let url: string

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ari-entry-script-'))
    script = path.join(dir, 'tool.mjs')
    fs.writeFileSync(script, 'export {}\n')
    url = pathToFileURL(script).href
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('is true when argv[1] is the module itself', () => {
    expect(isEntryScript(url, ['node', script])).toBe(true)
  })

  posixIt('is true when argv[1] reaches the module through a symlinked directory', () => {
    const link = path.join(dir, 'linked')
    fs.symlinkSync(dir, link, 'dir')
    const viaLink = path.join(link, 'tool.mjs')
    expect(viaLink).not.toBe(script)
    expect(isEntryScript(url, ['node', viaLink])).toBe(true)
  })

  it('is false for another script', () => {
    const other = path.join(dir, 'other.mjs')
    fs.writeFileSync(other, 'export {}\n')
    expect(isEntryScript(url, ['node', other])).toBe(false)
  })

  it('is false when argv[1] is missing or does not exist', () => {
    expect(isEntryScript(url, ['node'])).toBe(false)
    expect(isEntryScript(url, ['node', path.join(dir, 'missing.mjs')])).toBe(false)
  })

  it('is false under a test runner, where argv[1] is the runner', () => {
    expect(isEntryScript(url)).toBe(false)
  })
})
