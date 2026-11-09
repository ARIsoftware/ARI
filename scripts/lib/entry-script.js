import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Whether the module at `importMetaUrl` is the script Node was started with.
 * A script runs its main only when this is true — never when a test imports
 * it. Node resolves symlinks in the entry it loads, so argv[1] is resolved the
 * same way before comparing: a checkout reached through a symlinked directory
 * must still run. A missing or unreadable argv[1] is "not the entry".
 */
export function isEntryScript(importMetaUrl, argv = process.argv) {
  if (!argv[1]) return false
  try {
    return fs.realpathSync(argv[1]) === fileURLToPath(importMetaUrl)
  } catch {
    return false
  }
}
