import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required for encryption")
  return createHash("sha256").update(secret).digest()
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: base64(iv):base64(ciphertext):base64(tag)
  return `enc:${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`
}

export function decrypt(encoded: string): string {
  if (!encoded.startsWith("enc:")) {
    console.warn("[crypto] Value is not encrypted — returning as plaintext (migration fallback)")
    return encoded
  }
  try {
    const [, ivB64, dataB64, tagB64] = encoded.split(":")
    const key = getEncryptionKey()
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"))
    decipher.setAuthTag(Buffer.from(tagB64, "base64"))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()])
    return decrypted.toString("utf8")
  } catch {
    throw new Error("Decryption failed — data may be corrupted or encryption key may have changed")
  }
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("enc:")
}
