// Simple file-based locks for preventing race conditions
import { logger } from '../../lib/logger'

interface Lock {
  id: string
  timestamp: number
  timeout: number
}

const locks = new Map<string, Lock>()
const DEFAULT_TIMEOUT = 30000 // 30 seconds

export class FileLock {
  private lockId: string
  private timeout: number

  constructor(lockId: string, timeout: number = DEFAULT_TIMEOUT) {
    this.lockId = lockId
    this.timeout = timeout
  }

  acquire(): boolean {
    const now = Date.now()
    const existingLock = locks.get(this.lockId)

    // Check if lock exists and hasn't timed out
    if (existingLock && (now - existingLock.timestamp) < existingLock.timeout) {
      return false
    }

    // Acquire the lock
    locks.set(this.lockId, {
      id: this.lockId,
      timestamp: now,
      timeout: this.timeout
    })

    logger.info(`Lock acquired: ${this.lockId}`)
    return true
  }

  release(): void {
    if (locks.delete(this.lockId)) {
      logger.info(`Lock released: ${this.lockId}`)
    }
  }

  static cleanup(): void {
    const now = Date.now()
    for (const [lockId, lock] of locks.entries()) {
      if ((now - lock.timestamp) >= lock.timeout) {
        locks.delete(lockId)
        logger.info(`Lock timed out and removed: ${lockId}`)
      }
    }
  }
}

// Cleanup expired locks every minute
if (typeof window === 'undefined') {
  setInterval(() => {
    FileLock.cleanup()
  }, 60000)
}