/**
 * Minimal streaming XML tokenizer for Apple Health export.xml files.
 *
 * Not a general-purpose XML parser: it emits open/close tag events with
 * attributes and ignores text nodes, which is exactly what HealthKit's
 * machine-generated export needs. Handles the constructs that actually
 * appear in an export: the XML declaration, the DOCTYPE with an internal
 * DTD subset, comments, elements with double- or single-quoted attribute
 * values (including `>` inside quotes), self-closing tags, and entity
 * references in attribute values.
 *
 * Attribute parsing is skipped for tags not in `interestingTags` — with
 * ~2 million records per export this saves a lot of work on elements the
 * importer never looks at (e.g. InstantaneousBeatsPerMinute).
 */

export type XmlAttributes = Record<string, string>

export interface XmlStreamHandlers {
  onOpenTag: (name: string, attrs: XmlAttributes) => void
  onCloseTag: (name: string) => void
}

const EMPTY_ATTRS: XmlAttributes = {}
const ATTR_REGEX = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value
  return value.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_match, entity: string) => {
    switch (entity) {
      case 'lt': return '<'
      case 'gt': return '>'
      case 'amp': return '&'
      case 'quot': return '"'
      case 'apos': return "'"
      default: {
        const code = entity.startsWith('#x')
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10)
        // fromCodePoint throws on out-of-range and surrogate code points
        if (Number.isNaN(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�'
        return String.fromCodePoint(code)
      }
    }
  })
}

/**
 * Cap on chars retained between write() calls waiting for a tag to close.
 * Real tags are tiny; a buffer this large means the input is not XML.
 */
const MAX_BUFFERED_CHARS = 8 * 1024 * 1024

export class StreamingXmlParser {
  private buf = ''
  private readonly handlers: XmlStreamHandlers
  private readonly interestingTags: Set<string>

  constructor(handlers: XmlStreamHandlers, interestingTags: Set<string>) {
    this.handlers = handlers
    this.interestingTags = interestingTags
  }

  /**
   * Feed the next chunk of decoded text. Callers must decode bytes with a
   * streaming decoder (e.g. string_decoder) so multi-byte characters are
   * never split across write() calls.
   */
  write(text: string): void {
    this.buf = this.buf.length > 0 ? this.buf + text : text
    let pos = 0
    const buf = this.buf
    const len = buf.length

    while (pos < len) {
      const lt = buf.indexOf('<', pos)
      if (lt === -1) {
        pos = len
        break
      }
      if (lt + 1 >= len) {
        pos = lt
        break
      }

      const next = buf.charCodeAt(lt + 1)

      if (next === 63 /* ? */) {
        const end = buf.indexOf('?>', lt + 2)
        if (end === -1) { pos = lt; break }
        pos = end + 2
        continue
      }

      if (next === 33 /* ! */) {
        if (buf.startsWith('<!--', lt)) {
          const end = buf.indexOf('-->', lt + 4)
          if (end === -1) { pos = lt; break }
          pos = end + 3
          continue
        }
        // DOCTYPE (possibly with an internal subset) or other declaration:
        // skip to the matching '>' while tracking [...] nesting and quotes.
        const end = this.findDeclarationEnd(buf, lt + 2, len)
        if (end === -1) { pos = lt; break }
        pos = end + 1
        continue
      }

      if (next === 47 /* / */) {
        const gt = buf.indexOf('>', lt + 2)
        if (gt === -1) { pos = lt; break }
        this.handlers.onCloseTag(buf.slice(lt + 2, gt).trim())
        pos = gt + 1
        continue
      }

      // Opening (or self-closing) element: find '>' outside quoted values
      const gt = this.findTagEnd(buf, lt + 1, len)
      if (gt === -1) { pos = lt; break }

      let inner = buf.slice(lt + 1, gt)
      const selfClosing = inner.endsWith('/')
      if (selfClosing) inner = inner.slice(0, -1)

      let nameEnd = 0
      while (nameEnd < inner.length && !isWhitespace(inner.charCodeAt(nameEnd))) nameEnd++
      const name = inner.slice(0, nameEnd)

      if (this.interestingTags.has(name) && nameEnd < inner.length) {
        const attrs: XmlAttributes = {}
        ATTR_REGEX.lastIndex = nameEnd
        let match: RegExpExecArray | null
        while ((match = ATTR_REGEX.exec(inner)) !== null) {
          attrs[match[1]] = decodeEntities(match[2] ?? match[3] ?? '')
        }
        this.handlers.onOpenTag(name, attrs)
      } else {
        this.handlers.onOpenTag(name, EMPTY_ATTRS)
      }
      if (selfClosing) this.handlers.onCloseTag(name)

      pos = gt + 1
    }

    this.buf = pos >= len ? '' : buf.slice(pos)
    if (this.buf.length > MAX_BUFFERED_CHARS) {
      throw new Error('Malformed XML: unterminated tag exceeds the parser buffer limit')
    }
  }

  private findTagEnd(buf: string, from: number, len: number): number {
    let quote = 0
    for (let i = from; i < len; i++) {
      const c = buf.charCodeAt(i)
      if (quote !== 0) {
        if (c === quote) quote = 0
      } else if (c === 34 /* " */ || c === 39 /* ' */) {
        quote = c
      } else if (c === 62 /* > */) {
        return i
      }
    }
    return -1
  }

  private findDeclarationEnd(buf: string, from: number, len: number): number {
    let quote = 0
    let subsetDepth = 0
    for (let i = from; i < len; i++) {
      const c = buf.charCodeAt(i)
      if (quote !== 0) {
        if (c === quote) quote = 0
      } else if (c === 34 /* " */ || c === 39 /* ' */) {
        quote = c
      } else if (c === 91 /* [ */) {
        subsetDepth++
      } else if (c === 93 /* ] */) {
        subsetDepth--
      } else if (c === 62 /* > */ && subsetDepth <= 0) {
        return i
      }
    }
    return -1
  }
}

function isWhitespace(code: number): boolean {
  return code === 32 || code === 10 || code === 9 || code === 13
}
