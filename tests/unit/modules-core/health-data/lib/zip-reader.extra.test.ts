/**
 * Extra coverage tests for health-data/lib/zip-reader.ts.
 *
 * Targets:
 * - readFully: EOF / zero-bytes-read path (line 38)
 * - ZIP64 end of central directory path (lines 113-124)
 * - Corrupt central directory signature (line 143)
 * - ZIP64 extra field in central directory entry (lines 157-180)
 * - Bad local header signature (line 239)
 * - readZipEntry: stream exceeds maxBytes mid-read (line 278)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFile, unlink } from 'fs/promises'
import { deflateRaw } from 'zlib'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  readZipDirectory,
  openZipEntryStream,
  readZipEntry,
  type ZipEntry,
} from '@/modules-core/health-data/lib/zip-reader'

const deflateRawAsync = promisify(deflateRaw)

// ─── Re-use the same minimal ZIP builder from the base test ──────────────────

function writeUInt32LE(buf: Buffer, val: number, offset: number) {
  buf.writeUInt32LE(val >>> 0, offset)
}

function writeUInt16LE(buf: Buffer, val: number, offset: number) {
  buf.writeUInt16LE(val & 0xffff, offset)
}

function writeBigUInt64LE(buf: Buffer, val: bigint, offset: number) {
  buf.writeBigUInt64LE(val, offset)
}

function crc32(data: Buffer): number {
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

    const local = Buffer.alloc(30 + nameBytes.length)
    writeUInt32LE(local, 0x04034b50, 0)
    writeUInt16LE(local, 20, 4)
    writeUInt16LE(local, 0, 6)
    writeUInt16LE(local, entry.method, 8)
    writeUInt16LE(local, 0, 10)
    writeUInt16LE(local, 0, 12)
    writeUInt32LE(local, crc, 14)
    writeUInt32LE(local, compressed.length, 18)
    writeUInt32LE(local, entry.data.length, 22)
    writeUInt16LE(local, nameBytes.length, 26)
    writeUInt16LE(local, 0, 28)
    nameBytes.copy(local, 30)

    offsets.push(offset)
    localHeaders.push(local, compressed)
    offset += local.length + compressed.length

    const cd = Buffer.alloc(46 + nameBytes.length)
    writeUInt32LE(cd, 0x02014b50, 0)
    writeUInt16LE(cd, 20, 4)
    writeUInt16LE(cd, 20, 6)
    writeUInt16LE(cd, 0, 8)
    writeUInt16LE(cd, entry.method, 10)
    writeUInt16LE(cd, 0, 12)
    writeUInt16LE(cd, 0, 14)
    writeUInt32LE(cd, crc, 16)
    writeUInt32LE(cd, compressed.length, 20)
    writeUInt32LE(cd, entry.data.length, 24)
    writeUInt16LE(cd, nameBytes.length, 28)
    writeUInt16LE(cd, 0, 30)
    writeUInt16LE(cd, 0, 32)
    writeUInt16LE(cd, 0, 34)
    writeUInt16LE(cd, 0, 36)
    writeUInt32LE(cd, 0, 38)
    writeUInt32LE(cd, offsets[offsets.length - 1], 42)
    nameBytes.copy(cd, 46)
    centralDirs.push(cd)
  }

  const cdBuf = Buffer.concat(centralDirs)
  const cdOffset = offset

  const eocd = Buffer.alloc(22)
  writeUInt32LE(eocd, 0x06054b50, 0)
  writeUInt16LE(eocd, 0, 4)
  writeUInt16LE(eocd, 0, 6)
  writeUInt16LE(eocd, entries.length, 8)
  writeUInt16LE(eocd, entries.length, 10)
  writeUInt32LE(eocd, cdBuf.length, 12)
  writeUInt32LE(eocd, cdOffset, 16)
  writeUInt16LE(eocd, 0, 20)

  return Buffer.concat([...localHeaders, cdBuf, eocd])
}

// ─── Temp file helpers ───────────────────────────────────────────────────────

const tmpFiles: string[] = []
let tmpCounter = 1000

async function writeTmpZip(buf: Buffer): Promise<string> {
  const path = join(tmpdir(), `ari-zip-extra-${process.pid}-${++tmpCounter}.zip`)
  await writeFile(path, buf)
  tmpFiles.push(path)
  return path
}

afterAll(async () => {
  for (const f of tmpFiles) {
    try { await unlink(f) } catch { /* ignore */ }
  }
})

// ─── Corrupt central directory ───────────────────────────────────────────────

describe('readZipDirectory — corrupt central directory', () => {
  it('throws when a central directory entry has a bad signature', async () => {
    // Build a valid zip, then corrupt the central directory signature
    const buf = await buildZip([{ name: 'test.txt', data: Buffer.from('data'), method: 0 }])
    // Find the CD offset from the EOCD record (last 22 bytes)
    const eocdOffset = buf.length - 22
    const cdOffset = buf.readUInt32LE(eocdOffset + 16)
    // Overwrite the CD signature with garbage
    buf.writeUInt32LE(0xdeadbeef, cdOffset)

    const path = await writeTmpZip(buf)
    await expect(readZipDirectory(path)).rejects.toThrow(/corrupt|bad central directory/i)
  })
})

// ─── Bad local header ────────────────────────────────────────────────────────

describe('openZipEntryStream — bad local header', () => {
  it('throws when the local header signature is wrong', async () => {
    const buf = await buildZip([{ name: 'file.txt', data: Buffer.from('hello'), method: 0 }])
    // Corrupt the local header signature at offset 0
    buf.writeUInt32LE(0xdeadbeef, 0)

    const path = await writeTmpZip(buf)
    const entry: ZipEntry = {
      path: 'file.txt',
      compressionMethod: 0,
      compressedSize: 5,
      uncompressedSize: 5,
      localHeaderOffset: 0,
    }
    await expect(openZipEntryStream(path, entry)).rejects.toThrow(/bad local header/i)
  })
})

// ─── readZipEntry: stream grows beyond maxBytes ──────────────────────────────

describe('readZipEntry — stream exceeds maxBytes', () => {
  it('throws when actual decompressed data exceeds maxBytes', async () => {
    // Content is 100 bytes, uncompressedSize declares 50 to pass the initial check,
    // but actual data stream is 100 bytes so mid-read check catches it.
    // We need uncompressedSize <= maxBytes to pass the pre-check but actual stream > maxBytes
    const content = Buffer.alloc(100, 0x41) // 100 'A' bytes, stored uncompressed
    const buf = await buildZip([{ name: 'big.txt', data: content, method: 0 }])
    const path = await writeTmpZip(buf)

    // Read the real entry from the zip
    const { readZipDirectory: realReadDir } = await import('@/modules-core/health-data/lib/zip-reader')
    const dir = await realReadDir(path)
    const entry = dir.entries[0]

    // Artificially lower uncompressedSize so the initial size check passes (50 < 80)
    // but actual stream data (100 bytes) exceeds maxBytes (80).
    const fakeEntry: ZipEntry = {
      ...entry,
      uncompressedSize: 50, // bypasses first guard
    }

    // maxBytes=80: entry.uncompressedSize(50) <= 80 passes, but actual 100 bytes > 80
    await expect(readZipEntry(path, fakeEntry, 80)).rejects.toThrow(/exceeds the 80 byte limit/)
  })
})

// ─── ZIP64 path: needsZip64 triggered by marker values ───────────────────────

describe('findEndOfCentralDirectory — ZIP64 marker detection error', () => {
  it('throws when ZIP64 fields require ZIP64 but locator is absent', async () => {
    // Build a normal zip then patch the EOCD to set totalEntries = 0xFFFF
    // This triggers needsZip64=true. But since there's no real ZIP64 locator
    // before the EOCD, it should throw 'ZIP64 locator is missing'.
    const buf = await buildZip([{ name: 'a.txt', data: Buffer.from('a'), method: 0 }])

    // Patch the EOCD's "total entries" field to 0xFFFF to trigger ZIP64 path
    const eocdOffset = buf.length - 22
    writeUInt16LE(buf, 0xffff, eocdOffset + 10) // total entries = 0xFFFF

    // Also need to make the locatorPos check pass (locatorPos = eocdOffset - 20)
    // The 4 bytes at eocdOffset-20 must NOT be EOCD64_LOCATOR_SIG (0x07064b50)
    // since we're testing the "locator is missing" error
    if (eocdOffset >= 20) {
      // Ensure it doesn't accidentally match the locator sig
      buf.writeUInt32LE(0x12345678, eocdOffset - 20)
    }

    const path = await writeTmpZip(buf)
    await expect(readZipDirectory(path)).rejects.toThrow(/ZIP64/)
  })
})

// ─── ZIP64: full valid ZIP64 archive ────────────────────────────────────────

/**
 * Build a minimal but structurally-correct ZIP64 archive.
 * All size/offset fields in the CD entry are set to 0xFFFFFFFF (markers),
 * and real values go into a ZIP64 extra field (id=0x0001).
 */
async function buildZip64(name: string, data: Buffer): Promise<Buffer> {
  const nameBytes = Buffer.from(name, 'utf8')
  const compressed = data // stored (method=0)
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  crc = (crc ^ 0xffffffff) >>> 0

  // Local header (method=0, standard sizes)
  const local = Buffer.alloc(30 + nameBytes.length)
  writeUInt32LE(local, 0x04034b50, 0) // LFH sig
  writeUInt16LE(local, 45, 4)          // version needed (ZIP64)
  writeUInt16LE(local, 0, 6)           // flags
  writeUInt16LE(local, 0, 8)           // method: stored
  writeUInt16LE(local, 0, 10)
  writeUInt16LE(local, 0, 12)
  writeUInt32LE(local, crc, 14)
  writeUInt32LE(local, compressed.length, 18)
  writeUInt32LE(local, data.length, 22)
  writeUInt16LE(local, nameBytes.length, 26)
  writeUInt16LE(local, 0, 28)
  nameBytes.copy(local, 30)

  const localOffset = 0
  const localSize = local.length + compressed.length

  // ZIP64 extra field: uncompressedSize + compressedSize + localHeaderOffset = 3*8 = 24 bytes
  const extra64 = Buffer.alloc(4 + 24)
  writeUInt16LE(extra64, 0x0001, 0) // ZIP64 field id
  writeUInt16LE(extra64, 24, 2)      // field size
  writeBigUInt64LE(extra64, BigInt(data.length), 4)        // uncompressed size
  writeBigUInt64LE(extra64, BigInt(compressed.length), 12) // compressed size
  writeBigUInt64LE(extra64, BigInt(localOffset), 20)        // local header offset

  // Central directory entry with 0xFFFFFFFF markers for ZIP64 fields
  const cd = Buffer.alloc(46 + nameBytes.length + extra64.length)
  writeUInt32LE(cd, 0x02014b50, 0) // CD sig
  writeUInt16LE(cd, 45, 4)          // version made by
  writeUInt16LE(cd, 45, 6)          // version needed (ZIP64)
  writeUInt16LE(cd, 0, 8)
  writeUInt16LE(cd, 0, 10)          // method
  writeUInt16LE(cd, 0, 12)
  writeUInt16LE(cd, 0, 14)
  writeUInt32LE(cd, crc, 16)
  writeUInt32LE(cd, 0xffffffff, 20) // compressedSize → ZIP64
  writeUInt32LE(cd, 0xffffffff, 24) // uncompressedSize → ZIP64
  writeUInt16LE(cd, nameBytes.length, 28)
  writeUInt16LE(cd, extra64.length, 30)
  writeUInt16LE(cd, 0, 32)          // comment len
  writeUInt16LE(cd, 0, 34)
  writeUInt16LE(cd, 0, 36)
  writeUInt32LE(cd, 0, 38)
  writeUInt32LE(cd, 0xffffffff, 42) // local header offset → ZIP64
  nameBytes.copy(cd, 46)
  extra64.copy(cd, 46 + nameBytes.length)

  const cdBuf = cd
  const cdOffset = localSize

  // ZIP64 EOCD record (56 bytes)
  const eocd64 = Buffer.alloc(56)
  writeUInt32LE(eocd64, 0x06064b50, 0) // ZIP64 EOCD sig
  writeBigUInt64LE(eocd64, BigInt(44), 4)  // size of ZIP64 EOCD record (56-12)
  writeUInt16LE(eocd64, 45, 12)
  writeUInt16LE(eocd64, 45, 14)
  writeUInt32LE(eocd64, 0, 16)
  writeUInt32LE(eocd64, 0, 20)
  writeBigUInt64LE(eocd64, BigInt(1), 24)             // entries on disk
  writeBigUInt64LE(eocd64, BigInt(1), 32)             // total entries
  writeBigUInt64LE(eocd64, BigInt(cdBuf.length), 40) // CD size
  writeBigUInt64LE(eocd64, BigInt(cdOffset), 48)       // CD offset

  // ZIP64 EOCD locator (20 bytes)
  const locator = Buffer.alloc(20)
  const eocd64Offset = localSize + cdBuf.length
  writeUInt32LE(locator, 0x07064b50, 0) // locator sig
  writeUInt32LE(locator, 0, 4)           // disk with ZIP64 EOCD
  writeBigUInt64LE(locator, BigInt(eocd64Offset), 8)
  writeUInt32LE(locator, 1, 16)           // total disks

  // Regular EOCD with 0xFFFF/0xFFFFFFFF markers
  const eocd = Buffer.alloc(22)
  writeUInt32LE(eocd, 0x06054b50, 0)
  writeUInt16LE(eocd, 0, 4)
  writeUInt16LE(eocd, 0, 6)
  writeUInt16LE(eocd, 0xffff, 8)      // total entries → ZIP64
  writeUInt16LE(eocd, 0xffff, 10)
  writeUInt32LE(eocd, 0xffffffff, 12) // CD size → ZIP64
  writeUInt32LE(eocd, 0xffffffff, 16) // CD offset → ZIP64
  writeUInt16LE(eocd, 0, 20)           // comment len

  return Buffer.concat([local, compressed, cdBuf, eocd64, locator, eocd])
}

describe('readZipDirectory — ZIP64 archive', () => {
  it('reads a valid ZIP64 archive with 0xFFFFFFFF marker fields', async () => {
    const content = Buffer.from('Hello ZIP64 World')
    const buf = await buildZip64('hello64.txt', content)
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    expect(dir.entries).toHaveLength(1)
    expect(dir.entries[0].path).toBe('hello64.txt')
    expect(dir.entries[0].uncompressedSize).toBe(content.length)
    expect(dir.entries[0].compressedSize).toBe(content.length)
  })
})

describe('findEndOfCentralDirectory — ZIP64 invalid EOCD64 sig', () => {
  it('throws when ZIP64 EOCD record has wrong signature', async () => {
    const content = Buffer.from('test')
    const buf = await buildZip64('test.txt', content)

    // Find the ZIP64 EOCD offset — it's right after the local data + CD
    // local = 30 + 8 (name) + 4 (data) = 42; cd = 46+8+28=82; eocd64 at offset 42+82=124
    // Corrupt the ZIP64 EOCD signature
    const eocdOffset = buf.length - 22
    // The ZIP64 EOCD locator is at eocdOffset-20; locator+8 holds EOCD64 offset
    if (eocdOffset >= 20) {
      const locatorPos = eocdOffset - 20
      if (buf.readUInt32LE(locatorPos) === 0x07064b50) {
        const eocd64Offset = Number(buf.readBigUInt64LE(locatorPos + 8))
        // Corrupt the ZIP64 EOCD sig
        buf.writeUInt32LE(0xdeadbeef, eocd64Offset)
        const path = await writeTmpZip(buf)
        await expect(readZipDirectory(path)).rejects.toThrow(/Invalid ZIP64 end of central directory/)
      }
    }
  })
})

describe('parseCentralDirectory — ZIP64 extra field in CD entry', () => {
  it('reads ZIP64 entry with uncompressed/compressed size from extra field', async () => {
    const content = Buffer.from('test data for zip64 extra field test')
    const buf = await buildZip64('data.txt', content)
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    expect(dir.entries[0].uncompressedSize).toBe(content.length)
    expect(dir.entries[0].compressedSize).toBe(content.length)
    expect(dir.entries[0].localHeaderOffset).toBe(0)
  })

  it('can stream content from a ZIP64 entry', async () => {
    const content = Buffer.from('zip64 stream test content')
    const buf = await buildZip64('stream.txt', content)
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    const entry = dir.entries[0]

    const stream = await openZipEntryStream(path, entry)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer))
    }
    expect(Buffer.concat(chunks).toString()).toBe('zip64 stream test content')
  })

  /**
   * Build a zip where the CD entry has compressedSize=0xffffffff but the
   * extra field uses a non-ZIP64 id (0x000a instead of 0x0001).
   * This covers branch 163,1 (fieldId !== 0x0001) in the while loop.
   * The sizes will remain as 0xffffffff since no ZIP64 field was found.
   */
  it('skips non-ZIP64 extra field ids (branch 163 fieldId != 0x0001)', async () => {
    const content = Buffer.from('x')
    // Build a regular zip first
    const base = await buildZip([{ name: 'x.txt', data: content, method: 0 }])
    const eocdOffset = base.length - 22
    const cdOffset = base.readUInt32LE(eocdOffset + 16)

    // The CD entry starts at cdOffset. We need to rebuild CD with:
    // - compressedSize = 0xffffffff (triggers ZIP64 path)
    // - extra field id = 0x000a (not ZIP64), size=4, data=0x00000000
    // This means the while loop hits fieldId !== 0x0001 and skips over the field
    const nameBytes = Buffer.from('x.txt')
    const fakeExtra = Buffer.alloc(8)
    writeUInt16LE(fakeExtra, 0x000a, 0) // non-ZIP64 id
    writeUInt16LE(fakeExtra, 4, 2)       // field size
    fakeExtra.writeUInt32LE(0, 4)        // data

    const cd = Buffer.alloc(46 + nameBytes.length + fakeExtra.length)
    writeUInt32LE(cd, 0x02014b50, 0)
    writeUInt16LE(cd, 20, 4)
    writeUInt16LE(cd, 20, 6)
    writeUInt16LE(cd, 0, 8)
    writeUInt16LE(cd, 0, 10) // stored
    writeUInt16LE(cd, 0, 12)
    writeUInt16LE(cd, 0, 14)
    writeUInt32LE(cd, crc32(content), 16)
    writeUInt32LE(cd, 0xffffffff, 20) // compressedSize → zip64 marker
    writeUInt32LE(cd, 0xffffffff, 24) // uncompressedSize → zip64 marker
    writeUInt16LE(cd, nameBytes.length, 28)
    writeUInt16LE(cd, fakeExtra.length, 30)
    writeUInt16LE(cd, 0, 32) // comment
    writeUInt16LE(cd, 0, 34)
    writeUInt16LE(cd, 0, 36)
    writeUInt32LE(cd, 0, 38)
    writeUInt32LE(cd, 0, 42) // local header offset
    nameBytes.copy(cd, 46)
    fakeExtra.copy(cd, 46 + nameBytes.length)

    const localPart = base.subarray(0, cdOffset)
    const eocdBuf = Buffer.alloc(22)
    writeUInt32LE(eocdBuf, 0x06054b50, 0)
    writeUInt16LE(eocdBuf, 0, 4)
    writeUInt16LE(eocdBuf, 0, 6)
    writeUInt16LE(eocdBuf, 1, 8)
    writeUInt16LE(eocdBuf, 1, 10)
    writeUInt32LE(eocdBuf, cd.length, 12)
    writeUInt32LE(eocdBuf, cdOffset, 16)
    writeUInt16LE(eocdBuf, 0, 20)

    const newBuf = Buffer.concat([localPart, cd, eocdBuf])
    const path = await writeTmpZip(newBuf)
    const dir = await readZipDirectory(path)
    // Since no ZIP64 extra field was found, sizes remain 0xffffffff
    expect(dir.entries[0].compressedSize).toBe(0xffffffff)
  })

  /**
   * Build a zip where compressedSize=0xffffffff but only uncompressedSize
   * is in the ZIP64 extra field (not compressedSize, not localHeaderOffset).
   * This tests the case where readNext() is called for uncompressedSize but
   * NOT for compressedSize/localHeaderOffset (branches 175,176 alt 1).
   */
  it('reads only uncompressedSize from ZIP64 extra when only that marker is set', async () => {
    const content = Buffer.from('hello partial zip64')
    const nameBytes = Buffer.from('p.txt')
    const localHeader = Buffer.alloc(30 + nameBytes.length)
    writeUInt32LE(localHeader, 0x04034b50, 0)
    writeUInt16LE(localHeader, 20, 4)
    writeUInt16LE(localHeader, 0, 6)
    writeUInt16LE(localHeader, 0, 8)
    writeUInt16LE(localHeader, 0, 10)
    writeUInt16LE(localHeader, 0, 12)
    writeUInt32LE(localHeader, crc32(content), 14)
    writeUInt32LE(localHeader, content.length, 18) // compressedSize
    writeUInt32LE(localHeader, content.length, 22) // uncompressedSize
    writeUInt16LE(localHeader, nameBytes.length, 26)
    writeUInt16LE(localHeader, 0, 28)
    nameBytes.copy(localHeader, 30)

    const localOffset = 0
    const localSize = localHeader.length + content.length

    // ZIP64 extra with only uncompressedSize (8 bytes)
    const extra64 = Buffer.alloc(4 + 8)
    writeUInt16LE(extra64, 0x0001, 0)
    writeUInt16LE(extra64, 8, 2)
    writeBigUInt64LE(extra64, BigInt(content.length), 4) // uncompressedSize only

    const cd = Buffer.alloc(46 + nameBytes.length + extra64.length)
    writeUInt32LE(cd, 0x02014b50, 0)
    writeUInt16LE(cd, 20, 4)
    writeUInt16LE(cd, 20, 6)
    writeUInt16LE(cd, 0, 8)
    writeUInt16LE(cd, 0, 10)
    writeUInt16LE(cd, 0, 12)
    writeUInt16LE(cd, 0, 14)
    writeUInt32LE(cd, crc32(content), 16)
    writeUInt32LE(cd, content.length, 20) // compressedSize - real value (not 0xffffffff)
    writeUInt32LE(cd, 0xffffffff, 24)     // uncompressedSize → ZIP64 marker
    writeUInt16LE(cd, nameBytes.length, 28)
    writeUInt16LE(cd, extra64.length, 30)
    writeUInt16LE(cd, 0, 32)
    writeUInt16LE(cd, 0, 34)
    writeUInt16LE(cd, 0, 36)
    writeUInt32LE(cd, 0, 38)
    writeUInt32LE(cd, localOffset, 42) // localHeaderOffset - real value
    nameBytes.copy(cd, 46)
    extra64.copy(cd, 46 + nameBytes.length)

    const cdOffset = localSize
    const eocd = Buffer.alloc(22)
    writeUInt32LE(eocd, 0x06054b50, 0)
    writeUInt16LE(eocd, 0, 4)
    writeUInt16LE(eocd, 0, 6)
    writeUInt16LE(eocd, 1, 8)
    writeUInt16LE(eocd, 1, 10)
    writeUInt32LE(eocd, cd.length, 12)
    writeUInt32LE(eocd, cdOffset, 16)
    writeUInt16LE(eocd, 0, 20)

    const buf = Buffer.concat([localHeader, content, cd, eocd])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    // uncompressedSize should be read from ZIP64 extra; compressedSize from regular field
    expect(dir.entries[0].uncompressedSize).toBe(content.length)
    expect(dir.entries[0].compressedSize).toBe(content.length)
    expect(dir.entries[0].localHeaderOffset).toBe(0)
  })

  /**
   * Build a zip where only localHeaderOffset=0xffffffff but uncompressedSize
   * and compressedSize are real values. The ZIP64 extra field contains just
   * the localHeaderOffset (8 bytes). This covers branch 174,1 (uncompressedSize
   * is NOT 0xffffffff) and branch 175,1 (compressedSize NOT 0xffffffff), so
   * only branch 176 (localHeaderOffset IS 0xffffffff) executes readNext().
   */
  it('reads only localHeaderOffset from ZIP64 extra when only that field is marker', async () => {
    const content = Buffer.from('localoffset test')
    const nameBytes = Buffer.from('lo.txt')
    const localHeader = Buffer.alloc(30 + nameBytes.length)
    writeUInt32LE(localHeader, 0x04034b50, 0)
    writeUInt16LE(localHeader, 20, 4)
    writeUInt16LE(localHeader, 0, 6)
    writeUInt16LE(localHeader, 0, 8)
    writeUInt16LE(localHeader, 0, 10)
    writeUInt16LE(localHeader, 0, 12)
    writeUInt32LE(localHeader, crc32(content), 14)
    writeUInt32LE(localHeader, content.length, 18)
    writeUInt32LE(localHeader, content.length, 22)
    writeUInt16LE(localHeader, nameBytes.length, 26)
    writeUInt16LE(localHeader, 0, 28)
    nameBytes.copy(localHeader, 30)

    const localOffset = 0
    const localSize = localHeader.length + content.length

    // ZIP64 extra with only localHeaderOffset (8 bytes)
    const extra64 = Buffer.alloc(4 + 8)
    writeUInt16LE(extra64, 0x0001, 0)
    writeUInt16LE(extra64, 8, 2)
    writeBigUInt64LE(extra64, BigInt(localOffset), 4) // localHeaderOffset only

    const cd = Buffer.alloc(46 + nameBytes.length + extra64.length)
    writeUInt32LE(cd, 0x02014b50, 0)
    writeUInt16LE(cd, 20, 4)
    writeUInt16LE(cd, 20, 6)
    writeUInt16LE(cd, 0, 8)
    writeUInt16LE(cd, 0, 10)
    writeUInt16LE(cd, 0, 12)
    writeUInt16LE(cd, 0, 14)
    writeUInt32LE(cd, crc32(content), 16)
    writeUInt32LE(cd, content.length, 20) // compressedSize - real value (NOT 0xffffffff)
    writeUInt32LE(cd, content.length, 24) // uncompressedSize - real value (NOT 0xffffffff)
    writeUInt16LE(cd, nameBytes.length, 28)
    writeUInt16LE(cd, extra64.length, 30)
    writeUInt16LE(cd, 0, 32)
    writeUInt16LE(cd, 0, 34)
    writeUInt16LE(cd, 0, 36)
    writeUInt32LE(cd, 0, 38)
    writeUInt32LE(cd, 0xffffffff, 42) // localHeaderOffset → ZIP64 marker
    nameBytes.copy(cd, 46)
    extra64.copy(cd, 46 + nameBytes.length)

    const cdOffset = localSize
    const eocd = Buffer.alloc(22)
    writeUInt32LE(eocd, 0x06054b50, 0)
    writeUInt16LE(eocd, 0, 4)
    writeUInt16LE(eocd, 0, 6)
    writeUInt16LE(eocd, 1, 8)
    writeUInt16LE(eocd, 1, 10)
    writeUInt32LE(eocd, cd.length, 12)
    writeUInt32LE(eocd, cdOffset, 16)
    writeUInt16LE(eocd, 0, 20)

    const buf = Buffer.concat([localHeader, content, cd, eocd])
    const path = await writeTmpZip(buf)
    const dir = await readZipDirectory(path)
    // localHeaderOffset should be read from ZIP64 extra; sizes from regular fields
    expect(dir.entries[0].uncompressedSize).toBe(content.length)
    expect(dir.entries[0].compressedSize).toBe(content.length)
    expect(dir.entries[0].localHeaderOffset).toBe(0)
  })

  /**
   * Truncated ZIP64 extra field: ZIP64 id is present but field data is too
   * short (only 4 bytes instead of 8 for the first value).
   * This covers branch 167,0 (the `fieldPos + 8 > fieldEnd` throw path).
   */
  it('throws on truncated ZIP64 extra field (branch 167 readNext check)', async () => {
    const content = Buffer.from('x')
    const nameBytes = Buffer.from('t.txt')
    const localHeader = Buffer.alloc(30 + nameBytes.length)
    writeUInt32LE(localHeader, 0x04034b50, 0)
    writeUInt16LE(localHeader, 20, 4)
    writeUInt16LE(localHeader, 0, 6)
    writeUInt16LE(localHeader, 0, 8)
    writeUInt16LE(localHeader, 0, 10)
    writeUInt16LE(localHeader, 0, 12)
    writeUInt32LE(localHeader, crc32(content), 14)
    writeUInt32LE(localHeader, content.length, 18)
    writeUInt32LE(localHeader, content.length, 22)
    writeUInt16LE(localHeader, nameBytes.length, 26)
    writeUInt16LE(localHeader, 0, 28)
    nameBytes.copy(localHeader, 30)

    const localSize = localHeader.length + content.length

    // ZIP64 extra with 0x0001 id but only 4 bytes of data (too short for any 8-byte value)
    const extra64 = Buffer.alloc(4 + 4)
    writeUInt16LE(extra64, 0x0001, 0) // ZIP64 id
    writeUInt16LE(extra64, 4, 2)       // field size (only 4 bytes, need 8)
    extra64.writeUInt32LE(0, 4)        // partial data

    const cd = Buffer.alloc(46 + nameBytes.length + extra64.length)
    writeUInt32LE(cd, 0x02014b50, 0)
    writeUInt16LE(cd, 20, 4)
    writeUInt16LE(cd, 20, 6)
    writeUInt16LE(cd, 0, 8)
    writeUInt16LE(cd, 0, 10)
    writeUInt16LE(cd, 0, 12)
    writeUInt16LE(cd, 0, 14)
    writeUInt32LE(cd, crc32(content), 16)
    writeUInt32LE(cd, content.length, 20) // compressedSize - not marker
    writeUInt32LE(cd, 0xffffffff, 24)     // uncompressedSize - triggers ZIP64 extra read
    writeUInt16LE(cd, nameBytes.length, 28)
    writeUInt16LE(cd, extra64.length, 30)
    writeUInt16LE(cd, 0, 32)
    writeUInt16LE(cd, 0, 34)
    writeUInt16LE(cd, 0, 36)
    writeUInt32LE(cd, 0, 38)
    writeUInt32LE(cd, 0, 42)
    nameBytes.copy(cd, 46)
    extra64.copy(cd, 46 + nameBytes.length)

    const cdOffset = localSize
    const eocd = Buffer.alloc(22)
    writeUInt32LE(eocd, 0x06054b50, 0)
    writeUInt16LE(eocd, 0, 4)
    writeUInt16LE(eocd, 0, 6)
    writeUInt16LE(eocd, 1, 8)
    writeUInt16LE(eocd, 1, 10)
    writeUInt32LE(eocd, cd.length, 12)
    writeUInt32LE(eocd, cdOffset, 16)
    writeUInt16LE(eocd, 0, 20)

    const buf = Buffer.concat([localHeader, content, cd, eocd])
    const path = await writeTmpZip(buf)
    await expect(readZipDirectory(path)).rejects.toThrow(/Corrupt zip: truncated ZIP64 extra field/)
  })
})

// ─── readFully: EOF path ─────────────────────────────────────────────────────

describe('readFully — EOF / truncated file', () => {
  it('throws when the file ends before all bytes can be read', async () => {
    // Build a valid zip, then truncate it so the CD section is incomplete.
    // The EOCD says CD is at offset 0 with size = full file length (impossible),
    // forcing readFully to hit EOF.
    // Strategy: Build a real zip, then truncate the file so parseCentralDirectory
    // tries to read more bytes than available.
    const content = Buffer.from('hello world')
    const buf = await buildZip([{ name: 'hello.txt', data: content, method: 0 }])

    // Truncate to just the EOCD (last 22 bytes + a few bytes of CD)
    // The EOCD declares cdSize = real CD size, but we've removed the local files + most of CD
    // Result: readFully will hit EOF while reading the CD
    const eocdOffset = buf.length - 22
    const cdOffset = buf.readUInt32LE(eocdOffset + 16)
    const cdSize = buf.readUInt32LE(eocdOffset + 12)

    // Keep only the first 2 bytes of CD + the EOCD, so parseCentralDirectory
    // tries to read cdSize bytes but only 2 are available before EOF
    const truncated = Buffer.alloc(2 + 22)
    // Put first 2 bytes of CD at offset 0
    buf.copy(truncated, 0, cdOffset, cdOffset + 2)
    // Reconstruct EOCD pointing to offset 0 for CD
    writeUInt32LE(truncated, 0x06054b50, 2)
    writeUInt16LE(truncated, 0, 6)
    writeUInt16LE(truncated, 0, 8)
    writeUInt16LE(truncated, 1, 10)
    writeUInt16LE(truncated, 1, 12)
    writeUInt32LE(truncated, cdSize, 14)  // say cdSize is the real size (but only 2 bytes exist at offset 0)
    writeUInt32LE(truncated, 0, 18)       // CD at file offset 0
    writeUInt16LE(truncated, 0, 22)

    const path = await writeTmpZip(truncated)
    await expect(readZipDirectory(path)).rejects.toThrow(/Unexpected end of file|zip/)
  })
})
