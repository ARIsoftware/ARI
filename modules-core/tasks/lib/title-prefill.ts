/**
 * `/tasks/add?title=…` pre-fill support.
 *
 * The ⌘K command palette sends typed text to the add-task page as a `title`
 * query parameter. Anyone can craft such a link and trick a user into opening
 * it, so the value is treated as untrusted input:
 *
 * - It is only ever used as the initial value of the title <input> (React
 *   renders it as text, never as HTML) and is never auto-submitted — the user
 *   must review it and press Save, so a link cannot create a task by itself.
 * - It is never used to build a URL, a redirect, or any markup.
 * - It is sanitized below: control characters, bidi overrides and invisible
 *   characters (used to disguise text, e.g. "Trojan Source" tricks) are
 *   removed, whitespace is collapsed, and length is capped to the same limit
 *   the create-task API enforces.
 */

/** Must match the `title` max in `createTaskSchema` (lib/validation.ts). */
export const TASK_TITLE_MAX_LENGTH = 255

/** Query parameter read by the add-task page. */
export const TASK_TITLE_PARAM = 'title'

// Cap on raw input processed, so an enormous URL can't make us do heavy work.
const RAW_INPUT_LIMIT = TASK_TITLE_MAX_LENGTH * 8

// C0/C1 control characters (includes newlines and tabs — a title is one line).
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g

// Bidirectional formatting controls (can visually reorder text to disguise
// it) and invisible characters with no legitimate use in a title: ALM, LRM,
// RLM, LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, zero-width space, word joiner,
// BOM, and the Unicode line/paragraph separators. ZWJ/ZWNJ are kept because
// emoji sequences and several scripts (e.g. Persian) rely on them.
const INVISIBLE_OR_BIDI_CHARS =
  /[\u061C\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g

// Unpaired UTF-16 surrogates (malformed text).
const LONE_SURROGATES = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Turn an untrusted `?title=` value into a safe, single-line task title.
 * Returns an empty string when there is nothing usable (no pre-fill).
 */
export function sanitizeTaskTitlePrefill(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) return ''

  const cleaned = raw
    .slice(0, RAW_INPUT_LIMIT)
    .replace(LONE_SURROGATES, '')
    .normalize('NFC')
    .replace(CONTROL_CHARS, ' ')
    .replace(INVISIBLE_OR_BIDI_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= TASK_TITLE_MAX_LENGTH) return cleaned

  // The API's limit counts UTF-16 units (String#length). Truncate whole code
  // points so an emoji / astral character is never split in half.
  let truncated = ''
  for (const codePoint of cleaned) {
    if (truncated.length + codePoint.length > TASK_TITLE_MAX_LENGTH) break
    truncated += codePoint
  }
  return truncated.trimEnd()
}

/**
 * Build the add-task page URL with `text` pre-filled as the title. The text is
 * sanitized and URL-encoded; the path is a fixed internal route.
 */
export function buildAddTaskHref(text: string): string {
  const title = sanitizeTaskTitlePrefill(text)
  if (!title) return '/tasks/add'
  return `/tasks/add?${new URLSearchParams({ [TASK_TITLE_PARAM]: title }).toString()}`
}
