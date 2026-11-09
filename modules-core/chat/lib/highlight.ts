/**
 * Small, dependency-free syntax highlighter for chat code blocks. It returns
 * plain tokens (never HTML) so the renderer builds React nodes and output
 * stays XSS-safe. One linear scan per block; broad language families rather
 * than full grammars — the goal is readable replies, not an IDE.
 */

export type TokenKind = 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'type' | 'property'

export interface Token {
  kind: TokenKind
  text: string
}

interface Family {
  line: string[]
  block?: [string, string]
  /** Python-style triple-quoted strings. */
  triple?: boolean
  /** Keywords compared case-insensitively (SQL). */
  sql?: boolean
  /** Object keys ("key": …) get their own colour. */
  json?: boolean
}

const C_LIKE: Family = { line: ['//'], block: ['/*', '*/'] }
const HASH: Family = { line: ['#'] }
const PLAIN = null

const FAMILIES: Record<string, Family | null> = {
  js: C_LIKE, jsx: C_LIKE, javascript: C_LIKE, mjs: C_LIKE, cjs: C_LIKE,
  ts: C_LIKE, tsx: C_LIKE, typescript: C_LIKE,
  java: C_LIKE, kotlin: C_LIKE, kt: C_LIKE, scala: C_LIKE, swift: C_LIKE, dart: C_LIKE,
  c: C_LIKE, h: C_LIKE, cpp: C_LIKE, 'c++': C_LIKE, hpp: C_LIKE, cs: C_LIKE, csharp: C_LIKE, 'c#': C_LIKE,
  go: C_LIKE, golang: C_LIKE, rust: C_LIKE, rs: C_LIKE, php: C_LIKE, zig: C_LIKE,
  css: { line: [], block: ['/*', '*/'] }, scss: C_LIKE, less: C_LIKE,
  py: { line: ['#'], triple: true }, python: { line: ['#'], triple: true },
  rb: HASH, ruby: HASH, sh: HASH, bash: HASH, zsh: HASH, shell: HASH, shellscript: HASH, fish: HASH,
  ps1: HASH, powershell: HASH, yaml: HASH, yml: HASH, toml: HASH, ini: { line: [';', '#'] },
  r: HASH, perl: HASH, pl: HASH, dockerfile: HASH, docker: HASH, make: HASH, makefile: HASH,
  elixir: HASH, ex: HASH, nim: HASH, graphql: HASH, gql: HASH,
  sql: { line: ['--'], block: ['/*', '*/'], sql: true },
  psql: { line: ['--'], block: ['/*', '*/'], sql: true },
  postgres: { line: ['--'], block: ['/*', '*/'], sql: true },
  postgresql: { line: ['--'], block: ['/*', '*/'], sql: true },
  lua: { line: ['--'] }, haskell: { line: ['--'] }, hs: { line: ['--'] },
  json: { line: [], json: true }, jsonc: { line: ['//'], block: ['/*', '*/'], json: true },
  json5: { line: ['//'], block: ['/*', '*/'], json: true },
  html: { line: [], block: ['<!--', '-->'] }, xml: { line: [], block: ['<!--', '-->'] },
  svg: { line: [], block: ['<!--', '-->'] }, vue: { line: ['//'], block: ['<!--', '-->'] },
  text: PLAIN, txt: PLAIN, plaintext: PLAIN, plain: PLAIN, output: PLAIN, console: PLAIN,
  log: PLAIN, md: PLAIN, markdown: PLAIN, csv: PLAIN, diff: PLAIN,
}

const KEYWORDS = new Set(
  (
    // JS / TS
    'const let var function return if else for while do switch case break continue new this class extends ' +
    'super import export from default async await try catch finally throw typeof instanceof in of void ' +
    'delete yield interface type enum implements public private protected readonly static abstract as ' +
    'keyof declare namespace satisfies get set ' +
    // Python
    'def lambda pass and or not is elif with global nonlocal raise except assert del self ' +
    // Go / Rust / C-family / Java
    'func package go defer chan map struct select range fallthrough goto fn mut pub impl trait match loop ' +
    'mod use crate where ref move dyn unsafe int char float double long short unsigned signed bool boolean ' +
    'final typedef sizeof include define throws override virtual template typename using ' +
    // Shell
    'then fi done esac echo local export ' +
    // Literals
    'true false null undefined nil None True False NaN Infinity'
  ).split(/\s+/)
)

const SQL_KEYWORDS = new Set(
  (
    'select from where insert into values update set delete create table alter drop join left right inner ' +
    'outer full cross on group by order having limit offset as and or not null is in exists distinct union ' +
    'all primary key foreign references index default returning with case when then else end begin commit ' +
    'rollback transaction if replace function returns language view trigger grant revoke to asc desc like ' +
    'ilike between count sum avg min max coalesce cast true false unique check constraint cascade policy ' +
    'using serial text integer bigint boolean timestamp timestamptz uuid jsonb varchar numeric'
  ).split(/\s+/)
)

/** Blocks larger than this render unhighlighted — keeps streaming cheap. */
export const MAX_HIGHLIGHT_LENGTH = 20000

const IDENT_START = /[A-Za-z_$]/
const IDENT = /[\w$]/
const NUMBER_RE = /0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const IDENT_RE = /[A-Za-z_$][\w$]*/y

/** Resolve a fence info-string language to its family (undefined = generic C-like). */
function familyFor(lang?: string): Family | null {
  if (!lang) return C_LIKE
  const key = lang.toLowerCase()
  // Own keys only: the language is model-controlled, and an inherited name
  // such as "constructor" would resolve to an Object.prototype function.
  return Object.hasOwn(FAMILIES, key) ? FAMILIES[key] : C_LIKE
}

export function highlight(code: string, lang?: string): Token[] {
  const family = familyFor(lang)
  if (family === null || code.length > MAX_HIGHLIGHT_LENGTH) return [{ kind: 'plain', text: code }]

  const tokens: Token[] = []
  const push = (kind: TokenKind, text: string) => {
    const last = tokens[tokens.length - 1]
    if (last && last.kind === kind && kind === 'plain') last.text += text
    else tokens.push({ kind, text })
  }

  let i = 0
  const n = code.length
  while (i < n) {
    const ch = code[i]

    // Block comment
    if (family.block && code.startsWith(family.block[0], i)) {
      const end = code.indexOf(family.block[1], i + family.block[0].length)
      const stop = end === -1 ? n : end + family.block[1].length
      push('comment', code.slice(i, stop))
      i = stop
      continue
    }

    // Line comment
    const lineMarker = family.line.find((m) => code.startsWith(m, i))
    if (lineMarker) {
      const end = code.indexOf('\n', i)
      const stop = end === -1 ? n : end
      push('comment', code.slice(i, stop))
      i = stop
      continue
    }

    // Strings
    if (ch === '"' || ch === "'" || ch === '`') {
      const triple = family.triple && (code.startsWith('"""', i) || code.startsWith("'''", i))
      const quote = triple ? ch.repeat(3) : ch
      const multiline = triple || ch === '`'
      let j = i + quote.length
      while (j < n) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (code.startsWith(quote, j)) {
          j += quote.length
          break
        }
        if (code[j] === '\n' && !multiline) break
        j++
      }
      const stop = Math.min(j, n)
      const text = code.slice(i, stop)
      let kind: TokenKind = 'string'
      if (family.json && ch === '"') {
        let k = stop
        while (k < n && (code[k] === ' ' || code[k] === '\t')) k++
        if (code[k] === ':') kind = 'property'
      }
      push(kind, text)
      i = stop
      continue
    }

    // Numbers (not the tail of an identifier like `v2`)
    if (/\d/.test(ch) && (i === 0 || !IDENT.test(code[i - 1]))) {
      NUMBER_RE.lastIndex = i
      const m = NUMBER_RE.exec(code)!
      push('number', m[0])
      i += m[0].length
      continue
    }

    // Identifiers: keyword, function call, type, or plain
    if (IDENT_START.test(ch) && (i === 0 || !IDENT.test(code[i - 1]))) {
      IDENT_RE.lastIndex = i
      const word = IDENT_RE.exec(code)![0]
      const isKeyword = family.sql ? SQL_KEYWORDS.has(word.toLowerCase()) : KEYWORDS.has(word)
      let kind: TokenKind = 'plain'
      if (isKeyword) {
        kind = 'keyword'
      } else {
        let k = i + word.length
        while (k < n && (code[k] === ' ' || code[k] === '\t')) k++
        if (code[k] === '(') kind = 'function'
        else if (/^[A-Z][a-z0-9]/.test(word)) kind = 'type'
      }
      push(kind, word)
      i += word.length
      continue
    }

    push('plain', ch)
    i++
  }

  return tokens
}
