/**
 * Shared command prompts are kept as real files in three places, one per tool
 * (see "Multi-Agent Support" in CLAUDE.md). Nothing copies them automatically,
 * so this is what notices when an edit reached only some of them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..')
const SOURCE = '.agents/commands'
const COPIES = ['.claude/commands', '.codex/prompts']

const prompts = fs
  .readdirSync(path.join(ROOT, SOURCE))
  .filter((name) => name.endsWith('.md'))
  .sort()

describe('shared command prompts', () => {
  it('exist', () => {
    expect(prompts.length).toBeGreaterThan(0)
  })

  describe.each(COPIES)('%s', (dir) => {
    it('holds the same prompts, and no others', () => {
      const present = fs
        .readdirSync(path.join(ROOT, dir))
        .filter((name) => name.endsWith('.md'))
        .sort()

      expect(present).toEqual(prompts)
    })

    it.each(prompts)('%s is identical to the copy in .agents/commands', (name) => {
      const source = fs.readFileSync(path.join(ROOT, SOURCE, name), 'utf8')
      const copy = fs.readFileSync(path.join(ROOT, dir, name), 'utf8')

      expect(copy === source, `${dir}/${name} differs from ${SOURCE}/${name}`).toBe(true)
    })
  })
})
