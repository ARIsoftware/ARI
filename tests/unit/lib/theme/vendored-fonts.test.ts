/**
 * Fonts are self-hosted so browsers never contact Google. Nothing regenerates
 * app/fonts/ automatically, so this is what notices a font missing from it, a
 * file that didn't get committed, or a Google link coming back.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FONTS,
  PRE_SIGNIN_FONT_FAMILY,
  WELCOME_FONT_FAMILY,
  WORDMARK_FONT_FAMILY,
} from '@/lib/theme/fonts'

const ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const FONTS_DIR = path.join(ROOT, 'app', 'fonts')

const css = fs.readFileSync(path.join(FONTS_DIR, 'fonts.css'), 'utf8')
const licenses = fs.readFileSync(path.join(FONTS_DIR, 'LICENSES.txt'), 'utf8')
const referenced = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1])
const declaredFamilies = new Set([...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]))

describe('vendored fonts', () => {
  // A picker font missing from fonts.css silently renders in a fallback font.
  it.each(FONTS.map((font) => [font.id, font.family]))('%s is self-hosted', (_id, family) => {
    const primary = family.match(/^"([^"]+)"/)?.[1]
    expect(primary).toBeDefined()
    expect(declaredFamilies).toContain(primary)
  })

  // The fonts used by name outside the picker (wordmarks, pre-signin pages).
  it.each([
    ['wordmark', WORDMARK_FONT_FAMILY],
    ['welcome dialog', WELCOME_FONT_FAMILY],
    ['pre-signin', PRE_SIGNIN_FONT_FAMILY],
  ])('the %s font is self-hosted', (_use, family) => {
    const primary = family.match(/^"([^"]+)"/)?.[1]
    expect(primary).toBeDefined()
    expect(declaredFamilies).toContain(primary)
  })

  it('references only local files', () => {
    expect(referenced.length).toBeGreaterThan(0)
    for (const url of referenced) expect(url).toMatch(/^\.\/files\/[a-z0-9-]+\.woff2$/)
  })

  it('has every referenced file on disk as a real woff2, and no others', () => {
    const onDisk = fs.readdirSync(path.join(FONTS_DIR, 'files')).sort()
    expect(onDisk).toEqual(referenced.map((url) => path.basename(url)).sort())
    for (const file of onDisk) {
      const magic = fs.readFileSync(path.join(FONTS_DIR, 'files', file)).subarray(0, 4)
      expect(magic.toString('latin1'), file).toBe('wOF2')
    }
  })

  it('ships a license for every family', () => {
    for (const family of declaredFamilies) {
      expect(licenses, family).toContain(`\n${family}\n`)
    }
    expect(licenses.match(/SIL OPEN FONT LICENSE Version 1\.1/g)?.length).toBeGreaterThanOrEqual(
      declaredFamilies.size,
    )
  })

  it('is imported by the root layout', () => {
    const layout = fs.readFileSync(path.join(ROOT, 'app', 'layout.tsx'), 'utf8')
    expect(layout).toContain('import "./fonts/fonts.css"')
  })

  it.each(['app/layout.tsx', 'proxy.ts', 'vercel.json'])('%s does not mention Google', (file) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
    expect(source).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })

  // next/font/google downloads the font on the server while a page compiles, so
  // a build or dev server that cannot reach Google renders a fallback font
  // instead. Every font comes from app/fonts/, by family name, instead.
  it('no source file imports next/font/google', () => {
    const IMPORT = /(?:from|require\()\s*['"]next\/font\/google['"]/
    const SOURCE = /\.(?:[cm]?js|tsx?)$/
    const offenders: string[] = []
    const check = (file: string) => {
      if (SOURCE.test(file) && IMPORT.test(fs.readFileSync(file, 'utf8'))) {
        offenders.push(path.relative(ROOT, file))
      }
    }
    const visit = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'generated') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) visit(full)
        else check(full)
      }
    }
    for (const dir of ['app', 'components', 'hooks', 'lib', 'modules-core']) {
      if (fs.existsSync(path.join(ROOT, dir))) visit(path.join(ROOT, dir))
    }
    for (const file of ['proxy.ts', 'instrumentation.ts', 'next.config.mjs']) {
      if (fs.existsSync(path.join(ROOT, file))) check(path.join(ROOT, file))
    }
    expect(offenders).toEqual([])
  })
})
