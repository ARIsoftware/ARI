/**
 * The pure steps of scripts/vendor-google-fonts.mjs. The downloads themselves
 * only run by hand; their output is checked by
 * tests/unit/lib/theme/vendored-fonts.test.ts.
 */
import { describe, expect, it } from 'vitest'
import * as vendor from '@/scripts/vendor-google-fonts.mjs'

const face = (family: string, style: string, subset: string, url: string) => `/* ${subset} */
@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-weight: 100 900;
  font-display: swap;
  src: url(${url}) format('woff2');
  unicode-range: U+0000-00FF;
}
`
const GSTATIC = 'https://fonts.gstatic.com/s'

describe('googleCssUrl', () => {
  it('builds a css2 URL, leaving out the colon for a family without axes', () => {
    expect(
      vendor.googleCssUrl([
        { name: 'Space Grotesk', axes: 'wght@300..700' },
        { name: 'Press Start 2P' },
      ]),
    ).toBe(
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&family=Press+Start+2P&display=swap',
    )
  })
})

describe('licenseUrl', () => {
  it('uses the google/fonts folder name', () => {
    expect(vendor.licenseUrl('IBM Plex Sans')).toBe(
      'https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsans/OFL.txt',
    )
  })
})

describe('localizeCss', () => {
  it('points each face at a local file and keeps the rest of the rule', () => {
    const { css, files } = vendor.localizeCss(
      face('Inter', 'italic', 'latin-ext', `${GSTATIC}/inter/a.woff2`) +
        face('Press Start 2P', 'normal', 'latin', `${GSTATIC}/psp/b.woff2`),
    )
    expect(css).toContain("src: url(./files/inter-italic-latin-ext.woff2) format('woff2');")
    expect(css).toContain("src: url(./files/press-start-2p-normal-latin.woff2) format('woff2');")
    expect(css).toContain("font-family: 'Inter';")
    expect(css).toContain('unicode-range: U+0000-00FF;')
    expect(css).not.toContain('gstatic')
    expect([...files.values()]).toEqual([
      'inter-italic-latin-ext.woff2',
      'press-start-2p-normal-latin.woff2',
    ])
  })

  it('downloads a file once when several faces share it', () => {
    const url = `${GSTATIC}/inter/a.woff2`
    const { files } = vendor.localizeCss(
      face('Inter', 'normal', 'latin', url) + face('Inter', 'normal', 'latin', url),
    )
    expect(files.size).toBe(1)
  })

  it('refuses two different files that would get the same name', () => {
    expect(() =>
      vendor.localizeCss(
        face('Inter', 'normal', 'latin', `${GSTATIC}/a.woff2`) +
          face('Inter', 'normal', 'latin', `${GSTATIC}/b.woff2`),
      ),
    ).toThrow(/Two files would be named inter-normal-latin\.woff2/)
  })

  it('refuses a face with no subset comment rather than dropping it', () => {
    const noComment = face('Inter', 'normal', 'latin', `${GSTATIC}/a.woff2`).replace(
      /\/\*.*\*\/\n/,
      '',
    )
    expect(() =>
      vendor.localizeCss(face('Inter', 'normal', 'latin', `${GSTATIC}/b.woff2`) + noComment),
    ).toThrow(/Parsed 1 of 2/)
  })

  it('refuses a face that is not woff2', () => {
    const ttf = face('Inter', 'normal', 'latin', `${GSTATIC}/a.ttf`).replace(
      "'woff2'",
      "'truetype'",
    )
    expect(() => vendor.localizeCss(ttf)).toThrow(/Unexpected @font-face/)
  })

  it('refuses a stylesheet with no faces, such as an error page', () => {
    expect(() => vendor.localizeCss('<html>Too many requests</html>')).toThrow(/Parsed 0 of 0/)
  })

  it('refuses a stylesheet that would still load something remotely', () => {
    const css = `@import url(https://evil.example/x.css);\n${face('Inter', 'normal', 'latin', `${GSTATIC}/a.woff2`)}`
    expect(() => vendor.localizeCss(css)).toThrow(/remote URL/)
  })
})

describe('file checks', () => {
  it('recognises woff2 by its signature', () => {
    expect(vendor.isWoff2(Buffer.from('wOF2rest'))).toBe(true)
    expect(vendor.isWoff2(Buffer.from('<html>'))).toBe(false)
  })

  it('recognises the Open Font License', () => {
    expect(vendor.isOpenFontLicense('SIL OPEN FONT LICENSE Version 1.1')).toBe(true)
    expect(vendor.isOpenFontLicense('All rights reserved')).toBe(false)
  })
})

describe('FAMILIES', () => {
  it('lists each family once', () => {
    const names = vendor.FAMILIES.map((family) => family.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
