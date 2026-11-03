'use client'

import { createElement, Fragment, memo, useMemo, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { highlight, type TokenKind } from '@/modules/chat/lib/highlight'
import {
  isTableStart,
  parseTableSeparator,
  splitTableRow,
  type TableAlign,
} from '@/modules/chat/lib/markdown-table'

/**
 * Tiny, dependency-free Markdown renderer tuned for chat replies.
 * Renders via React nodes only (never dangerouslySetInnerHTML) so output is XSS-safe.
 * Supports: fenced code blocks (syntax-highlighted), GFM tables, headings,
 * lists, blockquotes, rules, and the inline set most models lean on (code,
 * bold, italic, strikethrough, links). Renders fine mid-stream: an unclosed
 * fence simply runs to the end of the text so far.
 */

function safeHref(url: string): string | null {
  const trimmed = url.trim()
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed
  if (/^\//.test(trimmed)) return trimmed
  return null
}

interface InlineRule {
  re: RegExp
  node: (m: RegExpExecArray, key: string) => ReactNode
}

const INLINE_RULES: InlineRule[] = [
  {
    // inline code — literal, never recurses
    re: /`([^`\n]+)`/,
    node: (m, key) => (
      <code
        key={key}
        className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
      >
        {m[1]}
      </code>
    ),
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    node: (m, key) => {
      const href = safeHref(m[2])
      if (!href) return <Fragment key={key}>{m[0]}</Fragment>
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {renderInline(m[1], key)}
        </a>
      )
    },
  },
  {
    re: /\*\*([^*]+?)\*\*/,
    node: (m, key) => <strong key={key} className="font-semibold text-foreground">{renderInline(m[1], key)}</strong>,
  },
  {
    re: /~~([^~]+?)~~/,
    node: (m, key) => <span key={key} className="line-through opacity-70">{renderInline(m[1], key)}</span>,
  },
  {
    re: /\*([^*\n]+?)\*/,
    node: (m, key) => <em key={key} className="italic">{renderInline(m[1], key)}</em>,
  },
]

function renderInline(text: string, keyBase = 'i'): ReactNode[] {
  if (!text) return []

  // Iterate across the line instead of recursing on the tail, so a token-dense
  // line can't overflow the call stack. (Nested inline — e.g. bold-in-link —
  // still recurses, but only to the small nesting depth.)
  const out: ReactNode[] = []
  let rest = text
  let seg = 0

  while (rest) {
    let best: { rule: InlineRule; m: RegExpExecArray } | null = null
    for (const rule of INLINE_RULES) {
      const re = new RegExp(rule.re.source, rule.re.flags)
      const m = re.exec(rest)
      if (m && (best === null || m.index < best.m.index)) best = { rule, m }
    }

    if (!best) {
      out.push(rest)
      break
    }

    const { rule, m } = best
    const before = rest.slice(0, m.index)
    if (before) out.push(<Fragment key={`${keyBase}-b${seg}`}>{before}</Fragment>)
    out.push(rule.node(m, `${keyBase}-t${seg}`))
    rest = rest.slice(m.index + m[0].length)
    seg++
  }

  return out
}

// Theme-aware token colours: fixed hues read on both light and dark themes.
const TOKEN_CLASS: Record<TokenKind, string | undefined> = {
  plain: undefined,
  keyword: 'text-violet-600 dark:text-violet-400',
  string: 'text-emerald-700 dark:text-emerald-400',
  number: 'text-amber-700 dark:text-amber-400',
  comment: 'italic text-muted-foreground',
  function: 'text-sky-700 dark:text-sky-400',
  type: 'text-rose-700 dark:text-rose-400',
  property: 'text-sky-700 dark:text-sky-400',
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const tokens = useMemo(() => highlight(code, lang), [code, lang])

  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
      <div className="flex items-center justify-between border-b border-border/60 bg-foreground/[0.03] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[0.8rem] leading-relaxed">
        <code className="font-mono text-foreground">
          {tokens.map((t, i) => {
            const cls = TOKEN_CLASS[t.kind]
            return cls ? <span key={i} className={cls}>{t.text}</span> : <Fragment key={i}>{t.text}</Fragment>
          })}
        </code>
      </pre>
    </div>
  )
}

const ALIGN_CLASS: Record<Exclude<TableAlign, null>, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

function Table({ header, aligns, rows, keyBase }: { header: string[]; aligns: TableAlign[]; rows: string[][]; keyBase: string }) {
  const alignOf = (col: number) => {
    const a = aligns[col]
    return a ? ALIGN_CLASS[a] : 'text-left'
  }
  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-foreground/[0.04]">
          <tr>
            {header.map((cell, c) => (
              <th key={c} className={cn('whitespace-nowrap border-b border-border px-3 py-2 font-semibold', alignOf(c))}>
                {renderInline(cell, `${keyBase}-h${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-border/60 last:border-0 even:bg-foreground/[0.02]">
              {header.map((_, c) => (
                <td key={c} className={cn('px-3 py-2 align-top', alignOf(c))}>
                  {renderInline(row[c] ?? '', `${keyBase}-r${r}c${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Block =
  | { kind: 'code'; lang?: string; content: string }
  | { kind: 'heading'; level: number; content: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'hr' }
  | { kind: 'table'; header: string[]; aligns: TableAlign[]; rows: string[][] }
  | { kind: 'p'; lines: string[] }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code — treat ANY line beginning with ``` as a fence opener
    // (matching the paragraph loop's `^```` guard below), taking the first
    // token of the info string as the language. A stricter regex here would
    // let e.g. ```c# or ```js {1,3} fall through to the paragraph loop, which
    // refuses ```-lines and would spin forever.
    if (/^```/.test(line)) {
      const info = line.slice(3).trim()
      const lang = info ? info.split(/\s+/)[0] : undefined
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      blocks.push({ kind: 'code', lang, content: buf.join('\n') })
      continue
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      i++
      continue
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, content: heading[2] })
      i++
      continue
    }

    // Horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }

    // GFM table: header row + separator, then rows until a non-row line.
    if (isTableStart(lines, i)) {
      const header = splitTableRow(line)!
      const aligns = parseTableSeparator(lines[i + 1])!
      const rows: string[][] = []
      i += 2
      while (i < lines.length && !/^\s*$/.test(lines[i])) {
        const row = splitTableRow(lines[i])
        if (!row) break
        rows.push(row)
        i++
      }
      blocks.push({ kind: 'table', header, aligns, rows })
      continue
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ kind: 'quote', lines: buf })
      continue
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    // Paragraph (consume until blank or block boundary)
    const buf: string[] = []
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      buf.push(lines[i])
      i++
    }
    // Guarantee forward progress: if no rule consumed this line, take it as a
    // literal paragraph line so `i` always advances (no infinite loop).
    if (buf.length === 0) {
      buf.push(line)
      i++
    }
    blocks.push({ kind: 'p', lines: buf })
  }

  return blocks
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-xl font-semibold mt-4 mb-2',
  2: 'text-lg font-semibold mt-4 mb-2',
  3: 'text-base font-semibold mt-3 mb-1.5',
  4: 'text-base font-semibold mt-3 mb-1.5',
  5: 'text-base font-medium mt-2 mb-1',
  6: 'text-xs font-medium uppercase tracking-wide text-muted-foreground mt-2 mb-1',
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content)

  return (
    <div className="space-y-2 text-base leading-relaxed">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case 'code':
            return <CodeBlock key={idx} code={block.content} lang={block.lang} />
          case 'heading':
            return createElement(
              `h${Math.min(block.level, 6)}`,
              { key: idx, className: cn('first:mt-0', HEADING_CLASS[block.level]) },
              renderInline(block.content, `h${idx}`),
            )
          case 'hr':
            return <hr key={idx} className="my-3 border-border" />
          case 'table':
            return <Table key={idx} header={block.header} aligns={block.aligns} rows={block.rows} keyBase={`t${idx}`} />
          case 'quote':
            return (
              <blockquote
                key={idx}
                className="border-l-2 border-accent/60 pl-3 text-muted-foreground italic"
              >
                {block.lines.map((l, j) => (
                  <p key={j}>{renderInline(l, `q${idx}-${j}`)}</p>
                ))}
              </blockquote>
            )
          case 'ul':
            return (
              <ul key={idx} className="ml-1 space-y-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span className="min-w-0">{renderInline(item, `ul${idx}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={idx} className="ml-1 space-y-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="font-mono text-xs text-accent tabular-nums">{j + 1}.</span>
                    <span className="min-w-0">{renderInline(item, `ol${idx}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            )
          case 'p':
            return (
              <p key={idx} className="whitespace-pre-wrap break-words first:mt-0">
                {block.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {renderInline(l, `p${idx}-${j}`)}
                  </Fragment>
                ))}
              </p>
            )
        }
      })}
    </div>
  )
})
