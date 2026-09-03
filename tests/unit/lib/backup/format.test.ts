import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
  BACKUP_MAGIC,
  BACKUP_VERSION,
  BackupFormatError,
  END_MARKER,
  assembleBackupFile,
  calculateChecksum,
  sha256Hex,
  stripNul,
} from '@/lib/backup/format'

describe('format constants', () => {
  it('exposes the v3 format identity', () => {
    expect(BACKUP_VERSION).toBe('3.0')
    expect(BACKUP_MAGIC).toBe('ARI Database Backup')
    expect(END_MARKER).toBe('-- End of backup')
  })
})

describe('sha256Hex / calculateChecksum', () => {
  it('matches a node crypto reference digest', () => {
    const reference = crypto.createHash('sha256').update('hello').digest('hex')
    expect(sha256Hex('hello')).toBe(reference)
  })

  it('is stable for identical data and changes with the data', () => {
    const data = { a: 1, b: ['x'] }
    expect(calculateChecksum(data)).toBe(calculateChecksum({ a: 1, b: ['x'] }))
    expect(calculateChecksum(data)).not.toBe(calculateChecksum({ a: 2, b: ['x'] }))
  })
})

describe('stripNul', () => {
  it('removes NUL characters and leaves everything else', () => {
    expect(stripNul('a\0b')).toBe('ab')
    expect(stripNul('\0')).toBe('')
    expect(stripNul('plain')).toBe('plain')
  })
})

describe('assembleBackupFile', () => {
  const header = '-- ARI Database Backup v3\n'
  const body = `SELECT 1;\n${END_MARKER}\n`
  const metadata = { version: BACKUP_VERSION, timestamp: '2026-01-01T00:00:00.000Z', tables: ['tasks'] }

  it('injects a contentSha256 that hashes exactly the body', () => {
    const file = assembleBackupFile(header, metadata, body)
    const metaLine = file.split('\n').find((l) => l.startsWith('-- {'))
    expect(metaLine).toBeDefined()
    const parsed = JSON.parse(metaLine!.slice(3))
    expect(parsed.contentSha256).toBe(sha256Hex(body))
    expect(parsed.version).toBe(BACKUP_VERSION)
    expect(parsed.tables).toEqual(['tasks'])
  })

  it('is self-consistent: hashing everything after the metadata line reproduces the embedded checksum', () => {
    const file = assembleBackupFile(header, metadata, body)
    const metaLineEnd = file.indexOf('\n', file.indexOf('-- {')) + 1
    expect(sha256Hex(file.slice(metaLineEnd))).toBe(JSON.parse(file.split('\n').find((l) => l.startsWith('-- {'))!.slice(3)).contentSha256)
  })

  it('keeps the header verbatim above the metadata line', () => {
    const file = assembleBackupFile(header, metadata, body)
    expect(file.startsWith(`${header}-- Backup Metadata (DO NOT MODIFY)\n-- {`)).toBe(true)
    expect(file.endsWith(body)).toBe(true)
  })

  it('rejects a header that does not end with a newline', () => {
    expect(() => assembleBackupFile('-- no newline', metadata, body)).toThrow(BackupFormatError)
  })

  it('rejects a body missing the end marker', () => {
    expect(() => assembleBackupFile(header, metadata, 'SELECT 1;\n')).toThrow(BackupFormatError)
  })

  it('accepts a body whose end marker is followed by trailing whitespace', () => {
    expect(() => assembleBackupFile(header, metadata, `SELECT 1;\n${END_MARKER}\n\n`)).not.toThrow()
  })
})
