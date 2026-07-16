'use client'

import { createElement, Fragment, memo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CopyButton } from './copy-button'

/**
 * Tiny, dependency-free Markdown renderer tuned for chat replies.
 * Renders via React nodes only (never dangerouslySetInnerHTML) so output is XSS-safe.
 * Supports: fenced code blocks, headings, lists, blockquotes, rules, and the
 * inline set most models lean on (code, bold, italic, strikethrough, links).
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

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="group/code my-3 overflow-hidden rounded-lg border border-border bg-foreground/[0.03]">
      <div className="flex items-center justify-between border-b border-border/60 bg-foreground/[0.03] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {lang || 'code'}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3 text-[0.8rem] leading-relaxed">
        <code className="font-mono text-foreground">{code}</code>
      </pre>
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
  | { kind: 'p'; lines: string[] }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code — accept any info string after the backticks (models emit
    // things like "```c#" or "```js title=app.ts"); the first token is the lang.
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      const lang = fence[1].trim().split(/\s+/)[0] || undefined
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

    // Paragraph — always consumes at least the current line, so the outer
    // loop is guaranteed to make progress no matter what the line looks like.
    const buf: string[] = [line]
    i++
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: 'p', lines: buf })
  }

  return blocks
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-lg font-semibold mt-4 mb-2',
  2: 'text-base font-semibold mt-4 mb-2',
  3: 'text-sm font-semibold mt-3 mb-1.5',
  4: 'text-sm font-semibold mt-3 mb-1.5',
  5: 'text-sm font-medium mt-2 mb-1',
  6: 'text-xs font-medium uppercase tracking-wide text-muted-foreground mt-2 mb-1',
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content)

  return (
    <div className="space-y-2 text-sm leading-relaxed">
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
