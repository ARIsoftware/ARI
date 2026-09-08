#!/usr/bin/env node

/**
 * Compatibility shim for stale installer launchers.
 *
 * The real installer is scripts/install.mjs (ESM). Old copies of install.sh /
 * install.ps1 in the wild still download THIS path (scripts/install.js) to a
 * temp directory and run it with `node` — a temp dir has no package.json, so
 * the file must execute as CommonJS there. Inside the repo, `"type": "module"`
 * makes the same file parse as ESM. This shim therefore uses only syntax valid
 * in BOTH module systems (dynamic import(), no require, no top-level import/
 * export statements) and simply locates or downloads install.mjs and re-execs
 * it, forwarding argv, env, and the exit code.
 */

/* eslint-disable no-console */
;(async () => {
  const [{ spawnSync }, fs, os, path, https] = await Promise.all([
    import('node:child_process'),
    import('node:fs'),
    import('node:os'),
    import('node:path'),
    import('node:https'),
  ])

  const BRANCH = process.env.ARI_BRANCH || 'main'
  // Branch names only: dot segments would traverse the raw.githubusercontent
  // path onto a different repository and execute someone else's code.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(BRANCH) || BRANCH.includes('..')) {
    console.error(`Invalid ARI_BRANCH: '${BRANCH}'`)
    process.exit(1)
  }
  const MJS_URL = `https://raw.githubusercontent.com/ARIsoftware/ARI/${BRANCH}/scripts/install.mjs`

  function runInstaller(file, cleanupDir) {
    const result = spawnSync(process.execPath, [file, ...process.argv.slice(2)], {
      stdio: 'inherit',
    })
    if (cleanupDir) {
      try {
        fs.rmSync(cleanupDir, { recursive: true, force: true })
      } catch {
        /* best-effort temp cleanup */
      }
    }
    process.exit(result.status === null ? 1 : result.status)
  }

  // The downloaded file is EXECUTED, so every hop — including redirects —
  // must stay on GitHub-owned https hosts (same allowlist as install.mjs).
  function assertAllowedUrl(url) {
    const parsed = new URL(url)
    const allowed = /^(api\.github\.com|github\.com|codeload\.github\.com|([a-z0-9-]+\.)*githubusercontent\.com)$/i
    if (parsed.protocol !== 'https:' || !allowed.test(parsed.hostname)) {
      throw new Error(`Refusing to download from unexpected host: ${parsed.hostname}`)
    }
  }

  function download(url, dest, redirectsLeft) {
    assertAllowedUrl(url)
    return new Promise((resolve, reject) => {
      https
        .get(url, { headers: { 'User-Agent': 'ari-installer-shim' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            if (redirectsLeft <= 0) return reject(new Error('Too many redirects'))
            try {
              return resolve(download(res.headers.location, dest, redirectsLeft - 1))
            } catch (e) {
              return reject(e)
            }
          }
          if (res.statusCode !== 200) {
            res.resume()
            return reject(new Error(`GET ${url} returned ${res.statusCode}`))
          }
          const file = fs.createWriteStream(dest)
          res.pipe(file)
          file.on('finish', () => file.close(resolve))
          file.on('error', (err) => {
            try {
              fs.unlinkSync(dest)
            } catch {
              /* ignore */
            }
            reject(err)
          })
        })
        .on('error', reject)
    })
  }

  // Prefer a local install.mjs sitting NEXT TO THIS SCRIPT (a real checkout).
  // Deliberately no process.cwd() guessing — running the installer from an
  // arbitrary directory must never execute an installer file planted there.
  // That includes the stdin-pipe case (`curl … | node`): argv[1] is absent
  // there, dirname would resolve to '.', and the "sibling" would be a file
  // in the current directory — skip the local path entirely and download.
  if (process.argv[1]) {
    const sibling = path.join(path.dirname(process.argv[1]), 'install.mjs')
    if (fs.existsSync(sibling)) runInstaller(sibling, null)
  }

  // Private 0700 scratch dir (mkdtemp): a predictable pid-based /tmp name
  // could be pre-created or symlinked by another local user and swapped
  // between download and exec.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ari-install-'))
  const tmpMjs = path.join(workDir, 'install.mjs')
  try {
    await download(MJS_URL, tmpMjs, 3)
  } catch (err) {
    console.error(`Failed to download the ARI installer (${MJS_URL}): ${err.message}`)
    try {
      fs.rmSync(workDir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
    process.exit(1)
  }
  runInstaller(tmpMjs, workDir)
})()
