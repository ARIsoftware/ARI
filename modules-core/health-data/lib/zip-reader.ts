/**
 * Minimal streaming ZIP reader (dependency-free).
 *
 * Reads the central directory from the end of a zip file on disk, then
 * exposes each entry as a Node Readable stream (raw-deflate entries are
 * piped through zlib.createInflateRaw). This lets the module stream a
 * multi-hundred-MB export.xml out of an Apple Health export without ever
 * holding the archive or the entry in memory.
 *
 * Supports the subset of the ZIP spec that real-world Apple Health
 * exports use: stored (0) and deflate (8) compression, plus ZIP64
 * sizes/offsets for exports larger than 4GB.
 */

import { open, type FileHandle } from 'fs/promises'
import { createReadStream } from 'fs'
import { createInflateRaw } from 'zlib'
import { Readable } from 'stream'

const EOCD_SIG = 0x06054b50
const EOCD64_LOCATOR_SIG = 0x07064b50
const EOCD64_SIG = 0x06064b50
const CENTRAL_DIR_SIG = 0x02014b50
const LOCAL_HEADER_SIG = 0x04034b50

/** Max EOCD search window: 22-byte EOCD + 65535-byte comment */
const EOCD_SEARCH_WINDOW = 22 + 65535

/**
 * fs read() may return fewer bytes than requested even on regular files;
 * loop until the full range is read (or the file ends early).
 */
async function readFully(handle: FileHandle, buf: Buffer, length: number, position: number): Promise<void> {
  let done = 0
  while (done < length) {
    const { bytesRead } = await handle.read(buf, done, length - done, position + done)
    if (bytesRead === 0) {
      throw new Error('Unexpected end of file while reading zip structures')
    }
    done += bytesRead
  }
}

const METHOD_STORED = 0
const METHOD_DEFLATE = 8

export interface ZipEntry {
  path: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

export interface ZipDirectory {
  entries: ZipEntry[]
}

/**
 * Read and parse the central directory of a zip file.
 */
export async function readZipDirectory(zipPath: string): Promise<ZipDirectory> {
  const handle = await open(zipPath, 'r')
  try {
    const { size: fileSize } = await handle.stat()
    if (fileSize < 22) {
      throw new Error('File is too small to be a zip archive')
    }

    const eocd = await findEndOfCentralDirectory(handle, fileSize)
    const entries = await parseCentralDirectory(handle, eocd.cdOffset, eocd.cdSize, eocd.totalEntries)
    return { entries }
  } finally {
    await handle.close()
  }
}

interface EocdInfo {
  cdOffset: number
  cdSize: number
  totalEntries: number
}

async function findEndOfCentralDirectory(handle: FileHandle, fileSize: number): Promise<EocdInfo> {
  const windowSize = Math.min(EOCD_SEARCH_WINDOW, fileSize)
  const windowStart = fileSize - windowSize
  const buf = Buffer.alloc(windowSize)
  await readFully(handle, buf, windowSize, windowStart)

  // Scan backwards for the EOCD signature. The signature bytes can also
  // appear inside the real record's archive comment, so a candidate only
  // counts if its comment-length field makes the record end exactly at EOF.
  let eocdPos = -1
  for (let i = windowSize - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG && i + 22 + buf.readUInt16LE(i + 20) === windowSize) {
      eocdPos = i
      break
    }
  }
  if (eocdPos === -1) {
    throw new Error('Not a zip archive (end of central directory record not found)')
  }

  let totalEntries = buf.readUInt16LE(eocdPos + 10)
  let cdSize = buf.readUInt32LE(eocdPos + 12)
  let cdOffset = buf.readUInt32LE(eocdPos + 16)

  const needsZip64 = totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff

  // The ZIP64 EOCD locator sits directly before the EOCD when present
  const locatorPos = eocdPos - 20
  if (needsZip64 || (locatorPos >= 0 && buf.readUInt32LE(locatorPos) === EOCD64_LOCATOR_SIG)) {
    if (locatorPos < 0 || buf.readUInt32LE(locatorPos) !== EOCD64_LOCATOR_SIG) {
      throw new Error('Zip archive requires ZIP64 but the ZIP64 locator is missing')
    }
    const eocd64Offset = Number(buf.readBigUInt64LE(locatorPos + 8))
    const eocd64 = Buffer.alloc(56)
    await readFully(handle, eocd64, 56, eocd64Offset)
    if (eocd64.readUInt32LE(0) !== EOCD64_SIG) {
      throw new Error('Invalid ZIP64 end of central directory record')
    }
    totalEntries = Number(eocd64.readBigUInt64LE(32))
    cdSize = Number(eocd64.readBigUInt64LE(40))
    cdOffset = Number(eocd64.readBigUInt64LE(48))
  }

  return { cdOffset, cdSize, totalEntries }
}

async function parseCentralDirectory(
  handle: FileHandle,
  cdOffset: number,
  cdSize: number,
  totalEntries: number
): Promise<ZipEntry[]> {
  const buf = Buffer.alloc(cdSize)
  await readFully(handle, buf, cdSize, cdOffset)

  const entries: ZipEntry[] = []
  let pos = 0
  for (let i = 0; i < totalEntries && pos + 46 <= cdSize; i++) {
    if (buf.readUInt32LE(pos) !== CENTRAL_DIR_SIG) {
      throw new Error('Corrupt zip: bad central directory entry signature')
    }
    const compressionMethod = buf.readUInt16LE(pos + 10)
    let compressedSize = buf.readUInt32LE(pos + 20)
    let uncompressedSize = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    let localHeaderOffset = buf.readUInt32LE(pos + 42)
    const path = buf.toString('utf8', pos + 46, pos + 46 + nameLen)

    // ZIP64 extra field (id 0x0001): 8-byte values present only for the
    // fixed fields that overflowed, in spec order: uncompressed size,
    // compressed size, local header offset.
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      let extraPos = pos + 46 + nameLen
      const extraEnd = extraPos + extraLen
      while (extraPos + 4 <= extraEnd) {
        const fieldId = buf.readUInt16LE(extraPos)
        const fieldSize = buf.readUInt16LE(extraPos + 2)
        if (fieldId === 0x0001) {
          const fieldEnd = Math.min(extraPos + 4 + fieldSize, extraEnd, buf.length)
          let fieldPos = extraPos + 4
          const readNext = (): number => {
            if (fieldPos + 8 > fieldEnd) {
              throw new Error('Corrupt zip: truncated ZIP64 extra field')
            }
            const value = Number(buf.readBigUInt64LE(fieldPos))
            fieldPos += 8
            return value
          }
          if (uncompressedSize === 0xffffffff) uncompressedSize = readNext()
          if (compressedSize === 0xffffffff) compressedSize = readNext()
          if (localHeaderOffset === 0xffffffff) localHeaderOffset = readNext()
          break
        }
        extraPos += 4 + fieldSize
      }
    }

    entries.push({ path, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset })
    pos += 46 + nameLen + extraLen + commentLen
  }

  return entries
}

/**
 * Locate the main export.xml among a health export's entries. Apple
 * localizes the filename per device language (e.g. `Exportar.xml`), so
 * when no literal `export.xml` exists, fall back to the largest XML entry
 * that isn't the CDA duplicate, an auxiliary file, or an AppleDouble
 * resource fork.
 */
export function findExportXml(entries: ZipEntry[]): ZipEntry | null {
  const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

  const exact = entries.find((e) => {
    const lower = e.path.toLowerCase()
    return basename(lower) === 'export.xml' && !lower.includes('cda')
  })
  if (exact) return exact

  let best: ZipEntry | null = null
  for (const entry of entries) {
    const lower = entry.path.toLowerCase()
    if (!lower.endsWith('.xml')) continue
    if (lower.includes('cda') || lower.includes('electrocardiograms/') || lower.includes('workout-routes/')) continue
    if (basename(lower).startsWith('._')) continue
    if (!best || entry.uncompressedSize > best.uncompressedSize) best = entry
  }
  return best
}

/**
 * Open a readable stream of an entry's decompressed content.
 */
export async function openZipEntryStream(zipPath: string, entry: ZipEntry): Promise<Readable> {
  if (entry.compressionMethod !== METHOD_STORED && entry.compressionMethod !== METHOD_DEFLATE) {
    throw new Error(`Unsupported zip compression method ${entry.compressionMethod} for ${entry.path}`)
  }

  // Zero-byte entries have no data range to read (createReadStream cannot
  // express an empty range) and no deflate stream to inflate.
  if (entry.compressedSize === 0) {
    return Readable.from([])
  }

  // The local header's name/extra lengths can differ from the central
  // directory's, so read them to find where the data actually starts.
  const handle = await open(zipPath, 'r')
  let dataStart: number
  try {
    const header = Buffer.alloc(30)
    await readFully(handle, header, 30, entry.localHeaderOffset)
    if (header.readUInt32LE(0) !== LOCAL_HEADER_SIG) {
      throw new Error(`Corrupt zip: bad local header for ${entry.path}`)
    }
    const nameLen = header.readUInt16LE(26)
    const extraLen = header.readUInt16LE(28)
    dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen
  } finally {
    await handle.close()
  }

  const raw = createReadStream(zipPath, {
    start: dataStart,
    end: dataStart + entry.compressedSize - 1,
  })

  if (entry.compressionMethod === METHOD_STORED) {
    return raw
  }

  const inflate = createInflateRaw()
  raw.on('error', (err) => inflate.destroy(err))
  // If the consumer destroys/errors the inflate side, release the file
  // descriptor held by the raw stream too.
  inflate.on('close', () => raw.destroy())
  return raw.pipe(inflate)
}

/**
 * Read an entry fully into memory (for small entries like ECG CSVs).
 */
export async function readZipEntry(zipPath: string, entry: ZipEntry, maxBytes: number): Promise<Buffer> {
  if (entry.uncompressedSize > maxBytes) {
    throw new Error(`Zip entry ${entry.path} exceeds the ${maxBytes} byte limit`)
  }
  const stream = await openZipEntryStream(zipPath, entry)
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    total += (chunk as Buffer).length
    if (total > maxBytes) {
      stream.destroy()
      throw new Error(`Zip entry ${entry.path} exceeds the ${maxBytes} byte limit`)
    }
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}
