import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { encrypt, decrypt, isEncrypted } from '@/lib/crypto'

const TEST_SECRET = 'test-secret-for-unit-tests'

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = TEST_SECRET
})

describe('crypto — round-trip', () => {
  it('encrypts and decrypts a regular string', () => {
    const plaintext = 'hello'
    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  it('encrypts and decrypts an empty string', () => {
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('encrypts and decrypts a 10KB string', () => {
    const large = 'x'.repeat(10 * 1024)
    expect(decrypt(encrypt(large))).toBe(large)
  })
})

describe('crypto — format', () => {
  it('encrypted value starts with enc:', () => {
    expect(encrypt('hello').startsWith('enc:')).toBe(true)
  })

  it('isEncrypted returns true for encrypted values', () => {
    expect(isEncrypted(encrypt('hello'))).toBe(true)
  })

  it('isEncrypted returns false for plain strings', () => {
    expect(isEncrypted('plain')).toBe(false)
  })

  it('isEncrypted returns false for null', () => {
    expect(isEncrypted(null)).toBe(false)
  })
})

describe('crypto — migration fallback', () => {
  it('decrypt on non-encrypted string returns it unchanged (no throw)', () => {
    expect(decrypt('not-encrypted')).toBe('not-encrypted')
  })
})

describe('crypto — tamper detection', () => {
  it('flipping a character in the ciphertext makes decrypt throw', () => {
    const enc = encrypt('hello')
    // Format: enc:<ivB64>:<dataB64>:<tagB64>
    const parts = enc.split(':')
    // Flip one character in the data segment
    const data = parts[2]
    const flipped = data.slice(0, -1) + (data.slice(-1) === 'A' ? 'B' : 'A')
    const tampered = [parts[0], parts[1], flipped, parts[3]].join(':')
    expect(() => decrypt(tampered)).toThrow(/Decryption failed/)
  })
})

describe('crypto — missing secret', () => {
  afterEach(() => {
    process.env.BETTER_AUTH_SECRET = TEST_SECRET
  })

  it('encrypt throws when BETTER_AUTH_SECRET is missing', () => {
    delete process.env.BETTER_AUTH_SECRET
    expect(() => encrypt('hello')).toThrow(/BETTER_AUTH_SECRET is required/)
  })
})
