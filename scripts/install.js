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
  const MJS_URL = `https://raw.githubusercontent.com/ARIsoftware/ARI/${BRANCH}/scripts/install.mjs`

  function runInstaller(file, cleanup) {
    const result = spawnSync(process.execPath, [file, ...process.argv.slice(2)], {
      stdio: 'inherit',
    })
    if (cleanup) {
      try {
        fs.unlinkSync(file)
      } catch {
        /* best-effort temp cleanup */
      }
    }
    process.exit(result.status === null ? 1 : result.status)
  }

  function download(url, dest, redirectsLeft) {
    return new Promise((resolve, reject) => {
      https
        .get(url, { headers: { 'User-Agent': 'ari-installer-shim' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            if (redirectsLeft <= 0) return reject(new Error('Too many redirects'))
            return resolve(download(res.headers.location, dest, redirectsLeft - 1))
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

  // Prefer a local install.mjs: next to this script (repo checkout) or under
  // the current directory's scripts/ (launcher run from a checkout).
  const candidates = [
    path.join(path.dirname(process.argv[1] || '.'), 'install.mjs'),
    path.join(process.cwd(), 'scripts', 'install.mjs'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) runInstaller(candidate, false)
  }

  const tmpMjs = path.join(os.tmpdir(), `ari-install-${process.pid}.mjs`)
  try {
    await download(MJS_URL, tmpMjs, 3)
  } catch (err) {
    console.error(`Failed to download the ARI installer (${MJS_URL}): ${err.message}`)
    process.exit(1)
  }
  runInstaller(tmpMjs, true)
})()
