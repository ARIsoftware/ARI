/**
 * Tests for health-data/lib/zip-reader.ts
 *
 * Builds real in-memory ZIP buffers using Node's zlib to avoid mocking the
 * entire FS layer. Uses tmp files written to /tmp so the reader can open them.
 * Tests cover: directory parsing, findExportXml, openZipEntryStream, readZipEntry.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFile, unlink } from 'fs/promises'
import { deflateRaw } from 'zlib'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  readZipDirectory,
  findExportXml,
  openZipEntryStream,
  readZipEntry,
  type ZipEntry,
} from '@/modules-core/health-data/lib/zip-reader'

const deflateRawAsync = promisify(deflateRaw)

// ─── Minimal ZIP builder ─────────────────────────────────────────────────────
// Builds a valid ZIP archive containing a single stored (method=0) or deflated
// (method=8) entry. This is enough to exercise the reader's central-directory
// parsing and streaming logic.

function writeUInt32LE(buf: Buffer, val: number, offset: number) {
  buf.writeUInt32LE(val >>> 0, offset)
}

function writeUInt16LE(buf: Buffer, val: number, offset: number) {
  buf.writeUInt16LE(val & 0xffff, offset)
}

function crc32(data: Buffer): number {
  // CRC32 implementation (IEEE polynomial). The zip reader doesn't check CRCs,
  // but the format requires the field to be present.
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipBuildEntry {
  name: string
  data: Buffer
  method: 0 | 8
  compressed?: Buffer
}

async function buildZip(entries: ZipBuildEntry[]): Promise<Buffer> {
  const localHeaders: Buffer[] = []
  const centralDirs: Buffer[] = []
  const offsets: number[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const compressed = entry.method === 8
      ? await deflateRawAsync(entry.data)
      : entry.data
    const crc = crc32(entry.data)

    // Local file header (30 + nameLen bytes)
    const local = Buffer.alloc(30 + nameBytes.length)
    writeUInt32LE(local, 0x04034b50, 0) // signature
    writeUInt16LE(local, 20, 4)          // version needed
    writeUInt16LE(local, 0, 6)           // flags
    writeUInt16LE(local, entry.method, 8)
    writeUInt16LE(local, 0, 10)          // mod time
    writeUInt16LE(local, 0, 12)          // mod date
    writeUInt32LE(local, crc, 14)
    writeUInt32LE(local, compressed.length, 18)
    writeUInt32LE(local, entry.data.length, 22)
    writeUInt16LE(local, nameBytes.length, 26)
    writeUInt16LE(local, 0, 28)          // extra length
    nameBytes.copy(local, 30)

    offsets.push(offset)
    localHeaders.push(local, compressed)
    offset += local.length + compressed.length

    // Central directory record
    const cd = Buffer.alloc(46 + nameBytes.length)
    writeUInt32LE(cd, 0x02014b50, 0) // signature
    writeUInt16LE(cd, 20, 4)          // version made by
    writeUInt16LE(cd, 20, 6)          // version needed
    writeUInt16LE(cd, 0, 8)           // flags
    writeUInt16LE(cd, entry.method, 10)
    writeUInt16LE(cd, 0, 12)          // mod time
    writeUInt16LE(cd, 0, 14)          // mod date
    writeUInt32LE(cd, crc, 16)
    writeUInt32LE(cd, compressed.length, 20)
    writeUInt32LE(cd, entry.data.length, 24)
    writeUInt16LE(cd, nameBytes.length, 28)
    writeUInt16LE(cd, 0, 30)          // extra len
    writeUInt16LE(cd, 0, 32)          // comment len
    writeUInt16LE(cd, 0, 34)          // disk number start
    writeUInt16LE(cd, 0, 36)          // internal attrs
    writeUInt32LE(cd, 0, 38)          // external attrs
    writeUInt32LE(cd, offsets[offsets.length - 1], 42) // local header offset
    nameBytes.copy(cd, 46)
    centralDirs.push(cd)
  }

  const cdBuf = Buffer.concat(centralDirs)
  const cdOffset = offset

  // End of central directory record
  const eocd = Buffer.alloc(22)
  writeUInt32LE(eocd, 0x06054b50, 0) // signature
  writeUInt16LE(eocd, 0, 4)           // disk number
  writeUInt16LE(eocd, 0, 6)           // disk with CD
  writeUInt16LE(eocd, entries.length, 8)  // entries on disk
  writeUInt16LE(eocd, entries.length, 10) // total entries
  writeUInt32LE(eocd, cdBuf.length, 12)   // CD size
  writeUInt32LE(eocd, cdOffset, 16)        // CD offset
  writeUInt16LE(eocd, 0, 20)              // comment length

  return Buffer.concat([...localHeaders, cdBuf, eocd])
}

// ─── Temp file helpers ───────────────────────────────────────────────────────

const tmpFiles: string[] = []
let tmpCounter = 0

async function writeTmpZip(buf: Buffer): Promise<string> {
  const path = join(tmpdir(), `ari-zip-test-${process.pid}-${++tmpCounter}.zip`)
  await writeFile(path, buf)
  tmpFiles.push(path)
  return path
}

afterAll(async () => {
  for (const f of tmpFiles) {
    try { await unlink(f) } catch { /* ignore */ }
  }
})

// ─── readZipDirectory ────────────────────────────────────────────────────────

describe('readZipDirectory', () => {
  it('reads a single stored entry', async () => {
    const buf = await buildZip([{ name: 'hello.txt', data: Buffer.from('hello'), method: 0 }])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    expect(dir.entries).toHaveLength(1)
    expect(dir.entries[0].path).toBe('hello.txt')
    expect(dir.entries[0].compressionMethod).toBe(0)
    expect(dir.entries[0].uncompressedSize).toBe(5)
  })

  it('reads a deflate-compressed entry', async () => {
    const content = Buffer.from('x'.repeat(500))
    const buf = await buildZip([{ name: 'data.xml', data: content, method: 8 }])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    expect(dir.entries).toHaveLength(1)
    expect(dir.entries[0].compressionMethod).toBe(8)
    expect(dir.entries[0].uncompressedSize).toBe(500)
  })

  it('reads multiple entries', async () => {
    const buf = await buildZip([
      { name: 'a.txt', data: Buffer.from('aaa'), method: 0 },
      { name: 'b.xml', data: Buffer.from('bbb'), method: 0 },
      { name: 'c.csv', data: Buffer.from('ccc'), method: 0 },
    ])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    expect(dir.entries).toHaveLength(3)
    expect(dir.entries.map((e) => e.path)).toEqual(['a.txt', 'b.xml', 'c.csv'])
  })

  it('throws for a file that is too small', async () => {
    const path = await writeTmpZip(Buffer.alloc(10))
    await expect(readZipDirectory(path)).rejects.toThrow(/too small/)
  })

  it('throws for data that has no EOCD signature', async () => {
    // 22+ bytes but no valid signature
    const path = await writeTmpZip(Buffer.alloc(100, 0xaa))
    await expect(readZipDirectory(path)).rejects.toThrow(/end of central directory/)
  })
})

// ─── findExportXml ───────────────────────────────────────────────────────────

describe('findExportXml', () => {
  function makeEntry(path: string, size = 100): ZipEntry {
    return { path, compressionMethod: 0, compressedSize: size, uncompressedSize: size, localHeaderOffset: 0 }
  }

  it('returns null for empty entry list', () => {
    expect(findExportXml([])).toBeNull()
  })

  it('finds exact export.xml match', () => {
    const entries = [makeEntry('apple_health_export/export.xml', 5000), makeEntry('other.txt')]
    expect(findExportXml(entries)?.path).toBe('apple_health_export/export.xml')
  })

  it('finds export.xml case-insensitively', () => {
    const entries = [makeEntry('Export.XML', 5000)]
    expect(findExportXml(entries)?.path).toBe('Export.XML')
  })

  it('ignores export_cda.xml when looking for exact match', () => {
    const entries = [
      makeEntry('apple_health_export/export_cda.xml', 1000),
      makeEntry('apple_health_export/export.xml', 5000),
    ]
    expect(findExportXml(entries)?.path).toBe('apple_health_export/export.xml')
  })

  it('falls back to largest XML entry when no export.xml', () => {
    const entries = [
      makeEntry('apple_health_export/Exportar.xml', 9000),
      makeEntry('apple_health_export/small.xml', 100),
    ]
    const result = findExportXml(entries)
    expect(result?.path).toBe('apple_health_export/Exportar.xml')
  })

  it('ignores CDA entries in fallback', () => {
    const entries = [
      makeEntry('apple_health_export/cda/export_cda.xml', 99999),
      makeEntry('apple_health_export/Exportar.xml', 9000),
    ]
    expect(findExportXml(entries)?.path).toBe('apple_health_export/Exportar.xml')
  })

  it('ignores ECG entries in fallback', () => {
    const entries = [
      makeEntry('apple_health_export/electrocardiograms/ecg.xml', 99999),
      makeEntry('apple_health_export/Exportar.xml', 9000),
    ]
    expect(findExportXml(entries)?.path).toBe('apple_health_export/Exportar.xml')
  })

  it('ignores workout-routes entries in fallback', () => {
    const entries = [
      makeEntry('apple_health_export/workout-routes/route.xml', 99999),
      makeEntry('apple_health_export/Exportar.xml', 9000),
    ]
    expect(findExportXml(entries)?.path).toBe('apple_health_export/Exportar.xml')
  })

  it('ignores AppleDouble resource forks (._ prefix) in fallback', () => {
    const entries = [
      makeEntry('apple_health_export/._export.xml', 99999),
      makeEntry('apple_health_export/Exportar.xml', 9000),
    ]
    expect(findExportXml(entries)?.path).toBe('apple_health_export/Exportar.xml')
  })

  it('returns null when only non-XML entries exist', () => {
    const entries = [makeEntry('readme.txt'), makeEntry('data.csv')]
    expect(findExportXml(entries)).toBeNull()
  })
})

// ─── openZipEntryStream ──────────────────────────────────────────────────────

describe('openZipEntryStream', () => {
  it('streams a stored entry correctly', async () => {
    const content = 'stored content here'
    const buf = await buildZip([{ name: 'test.txt', data: Buffer.from(content), method: 0 }])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    const entry = dir.entries[0]

    const stream = await openZipEntryStream(path, entry)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer))
    }
    expect(Buffer.concat(chunks).toString()).toBe(content)
  })

  it('decompresses a deflate entry correctly', async () => {
    const content = 'hello '.repeat(100)
    const buf = await buildZip([{ name: 'big.xml', data: Buffer.from(content), method: 8 }])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    const entry = dir.entries[0]

    const stream = await openZipEntryStream(path, entry)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer))
    }
    expect(Buffer.concat(chunks).toString()).toBe(content)
  })

  it('returns an empty stream for a zero-byte entry', async () => {
    const buf = await buildZip([{ name: 'empty.txt', data: Buffer.alloc(0), method: 0 }])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    const entry = dir.entries[0]

    const stream = await openZipEntryStream(path, entry)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer))
    }
    expect(Buffer.concat(chunks).length).toBe(0)
  })

  it('throws for unsupported compression method', async () => {
    const fakeEntry: ZipEntry = {
      path: 'test.txt',
      compressionMethod: 9,
      compressedSize: 10,
      uncompressedSize: 20,
      localHeaderOffset: 0,
    }
    await expect(openZipEntryStream('/any/path', fakeEntry)).rejects.toThrow(/Unsupported/)
  })
})

// ─── readZipEntry ────────────────────────────────────────────────────────────

describe('readZipEntry', () => {
  it('reads a small entry into memory', async () => {
    const content = 'small data'
    const buf = await buildZip([{ name: 'small.txt', data: Buffer.from(content), method: 0 }])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    const entry = dir.entries[0]

    const result = await readZipEntry(path, entry, 1024)
    expect(result.toString()).toBe(content)
  })

  it('throws when uncompressedSize exceeds maxBytes', async () => {
    const content = Buffer.alloc(100, 'x')
    const buf = await buildZip([{ name: 'big.txt', data: content, method: 0 }])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    const entry = dir.entries[0]

    await expect(readZipEntry(path, entry, 50)).rejects.toThrow(/exceeds the 50 byte limit/)
  })

  it('reads a deflate-compressed entry', async () => {
    const content = 'compressed '.repeat(50)
    const buf = await buildZip([{ name: 'data.xml', data: Buffer.from(content), method: 8 }])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    const entry = dir.entries[0]

    const result = await readZipEntry(path, entry, 10 * 1024)
    expect(result.toString()).toBe(content)
  })
})
