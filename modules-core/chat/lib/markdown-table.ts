/**
 * GFM table helpers for the chat Markdown renderer: split a `| a | b |` row
 * into cells and read the `|---|:---:|` separator's column alignment.
 */

export type TableAlign = 'left' | 'center' | 'right' | null

/** Cells of a pipe-delimited row, or null when the line isn't one. */
export function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return null
  let body = trimmed
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  // Split on pipes that aren't escaped (`\|` is a literal pipe in a cell).
  const cells = body.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
  return cells
}

/** Column alignment from a separator row, or null when the line isn't one. */
export function parseTableSeparator(line: string): TableAlign[] | null {
  const cells = splitTableRow(line)
  if (!cells || cells.length === 0) return null
  const aligns: TableAlign[] = []
  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) return null
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    aligns.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null)
  }
  return aligns
}

/**
 * Whether lines[i] opens a table: a row followed by a separator with the
 * same number of columns.
 */
export function isTableStart(lines: string[], i: number): boolean {
  if (i + 1 >= lines.length) return false
  const header = splitTableRow(lines[i])
  const sep = parseTableSeparator(lines[i + 1])
  return !!header && !!sep && header.length === sep.length
}
