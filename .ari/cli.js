#!/usr/bin/env node

/**
 * ARI CLI — Local development helper
 * Usage: ./ari start [--lan] [--tunnel] [--verbose] | stop | status | update | fix-deps | doctor
 */

import { execSync, spawn, spawnSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { reconcileCustomModuleDeps } from '../scripts/reconcile-module-deps.js';

const cjsRequire = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.supabase.local');
const PGWEB_PID_FILE = path.join(ROOT, '.ari', 'pgweb.pid');
const PGWEB_PORT = 5050;
const IS_WIN = process.platform === 'win32';
const PG_IS_READY = IS_WIN ? 'pg_isready -h 127.0.0.1 -q' : 'pg_isready -q';

// On Windows, the installer downloads pgweb.exe here (no winget package exists).
const WIN_PGWEB_EXE = IS_WIN
  ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'ARI', 'bin', 'pgweb.exe')
  : null;

// `./ari start --tunnel` — Cloudflare Quick Tunnel via the cloudflared binary.
const TUNNEL_DOCS_URL = 'https://ari.software/docs/tunnel';
// cloudflared prints the public URL inside an ASCII box on stderr, one line
// after "Your quick Tunnel has been created!". Match only that boxed line: the
// binary also logs `https://api.trycloudflare.com` (its provisioning API) on
// failure, which a looser regex would happily banner as the tunnel URL.
const TUNNEL_CREATED_MARKER = 'Your quick Tunnel has been created';
const TUNNEL_URL_LINE_RE = /\|\s*(https:\/\/([a-z0-9-]+)\.trycloudflare\.com)\s*\|\s*$/;
// QUIC (UDP 7844) is tried first; on networks that block it cloudflared falls
// back to HTTP/2 over TCP 443 only after retries, so 30s is too tight.
const TUNNEL_START_TIMEOUT_MS = 60_000;
const TUNNEL_LOG_TAIL_LINES = 40;

// ── Helpers ────────────────────────────────────────────────────────────────

const YELLOW = '\x1b[1;33m';
const GREEN = '\x1b[1;32m';
const RED = '\x1b[1;31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', cwd: ROOT, ...opts }).trim();
  } catch {
    return null;
  }
}

/**
 * Value of KEY in an env file, or null when the file/key is absent or the
 * value is empty. One grammar for every reader in this file: the first
 * `KEY=` line wins, surrounding whitespace is trimmed, and a matching pair of
 * outer quotes is stripped (escaped quotes inside a double-quoted value, as
 * written by lib/env-file.ts formatEnvValue(), are left as-is — callers here
 * only need presence or a URL/mode token, never the exact secret).
 */
function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(new RegExp('^' + key + '=(.*)$', 'm'));
  if (!match) return null;
  let value = match[1].trim();
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    value = value.slice(1, -1);
  }
  return value || null;
}

function getDbMode() {
  // Check .env.local for ARI_DB_MODE
  const mode = readEnvKey(path.join(ROOT, '.env.local'), 'ARI_DB_MODE');
  if (mode) return mode;
  // Backward compat: if .env.supabase.local exists, assume supabaselocal
  if (fs.existsSync(ENV_FILE)) return 'supabaselocal';
  return 'postgres';
}

function isDockerRunning() {
  return !!run('docker info');
}

function isSupabaseRunning() {
  const out = run('supabase status');
  return out && out.includes('API URL');
}

function parseSupabaseEnv() {
  const raw = run('supabase status -o env');
  if (!raw) return null;
  const vars = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

// SYNC: env key mapping is duplicated in the installer generateEnvFile(). Keep both in sync.
function writeEnvFile(supabaseVars) {
  // Only write keys that have values. Writing empty `KEY=` lines causes
  // dotenv (with override:true in next.config.mjs) to overwrite values from
  // .env.local with empty strings, which would break the client bundle.
  const mappings = [
    ['NEXT_PUBLIC_SUPABASE_URL', supabaseVars.API_URL],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', supabaseVars.ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', supabaseVars.SERVICE_ROLE_KEY],
    ['DATABASE_URL', supabaseVars.DB_URL],
  ];
  const content = mappings
    .filter(([, value]) => value)
    .map(([key, value]) => key + '=' + value)
    .join('\n') + '\n';

  fs.writeFileSync(ENV_FILE, content);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function logReconcileResult(result, log) {
  if (!result.ok) {
    log('  ' + YELLOW + '⚠' + RESET + ' Module dep reconcile error: ' + result.error);
    return;
  }
  if (result.skipped) return;
  if (result.changed) {
    const names = result.added.map((a) => a.name).join(', ');
    log('  ' + GREEN + '✔' + RESET + ` Synced ${result.added.length} custom-module dep(s): ${names}`);
  }
  for (const c of result.conflicts) {
    // `block` is present only on root-vs-module conflicts; without it the other
    // range belongs to a sibling module, not package.json. Saying "package.json
    // has <spec>" in that case points the user at a file that never held it.
    if (c.block) {
      const where = c.block === 'dependencies' ? 'package.json' : `package.json ${c.block}`;
      log('  ' + YELLOW + '⚠' + RESET + ` ${c.name}: module wants ${c.declared}, ${where} has ${c.existing}`);
    } else {
      log('  ' + YELLOW + '⚠' + RESET + ` ${c.name}: modules disagree — one wants ${c.declared}, another wants ${c.existing}`);
      log('  ' + DIM + '  Skipped; pin the same range in both modules.' + RESET);
    }
    log('  ' + DIM + '  Source(s): ' + c.sources.join(', ') + RESET);
  }
  for (const inv of result.invalid) {
    // '(manifest)' entries mean the whole module was skipped, not one dep.
    if (inv.name === '(manifest)') {
      log('  ' + YELLOW + '⚠' + RESET + ` ${inv.module}: skipped module (${inv.reason})`);
    } else {
      log('  ' + YELLOW + '⚠' + RESET + ` ${inv.module}: skipped dep "${inv.name}" (${inv.reason})`);
    }
  }
}

function getDatabaseUrl() {
  // Match next.config.mjs dotenv layering: .env.local first, then .env.supabase.local
  // overrides on top (override: true). Iterate in that order so the later file wins.
  const candidates = [path.join(ROOT, '.env.local'), ENV_FILE];
  let result = null;
  for (const p of candidates) {
    const value = readEnvKey(p, 'DATABASE_URL');
    if (value) result = value;
  }
  return result;
}

/**
 * SSL setting for a one-off pg.Client, mirroring lib/db/pool.ts
 * sslConfigFor(): plain for local databases, TLS without CA verification for
 * hosted ones (Supabase's pooler presents a private CA). Must match what the
 * app itself uses, or a pre-flight can refuse a database the app connects to.
 */
function sslConfigFor(databaseUrl) {
  return databaseUrl.includes('127.0.0.1') || databaseUrl.includes('localhost')
    ? false
    : { rejectUnauthorized: false };
}

function isPgwebRunning() {
  if (!fs.existsSync(PGWEB_PID_FILE)) return false;
  const pid = fs.readFileSync(PGWEB_PID_FILE, 'utf8').trim();
  try {
    process.kill(Number(pid), 0); // signal 0 = check if process exists
    return true;
  } catch {
    // Stale PID file
    try { fs.unlinkSync(PGWEB_PID_FILE); } catch {}
    return false;
  }
}

function commandExists(cmd) {
  return !!run(IS_WIN ? `where ${cmd}` : `command -v ${cmd}`);
}

function pgwebExecutable() {
  if (WIN_PGWEB_EXE && fs.existsSync(WIN_PGWEB_EXE)) return WIN_PGWEB_EXE;
  return commandExists('pgweb') ? 'pgweb' : null;
}

/**
 * Path to cloudflared, or null. On Windows, winget's MSI/portable installs
 * only update PATH for NEW shells, so the terminal that just ran the installer
 * can't see it — probe winget's known install locations as a fallback.
 */
function cloudflaredExecutable() {
  if (commandExists('cloudflared')) return 'cloudflared';
  if (IS_WIN) {
    const candidates = [
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env.LOCALAPPDATA || os.homedir(), 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * One-line cloudflared install command for this OS. Kept identical to the
 * table on https://ari.software/docs/tunnel (the installer itself uses
 * Cloudflare's package repos, which are several lines — the docs page shows
 * both). Null when there is no one-liner, in which case the docs URL alone is
 * printed.
 */
function cloudflaredInstallHint() {
  if (process.platform === 'darwin') return 'brew install cloudflared';
  if (IS_WIN) return 'winget install -e --id Cloudflare.cloudflared';
  if (commandExists('apt-get')) {
    const arch = { x64: 'amd64', arm64: 'arm64', arm: 'armhf' }[process.arch];
    if (!arch) return null;
    return `curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb && sudo dpkg -i cloudflared.deb`;
  }
  if (commandExists('dnf')) {
    return 'sudo dnf config-manager --add-repo https://pkg.cloudflare.com/cloudflared.repo && sudo dnf install -y cloudflared';
  }
  if (commandExists('pacman')) return 'sudo pacman -S cloudflared';
  return null;
}

/**
 * True when `port` can be bound on `host`. Probes the SAME host the dev
 * server will bind, so the answer can't disagree with its own bind.
 */
function isPortFree(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/**
 * Whether the ARI database has at least one user. Reuses the doctor's pg
 * pattern. Returns { ok: true } or { ok: false, reason } — never throws.
 *
 * This is the real setup gate for --tunnel: with zero users, the public
 * bootstrap/download-env routes let anyone with the URL become the admin.
 */
async function databaseHasUsers() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) return { ok: false, reason: 'no DATABASE_URL configured' };
  let client;
  try {
    const pg = cjsRequire(path.join(ROOT, 'node_modules', 'pg'));
    client = new pg.Client({
      connectionString: dbUrl,
      ssl: sslConfigFor(dbUrl),
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    const table = await client.query(`SELECT to_regclass('public."user"') AS t`);
    if (!table.rows[0]?.t) return { ok: false, reason: 'the user table does not exist yet' };
    const count = await client.query('SELECT count(*)::int AS n FROM "user"');
    const n = count.rows[0]?.n ?? 0;
    return n > 0 ? { ok: true } : { ok: false, reason: 'no user account exists yet' };
  } catch (e) {
    return { ok: false, reason: 'could not query the database (' + (e?.message || e) + ')' };
  } finally {
    try { await client?.end(); } catch {}
  }
}

/** Feed complete lines from a stream to `onLine`, retaining partial chunks. */
function readLines(stream, onLine) {
  let rest = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    rest += chunk;
    let idx;
    while ((idx = rest.indexOf('\n')) !== -1) {
      onLine(rest.slice(0, idx).replace(/\r$/, ''));
      rest = rest.slice(idx + 1);
    }
  });
  stream.on('end', () => { if (rest) onLine(rest); });
}

/**
 * Spawn `cloudflared tunnel --url http://localhost:<port>` and resolve with
 * the public URL once cloudflared prints it. The child keeps running; both of
 * its pipes stay drained for its whole life (cloudflared logs continuously and
 * would block on a full pipe). `tail` holds the last log lines for error output.
 */
function startTunnel(exe, port, { verbose }) {
  // 127.0.0.1, not "localhost": cloudflared (Go) may resolve localhost to ::1
  // while the dev server is bound to IPv4 only, which surfaces as a Cloudflare
  // 502 with "dial tcp [::1]:<port>: connection refused". In tunnel mode the
  // dev server is bound to an IPv4 address (see launchDevServer), so the two
  // sides always agree.
  const args = ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'];
  if (process.env.ARI_TUNNEL_PROTOCOL) args.push('--protocol', process.env.ARI_TUNNEL_PROTOCOL);
  const child = spawn(exe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
    windowsHide: true,
  });
  const tail = [];

  const ready = new Promise((resolve, reject) => {
    let armed = false;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const onLine = (line) => {
      tail.push(line);
      if (tail.length > TUNNEL_LOG_TAIL_LINES) tail.shift();
      if (verbose) process.stdout.write(DIM + '  [tunnel] ' + line + RESET + '\n');
      if (settled) return;
      if (line.includes(TUNNEL_CREATED_MARKER)) { armed = true; return; }
      if (!armed) return;
      const match = TUNNEL_URL_LINE_RE.exec(line);
      if (match && match[2] !== 'api') finish(resolve, match[1]);
    };
    readLines(child.stdout, onLine);
    readLines(child.stderr, onLine);
    child.once('error', (err) => finish(reject, err));
    child.once('exit', (code, signal) => finish(reject, new Error(`cloudflared exited (${signal || code})`)));
    const timer = setTimeout(
      () => finish(reject, new Error(`no tunnel URL after ${TUNNEL_START_TIMEOUT_MS / 1000}s`)),
      TUNNEL_START_TIMEOUT_MS,
    );
  });

  return { child, ready, tail };
}

function startPgweb(log = console.log) {
  const pgwebExe = pgwebExecutable();
  if (!pgwebExe) {
    log('  ' + DIM + 'pgweb not installed — skip database UI' + RESET);
    if (process.platform === 'darwin') {
      log('  ' + DIM + 'Install with: brew install pgweb' + RESET);
    } else if (process.platform === 'win32') {
      log('  ' + DIM + 'Re-run the ARI installer to download pgweb.' + RESET);
    } else {
      log('  ' + DIM + 'Install pgweb from https://github.com/sosedoff/pgweb' + RESET);
    }
    return false;
  }

  if (isPgwebRunning()) {
    log('  ' + GREEN + '✔' + RESET + ' Database UI is already running ' + DIM + `http://localhost:${PGWEB_PORT}` + RESET);
    return true;
  }

  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    log('  ' + YELLOW + '⚠' + RESET + ' No DATABASE_URL found — skipping pgweb');
    return false;
  }

  const child = spawn(pgwebExe, [
    '--bind', 'localhost',
    '--listen', String(PGWEB_PORT),
    '--skip-open',
    '--url', dbUrl,
  ], {
    stdio: 'ignore',
    detached: true,
    cwd: ROOT,
  });

  child.unref();
  fs.mkdirSync(path.dirname(PGWEB_PID_FILE), { recursive: true });
  fs.writeFileSync(PGWEB_PID_FILE, String(child.pid));
  log('  ' + GREEN + '✔' + RESET + ' Database UI started ' + DIM + `http://localhost:${PGWEB_PORT}` + RESET);
  return true;
}

function stopPgweb(log = console.log) {
  if (!isPgwebRunning()) return false;
  const pid = fs.readFileSync(PGWEB_PID_FILE, 'utf8').trim();
  try {
    process.kill(Number(pid), 'SIGTERM');
    try { fs.unlinkSync(PGWEB_PID_FILE); } catch {}
    log('  ' + GREEN + '✔' + RESET + ' Database UI stopped');
    return true;
  } catch {
    try { fs.unlinkSync(PGWEB_PID_FILE); } catch {}
    return false;
  }
}

const UPSTREAM_REPO = 'ARIsoftware/ARI';
const UPSTREAM_URL = `https://github.com/${UPSTREAM_REPO}.git`;
const UPDATE_DOCS_URL = 'https://ari.software/docs/updating';

// Best-effort upstream check. Returns false on any failure so startup is never blocked or false-alarmed.
async function checkForUpdates() {
  if (run('git rev-parse --git-dir') === null) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`https://api.github.com/repos/${UPSTREAM_REPO}/commits/main`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ari-cli' },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = await res.json();
    const sha = data && data.sha;
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) return false;

    // cat-file -e returns nonzero (null) when the commit isn't in our local object DB → upstream is ahead.
    return run(`git cat-file -e ${sha}`) === null;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── Commands ───────────────────────────────────────────────────────────────

function ensurePostgresPath() {
  if (process.platform === 'darwin') {
    const brewPgBin = '/opt/homebrew/opt/postgresql@17/bin';
    const brewPgBinIntel = '/usr/local/opt/postgresql@17/bin';
    const pathEntries = (process.env.PATH || '').split(':');
    if (fs.existsSync(brewPgBin) && !pathEntries.includes(brewPgBin)) {
      process.env.PATH = `${brewPgBin}:${process.env.PATH}`;
    } else if (fs.existsSync(brewPgBinIntel) && !pathEntries.includes(brewPgBinIntel)) {
      process.env.PATH = `${brewPgBinIntel}:${process.env.PATH}`;
    }
    return;
  }
  if (IS_WIN) {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (!fs.existsSync(base)) return;
    let versions;
    try {
      versions = fs.readdirSync(base)
        .filter(d => /^\d+$/.test(d))
        .sort((a, b) => Number(b) - Number(a));
    } catch { return; }
    for (const v of versions) {
      const bin = path.join(base, v, 'bin');
      const entries = (process.env.PATH || '').split(';');
      if (fs.existsSync(bin) && !entries.includes(bin)) {
        process.env.PATH = bin + ';' + (process.env.PATH || '');
      }
    }
  }
}

// supabase.exe and pgweb.exe were dropped into %LOCALAPPDATA%\ARI\bin by the
// installer, but Windows PATH was never updated. Prepend the bin dir so bare
// `supabase`/`pgweb` calls in this process resolve. Mirrors install.js's
// ensureWindowsAriBinPath().
function ensureAriBinPath() {
  if (!IS_WIN) return;
  const binDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'ARI', 'bin');
  if (!fs.existsSync(binDir)) return;
  const entries = (process.env.PATH || '').split(';');
  if (!entries.includes(binDir)) {
    process.env.PATH = binDir + ';' + (process.env.PATH || '');
  }
}

function startDefault() {
  return start({
    quiet: !process.argv.includes('--verbose'),
    lan: process.argv.includes('--lan'),
    tunnel: process.argv.includes('--tunnel'),
  });
}

/**
 * Print a one-line unit-test summary from the static report generated by
 * `predev` (lib/generated/test-report.json). Shows the pass RATE only — never a
 * "failed" count — and never throws, so a missing/bad report can't break
 * startup. `log` is the caller's verbose-only logger (a no-op unless --verbose).
 */
function printUnitTestSummary(log) {
  try {
    const reportPath = path.join(ROOT, 'lib', 'generated', 'test-report.json');
    if (!fs.existsSync(reportPath)) {
      log('  ' + DIM + 'Unit Tests   report unavailable' + RESET);
      return;
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const total = Number(report.numTotalTests) || 0;
    const passed = Number(report.numPassedTests) || 0;
    if (total === 0) {
      log('  ' + DIM + 'Unit Tests   report unavailable' + RESET);
      return;
    }
    // Floor so a single failure can never round up to a green "100% passed".
    const pct = Math.floor((passed / total) * 100);
    if (pct === 100) {
      log('  ' + GREEN + '✔' + RESET + ' Unit Tests   ' + GREEN + '100% passed' + RESET);
    } else {
      log('  ' + DIM + '•' + RESET + ' Unit Tests   ' + pct + '% passed');
    }
  } catch {
    // Never let report reading break `./ari start`.
  }
}

function start(opts = {}) {
  const mode = getDbMode();
  const quiet = !!opts.quiet;
  const lan = !!opts.lan;
  const tunnel = !!opts.tunnel;
  const log = (...args) => { if (!quiet) console.log(...args); };
  let pgwebRunning = false;

  // Make sure ARI-bundled binaries (supabase.exe, pgweb.exe) are reachable
  // regardless of mode. Postgres path is mode-specific and stays inline below.
  ensureAriBinPath();

  // Spinner — only used in quiet mode
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIdx = 0;
  let spinnerTimer = null;
  let spinnerLabel = 'Starting ARI';
  function startSpinner(label) {
    if (!quiet) return;
    spinnerLabel = label || spinnerLabel;
    if (spinnerTimer) return; // already spinning — just relabel

    process.stdout.write('\x1B[?25l'); // hide cursor
    spinnerTimer = setInterval(() => {
      const frame = spinnerFrames[spinnerIdx++ % spinnerFrames.length];
      process.stdout.write(`\r  ${frame} ${spinnerLabel}   `);
    }, 80);
  }
  function stopSpinner(finalLine) {
    if (!spinnerTimer) return;
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    process.stdout.write('\r\x1B[2K'); // clear line
    process.stdout.write('\x1B[?25h'); // show cursor
    if (finalLine) process.stdout.write(finalLine + '\n');
  }

  // Hard stop: message always shows (console.log, not `log`), exit 1.
  const fail = (...lines) => {
    stopSpinner();
    console.log('');
    console.log('  ' + RED + '✘' + RESET + ' ' + lines[0]);
    for (const line of lines.slice(1)) console.log(line ? '    ' + DIM + line + RESET : '');
    console.log('');
    process.exit(1);
  };

  // --tunnel pre-flight: everything we can check without touching the network
  // or starting anything, so a misconfigured run fails in milliseconds.
  let tunnelExe = null;
  // With an explicit -p, Next does NOT fall back to another port when this one
  // is busy (next-dev.js: allowRetry only when the port came from the default),
  // so the tunnel's target and the dev server's port can never diverge.
  const tunnelPort = Number(process.env.PORT) || 3000;
  if (tunnel) {
    tunnelExe = cloudflaredExecutable();
    if (!tunnelExe) {
      const hint = cloudflaredInstallHint();
      fail(
        'cloudflared is not installed.',
        'To use Cloudflare Quick Tunnels, please install cloudflared using these instructions:',
        TUNNEL_DOCS_URL,
        ...(hint ? ['', hint] : []),
      );
    }
    const envLocal = path.join(ROOT, '.env.local');
    const setupIncomplete =
      !readEnvKey(envLocal, 'BETTER_AUTH_SECRET') ||
      // The wizard writes one-shot admin credentials and bootstrap strips
      // them only after the admin exists — still present means not signed in yet.
      !!readEnvKey(envLocal, 'ARI_FIRST_RUN_ADMIN_EMAIL') ||
      !!readEnvKey(envLocal, 'ARI_FIRST_RUN_ADMIN_PASSWORD');
    if (setupIncomplete) {
      fail(
        'Finish ARI setup locally first (open http://localhost:3000, complete the wizard and sign in once), then run ./ari start --tunnel.',
        'The setup wizard has no password in front of it and must never be reachable from the internet.',
      );
    }
  }

  // Start the spinner immediately so the user sees feedback during the
  // ~1s pnpm install that follows.
  if (quiet) startSpinner('Starting ARI');

  // Sync custom-module npmDependencies into package.json before pnpm install,
  // so a module dropped into modules-custom/ by hand (not via /modules) works
  // after a plain restart. Never aborts start — conflicts/errors are warnings.
  // Buffer the output rather than predicting whether there will be any: the
  // spinner has to stop before the first line is printed, and measuring what
  // was actually emitted can't drift from logReconcileResult's own rules.
  const depResult = reconcileCustomModuleDeps(ROOT);
  const depLines = [];
  logReconcileResult(depResult, (msg) => depLines.push(msg));
  if (depLines.length > 0) {
    stopSpinner();
    for (const line of depLines) console.log(line);
    if (quiet) startSpinner('Starting ARI');
  }

  // Keep node_modules in sync with package.json so new/updated modules don't
  // crash the dev server with "Module not found". --prefer-offline keeps this
  // working without internet when everything is already in the pnpm store. On
  // failure we warn and continue — Turbopack will surface any genuinely
  // missing dep clearly enough that blocking startup would be worse.
  if (!quiet) console.log('  Installing dependencies...');
  let installOk = true;
  try {
    // --no-frozen-lockfile because the reconciler above may have just rewritten
    // package.json: pnpm defaults frozen-lockfile to true whenever CI is set,
    // and would refuse the very install that picks up the new dep.
    const out = execSync('pnpm install --prefer-offline --no-frozen-lockfile', {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (!quiet) {
      const label = out.includes('Already up to date')
        ? 'Dependencies already up to date'
        : 'Dependencies installed';
      console.log('  ' + GREEN + '✔' + RESET + ' ' + label);
    }
  } catch (err) {
    installOk = false;
    stopSpinner();
    console.log('  ' + YELLOW + '⚠' + RESET + ' pnpm install failed — continuing with existing node_modules');
    // Print pnpm's own diagnosis rather than guessing. Guessing "probably
    // offline" is wrong whenever a module declared a package that does not
    // exist, and on later boots the reconciler is silent (nothing new to add),
    // so this is the only place the real cause can surface.
    const detail = String((err && (err.stderr || err.stdout)) || '').trim();
    const lines = detail.split('\n').filter((l) => l.trim()).slice(-4);
    if (lines.length > 0) {
      for (const line of lines) console.log('  ' + DIM + line.slice(0, 200) + RESET);
    } else {
      console.log('  ' + DIM + 'Likely offline or registry unreachable.' + RESET);
    }
    console.log('  ' + DIM + 'If the dev server hits "Module not found", run `pnpm install` manually.' + RESET);
    if (quiet) startSpinner('Starting ARI');
  }

  // Only advise committing after the install actually regenerated the lockfile.
  // package.json committed without a matching pnpm-lock.yaml fails CI's
  // `pnpm install --frozen-lockfile`.
  if (depResult.changed) {
    stopSpinner();
    if (installOk) {
      console.log('  ' + DIM + 'package.json updated — commit it with pnpm-lock.yaml to keep `./ari update` clean.' + RESET);
    } else {
      console.log('  ' + YELLOW + '⚠' + RESET + ' package.json gained module deps but pnpm-lock.yaml was not updated.');
      console.log('  ' + DIM + 'Run `pnpm install` before committing, or CI will fail on --frozen-lockfile.' + RESET);
    }
    if (quiet) startSpinner('Starting ARI');
  }

  fs.mkdirSync(path.join(ROOT, 'data', 'storage'), { recursive: true });

  const updateCheck = checkForUpdates();

  if (mode === 'supabaselocal') {
    // Check Docker — if unavailable, skip Supabase and start dev server only
    if (!isDockerRunning()) {
      log('  ' + YELLOW + '⚠' + RESET + ' Docker is not running — skipping local Supabase.');
      log('  ' + DIM + 'Configure your database connection in the setup wizard.' + RESET);
      log('');
    } else {
      // Start Supabase (idempotent)
      if (!isSupabaseRunning()) {
        log('  Starting Supabase...');
        try {
          execSync('supabase start', {
            stdio: quiet ? 'ignore' : 'inherit',
            cwd: ROOT,
          });
        } catch {
          stopSpinner();
          console.log('\n  ' + RED + '✘' + RESET + ' Failed to start Supabase.');
          process.exit(1);
        }
      } else {
        log('  ' + GREEN + '✔' + RESET + ' Supabase is already running');
      }

      // Regenerate env file
      const vars = parseSupabaseEnv();
      if (vars) {
        writeEnvFile(vars);
        log('  ' + GREEN + '✔' + RESET + ' .env.supabase.local updated');
      }
    }
  } else if (mode === 'postgres') {
    ensurePostgresPath();
    let pgReady = run(PG_IS_READY) !== null;
    if (!pgReady) {
      log('  ' + DIM + 'Starting PostgreSQL...' + RESET);
      if (process.platform === 'darwin') {
        run('brew services start postgresql@17');
      } else if (IS_WIN) {
        run('powershell -NoProfile -Command "Get-Service postgresql-x64-* | Start-Service"');
      } else {
        run('sudo systemctl start postgresql');
      }
      const sleepBuf = new Int32Array(new SharedArrayBuffer(4));
      const deadline = Date.now() + 5000;
      while (!pgReady && Date.now() < deadline) {
        Atomics.wait(sleepBuf, 0, 0, 250);
        pgReady = run(PG_IS_READY) !== null;
      }
    }
    if (pgReady) {
      log('  ' + GREEN + '✔' + RESET + ' PostgreSQL is running');
      pgwebRunning = startPgweb(log);
    } else {
      log('  ' + YELLOW + '⚠' + RESET + ' PostgreSQL could not be started.');
      if (process.platform === 'darwin') {
        log('  ' + DIM + 'Try manually: brew services start postgresql@17' + RESET);
      } else if (IS_WIN) {
        log('  ' + DIM + 'Try manually: net start postgresql-x64-17  (or open Services.msc)' + RESET);
      } else {
        log('  ' + DIM + 'Try manually: sudo systemctl start postgresql' + RESET);
      }
    }
  } else {
    // supabasecloud — no local DB to manage
    log('  ' + DIM + 'Cloud database mode — no local database to start' + RESET);
  }

  log('');

  // Children we own. `child` is the dev server, `tunnelChild` is cloudflared.
  // Both are nullable so the signal handlers work during every phase
  // (including the tunnel-URL wait, before the dev server exists).
  let child = null;
  let tunnelChild = null;
  let shuttingDown = false;

  const killTunnel = () => {
    if (tunnelChild && tunnelChild.exitCode === null && !tunnelChild.killed) {
      try { tunnelChild.kill(); } catch {}
    }
  };

  const cleanup = () => {
    shuttingDown = true;
    stopSpinner();
    killTunnel();
    if (child) child.kill();
    if (mode === 'postgres') stopPgweb(log);
    if (!quiet) {
      if (mode === 'supabaselocal') {
        console.log('\n  ' + DIM + 'Next.js stopped. Supabase containers are still running.' + RESET);
        console.log('  ' + DIM + 'Run ./ari stop to shut them down.' + RESET + '\n');
      } else {
        console.log('\n  ' + DIM + 'Next.js stopped.' + RESET + '\n');
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  // Last resort for every other exit path (hard stops, dev-server crash):
  // never leave a cloudflared process holding a public URL open.
  process.on('exit', killTunnel);

  // Start Next.js dev server — pipe stdout (and stderr in quiet mode) so we
  // can suppress. Use shell:true with the command as a single string so:
  //   - Windows resolves pnpm.cmd via cmd.exe (CreateProcess can't run .cmd
  //     files directly — that path returns EINVAL).
  //   - DEP0190 doesn't fire (the deprecation only triggers when args are
  //     passed alongside shell:true; an empty args array avoids it).
  // Default binds to localhost only — keeps the dev server off the LAN.
  // `--lan` keeps the original behavior (Next defaults to 0.0.0.0 and
  // auto-detects the LAN IP for its banner).
  // `--tunnel` pins the port (see tunnelPort), binds to the IPv4 loopback
  // literal instead of "localhost" (so cloudflared, which dials 127.0.0.1,
  // can never miss a server that Node happened to bind on ::1), and hands the
  // tunnel origin to the dev server via ARI_TUNNEL_ORIGIN — read at boot by
  // lib/auth.ts (Better Auth trusted origins) and next.config.mjs
  // (allowedDevOrigins). Next's own .env loading never overrides a var already
  // in process.env, so setting it on the child is enough and nothing touches
  // .env.local.
  function launchDevServer(tunnelUrl) {
    const host = lan ? '' : tunnel ? ' -H 127.0.0.1' : ' -H localhost';
    const devCmd = 'pnpm dev' + host + (tunnel ? ` -p ${tunnelPort}` : '');
    child = spawn(devCmd, [], {
      stdio: ['inherit', 'pipe', quiet ? 'pipe' : 'inherit'],
      cwd: ROOT,
      shell: true,
      env: { ...process.env, ...(tunnelUrl ? { ARI_TUNNEL_ORIGIN: tunnelUrl } : {}) },
    });

    // In quiet mode, buffer stderr instead of dropping it. If the child exits
    // non-zero we print what we captured so failures aren't silent.
    let stderrBuffer = '';
    const STDERR_BUFFER_LIMIT = 64 * 1024;
    if (quiet && child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (stderrBuffer.length >= STDERR_BUFFER_LIMIT) return;
        stderrBuffer += chunk.toString();
        if (stderrBuffer.length > STDERR_BUFFER_LIMIT) {
          stderrBuffer = stderrBuffer.slice(0, STDERR_BUFFER_LIMIT) + '\n[stderr truncated]';
        }
      });
    }

    // Next.js prints "Local:" before any route is compiled, so opening the
    // browser immediately shows a 2-3s white page while routes JIT-compile.
    // We GET the URL first (following redirects) to force compilation of the
    // landing route, then open the browser to a ready page.
    let browserScheduled = false;
    function openBrowser(url) {
      if (process.platform === 'darwin') run(`open ${url}`);
      else if (process.platform === 'linux') run(`xdg-open ${url}`);
      // 'start' is a cmd.exe builtin, not a binary — must invoke via cmd /c.
      // Empty quoted "" is the title argument, required when the URL is quoted.
      else if (IS_WIN) run(`cmd /c start "" "${url}"`);
    }
    async function waitForReady(url) {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(url, { redirect: 'follow' });
          if (res.status < 500) return;
        } catch {}
        await new Promise(r => setTimeout(r, 150));
      }
    }

    let networkUrl = null;
    child.stdout.on('data', (data) => {
      let text = data.toString();
      // Without --lan, Next still prints a "Network:" line that just echoes
      // the loopback hostname — strip it to avoid the duplicate.
      if (!lan) text = text.replace(/^.*Network:.*\r?\n?/m, '');

      // Capture Next's auto-detected LAN URL so we can show it in quiet mode.
      if (lan && !networkUrl) {
        const netMatch = text.match(/Network:\s+(http:\/\/[\w.-]+:\d+)/);
        if (netMatch && !netMatch[1].includes('localhost')) networkUrl = netMatch[1];
      }

      if (!browserScheduled) {
        // With -H 127.0.0.1 (tunnel mode) Next prints the literal; show and
        // open the familiar localhost form either way.
        const match = text.match(/Local:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
        if (match) {
          browserScheduled = true;
          const url = `http://localhost:${match[1]}`;
          // Probe the literal the server is bound to in tunnel mode: on Node
          // without autoSelectFamily, fetch('http://localhost') may try ::1
          // only and spin for the whole readiness deadline.
          const probeUrl = tunnel ? `http://127.0.0.1:${match[1]}` : url;
          // Defensive: -p makes this impossible, but a tunnel must never be
          // left pointing at a port the dev server isn't on.
          if (tunnelUrl && Number(match[1]) !== tunnelPort) {
            child.kill();
            fail(`Dev server started on ${url} but the tunnel targets port ${tunnelPort}.`);
          }
          waitForReady(probeUrl).then(async () => {
            openBrowser(url);
            const updateAvailable = await updateCheck;
            if (quiet) {
              stopSpinner(GREEN + '✔' + RESET + ' ARI is running');
              process.stdout.write(DIM + '- Local:         ' + RESET + url + '\n');
              if (networkUrl) {
                process.stdout.write(DIM + '- Network:       ' + RESET + networkUrl + '\n');
              }
            }
            if (tunnelUrl) {
              process.stdout.write(DIM + '- Tunnel:        ' + RESET + tunnelUrl + '\n');
              process.stdout.write(DIM + "  Anyone with this URL can reach ARI's sign-in page. It is temporary and changes every restart." + RESET + '\n');
            }
            if (pgwebRunning) {
              process.stdout.write(DIM + '- Database UI:   ' + RESET + `http://localhost:${PGWEB_PORT}` + '\n');
            }
            if (updateAvailable) {
              const line = '  ↑ ARI update available  ' + DIM + UPDATE_DOCS_URL + RESET + '\n';
              process.stdout.write(quiet ? line : '\n' + line + '\n');
            }
            // Verbose-only: surface the last unit-test run's pass rate. `log` is a
            // no-op in quiet mode, so this only shows under `./ari start --verbose`.
            printUnitTestSummary(log);
            if (quiet) {
              process.stdout.write(DIM + 'Press Ctrl+C to stop ARI.' + RESET + '\n');
            }
          });
        }
      }

      if (!quiet) process.stdout.write(text);
      // In quiet mode, all child stdout is dropped.
    });

    child.on('exit', (code) => {
      killTunnel();
      if (code && code !== 0 && stderrBuffer.trim()) {
        process.stderr.write('\n  ' + RED + '✘' + RESET + ' Dev server failed. stderr:\n');
        process.stderr.write(stderrBuffer);
        process.stderr.write('\n');
      }
      process.exit(code || 0);
    });
  }

  if (!tunnel) {
    launchDevServer(null);
    return;
  }

  // --tunnel: the public URL is only known once cloudflared reports it, and
  // the dev server reads ARI_TUNNEL_ORIGIN at boot — so the tunnel starts
  // first and the dev server second. Both remaining gates run before anything
  // is exposed. The returned promise never resolves on purpose: the dispatcher
  // exits the process when a command's promise resolves, and this process
  // lives as long as its children do.
  (async () => {
    // Probe the exact host the dev server will bind in tunnel mode.
    if (!(await isPortFree(tunnelPort, lan ? '0.0.0.0' : '127.0.0.1'))) {
      fail(
        `Port ${tunnelPort} is already in use. --tunnel needs a fixed port; stop the other process or set PORT=${tunnelPort + 1}.`,
      );
    }
    const users = await databaseHasUsers();
    if (!users.ok) {
      fail(
        'Finish ARI setup locally first (open http://localhost:3000, complete the wizard and sign in once), then run ./ari start --tunnel.',
        'Reason: ' + users.reason + '.',
        'With no admin account, the public setup routes would let anyone with the URL claim your ARI.',
      );
    }

    if (quiet) startSpinner('Starting tunnel');
    else log('  ' + DIM + 'Starting Cloudflare tunnel...' + RESET);
    const started = startTunnel(tunnelExe, tunnelPort, { verbose: !quiet });
    tunnelChild = started.child;
    let tunnelUrl;
    try {
      tunnelUrl = await started.ready;
    } catch (err) {
      killTunnel();
      const tailLines = started.tail.slice(-8);
      fail(
        `Could not start the Cloudflare tunnel (${err?.message || err}).`,
        'Check your internet connection / firewall — cloudflared uses UDP 7844 and falls back to TCP 443.',
        'Retry with: ARI_TUNNEL_PROTOCOL=http2 ./ari start --tunnel',
        ...(tailLines.length ? ['', 'Last cloudflared output:', ...tailLines] : []),
      );
    }
    log('  ' + GREEN + '✔' + RESET + ' Tunnel ready ' + DIM + tunnelUrl + RESET);
    if (quiet) startSpinner('Starting ARI');

    tunnelChild.on('exit', (code, signal) => {
      // Ctrl+C reaches the whole process group / console, so cloudflared often
      // dies before our own handler runs — that is not a disconnect.
      if (shuttingDown || signal === 'SIGINT' || signal === 'SIGTERM') return;
      process.stdout.write(
        '\n  ' + YELLOW + '⚠' + RESET + ' Cloudflare tunnel disconnected — the public URL no longer works.\n' +
        '    ' + DIM + 'The local URL still works. Restart ./ari start --tunnel for a new URL.' + RESET + '\n',
      );
    });

    launchDevServer(tunnelUrl);
  })().catch((err) => {
    killTunnel();
    fail('Unexpected error while starting the tunnel: ' + (err?.stack || err));
  });

  return new Promise(() => {});
}

async function stop() {
  const mode = getDbMode();
  ensureAriBinPath();

  if (mode === 'supabaselocal') {
    console.log('  Stopping Supabase...');
    try {
      execSync('supabase stop', { stdio: 'inherit', cwd: ROOT });
      console.log('  ' + GREEN + '✔' + RESET + ' Supabase stopped');
    } catch {
      console.log('  ' + RED + '✘' + RESET + ' Failed to stop Supabase');
      process.exit(1);
    }
  } else if (mode === 'postgres') {
    ensurePostgresPath();
    stopPgweb();
    const pgReady = run(PG_IS_READY) !== null;
    if (pgReady) {
      const answer = await ask('  Your PostgreSQL database is running. Stop it now? (Y/n) ');
      if (!answer || answer.toLowerCase() === 'y') {
        if (process.platform === 'darwin') {
          run('brew services stop postgresql@17');
        } else if (IS_WIN) {
          run('powershell -NoProfile -Command "Get-Service postgresql-x64-* | Stop-Service"');
        } else {
          run('sudo systemctl stop postgresql');
        }
        console.log('  ' + GREEN + '✔' + RESET + ' PostgreSQL stopped');
      } else {
        console.log('  ' + DIM + 'PostgreSQL left running.' + RESET);
      }
    } else {
      console.log('  ' + DIM + 'PostgreSQL is not running.' + RESET);
    }
  } else {
    console.log('  ' + DIM + 'Cloud mode — no local services to stop.' + RESET);
  }
}

function status() {
  const mode = getDbMode();
  ensureAriBinPath();
  console.log('  Database mode: ' + mode);
  console.log('');

  if (mode === 'supabaselocal') {
    try {
      execSync('supabase status', { stdio: 'inherit', cwd: ROOT });
    } catch {
      console.log('  Supabase is not running.');
    }
    console.log('');
    if (fs.existsSync(ENV_FILE)) {
      console.log('  ' + GREEN + '✔' + RESET + ' .env.supabase.local exists');
    } else {
      console.log('  ' + YELLOW + '⚠' + RESET + ' .env.supabase.local not found');
    }
  } else if (mode === 'postgres') {
    ensurePostgresPath();
    const pgReady = run(PG_IS_READY) !== null;
    console.log('  PostgreSQL: ' + (pgReady ? GREEN + '✔ running' : RED + '✘ not reachable') + RESET);
    const pgwebUp = isPgwebRunning();
    console.log('  pgweb:      ' + (pgwebUp ? GREEN + '✔ running ' + DIM + 'http://localhost:' + PGWEB_PORT + RESET : DIM + '✘ not running' + RESET));
  } else {
    console.log('  ' + DIM + 'Cloud mode — database hosted on Supabase.com' + RESET);
  }
}

async function update() {
  console.log('');
  console.log('  ' + YELLOW + 'Checking for ARI updates...' + RESET);
  console.log('');

  // Ensure upstream remote exists
  const remotes = run('git remote') || '';
  if (!remotes.split('\n').includes('upstream')) {
    console.log('  Adding upstream remote...');
    const addResult = run(`git remote add upstream ${UPSTREAM_URL}`);
    if (addResult === null) {
      console.log('  ' + RED + '✘' + RESET + ' Failed to add upstream remote');
      process.exit(1);
    }
    console.log('  ' + GREEN + '✔' + RESET + ' Upstream remote added');
  } else {
    console.log('  ' + GREEN + '✔' + RESET + ' Upstream remote exists');
  }

  // Warn about uncommitted changes
  const statusOut = run('git status --porcelain') || '';
  if (statusOut.length > 0) {
    const changedCount = statusOut.split('\n').filter(l => l.trim()).length;
    console.log('  ' + YELLOW + '⚠' + RESET + ` You have ${changedCount} uncommitted change(s).`);
    console.log('  ' + DIM + 'Consider committing or stashing before updating.' + RESET);
    const answer = await ask('  Continue anyway? (y/N) ');
    if (!answer || answer.toLowerCase() !== 'y') {
      console.log('  ' + DIM + 'Update cancelled.' + RESET);
      console.log('');
      process.exit(0);
    }
    console.log('');
  }

  // Fetch upstream
  console.log('  Fetching upstream...');
  const fetchResult = run('git fetch upstream');
  if (fetchResult === null) {
    console.log('  ' + RED + '✘' + RESET + ' Failed to fetch upstream. Check your network connection.');
    process.exit(1);
  }

  // Show what's changed
  const newCommits = run('git log HEAD..upstream/main --oneline') || '';
  if (!newCommits.trim()) {
    console.log('  ' + GREEN + '✔' + RESET + ' Already up to date!');
    console.log('');
    process.exit(0);
  }

  const commitCount = newCommits.split('\n').filter(l => l.trim()).length;
  const diffStat = run('git diff --stat HEAD..upstream/main') || '';

  console.log('');
  console.log('  ' + YELLOW + `${commitCount} new commit(s) available:` + RESET);
  console.log('');
  for (const line of newCommits.split('\n').filter(l => l.trim())) {
    console.log('    ' + DIM + line + RESET);
  }
  console.log('');
  console.log('  ' + DIM + diffStat + RESET);
  console.log('');

  // Ask for confirmation
  const answer = await ask('  Merge these updates? (Y/n) ');
  if (answer && answer.toLowerCase() === 'n') {
    console.log('  ' + DIM + 'Update cancelled.' + RESET);
    console.log('');
    process.exit(0);
  }

  // Merge upstream
  console.log('');
  console.log('  Merging updates...');
  try {
    execSync('git merge upstream/main --no-edit', { stdio: 'inherit', cwd: ROOT });
  } catch {
    console.log('');
    console.log('  ' + RED + '✘' + RESET + ' Merge failed — you likely have conflicting local changes.');
    console.log('  ' + DIM + 'Resolve conflicts, then run: git add <file> && git commit' + RESET);
    console.log('  ' + DIM + 'Tip: keep customizations in modules-custom/ and themes-custom/ to avoid conflicts.' + RESET);
    process.exit(1);
  }
  console.log('  ' + GREEN + '✔' + RESET + ' Code updated');

  // Reconcile custom-module npm deps before pnpm install so the lockfile and
  // node_modules pick up anything the merge dropped. Safe-fail: any
  // reconciler error is surfaced but does not abort the update.
  console.log('  Reconciling custom module dependencies...');
  logReconcileResult(reconcileCustomModuleDeps(ROOT), (msg) => console.log(msg));

  // Install dependencies. --no-frozen-lockfile for the same reason as in
  // start(): the reconcile above can leave package.json ahead of the lockfile,
  // and pnpm freezes by default when CI is set.
  console.log('  Installing dependencies...');
  try {
    execSync('pnpm install --no-frozen-lockfile', { stdio: 'inherit', cwd: ROOT });
  } catch {
    console.log('  ' + RED + '✘' + RESET + ' pnpm install failed');
    process.exit(1);
  }
  console.log('  ' + GREEN + '✔' + RESET + ' Dependencies installed');

  console.log('');
  console.log('  ' + GREEN + 'Update complete!' + RESET + ' Run ' + DIM + './ari start' + RESET + ' to launch.');
  console.log('');
}

// ── Fix-deps ───────────────────────────────────────────────────────────────

function fixDeps() {
  console.log('');
  console.log('  ' + YELLOW + 'Reconciling custom module dependencies...' + RESET);
  console.log('');

  const result = reconcileCustomModuleDeps(ROOT);
  logReconcileResult(result, (msg) => console.log(msg));

  if (!result.ok) {
    process.exit(1);
  }
  if (result.changed) {
    console.log('  Installing dependencies...');
    try {
      // --no-frozen-lockfile: we just rewrote package.json, and pnpm freezes by
      // default when CI is set, which would reject this install.
      execSync('pnpm install --no-frozen-lockfile', { stdio: 'inherit', cwd: ROOT });
      console.log('  ' + GREEN + '✔' + RESET + ' Dependencies installed');
    } catch {
      console.log('  ' + RED + '✘' + RESET + ' pnpm install failed');
      process.exit(1);
    }
  } else if (result.conflicts.length === 0 && result.invalid.length === 0) {
    console.log('  ' + GREEN + '✔' + RESET + ' Already in sync. Nothing to do.');
  }
  // else: conflicts/invalid were logged by logReconcileResult; nothing to install.

  console.log('');
}

// ── Doctor ─────────────────────────────────────────────────────────────────

// Mask the password segment in postgresql:// URLs so it's safe to print.
function redactDbUrl(url) {
  if (!url) return url;
  return url.replace(/^(postgresql:\/\/[^:]+):[^@]+@/, '$1:***@');
}

// Parse `tsc --noEmit` output into { core: N, modules: { fitness: N, ... } }.
// Lines look like: modules-custom/fitness/app/chat/page.tsx(267,41): error TS2554: ...
// The modules-(core|custom) directory names mirror MODULE_DIRECTORIES in
// lib/modules/scanner.ts and scripts/generate-module-registry.js — keep in sync.
function parseTscErrors(output) {
  const counts = { core: 0, modules: {} };
  for (const line of String(output || '').split('\n')) {
    const m = line.match(/^(\S+?)\(\d+,\d+\): error TS/);
    if (!m) continue;
    const mod = m[1].match(/^modules-(?:core|custom)\/([^/]+)\//);
    if (mod) counts.modules[mod[1]] = (counts.modules[mod[1]] || 0) + 1;
    else counts.core++;
  }
  return counts;
}

async function doctor() {
  ensurePostgresPath();
  ensureAriBinPath();

  console.log('');
  console.log('  ARI Doctor — diagnostic report');
  console.log('  ' + DIM + 'Copy this output if you need help.' + RESET);
  console.log('');

  const lines = [];
  const ok   = (label, val) => lines.push('  ' + GREEN  + '✔' + RESET + ' ' + label.padEnd(28) + ' ' + (val || ''));
  const warn = (label, val) => lines.push('  ' + YELLOW + '⚠' + RESET + ' ' + label.padEnd(28) + ' ' + (val || ''));
  const fail = (label, val) => lines.push('  ' + RED    + '✘' + RESET + ' ' + label.padEnd(28) + ' ' + (val || ''));

  lines.push('  ' + DIM + 'Platform: ' + process.platform + ' ' + os.release() + RESET);

  let ariVersion = '';
  try {
    ariVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '';
  } catch {}
  const ariCommit = run('git rev-parse --short HEAD') || '';
  const ariVersionStr = ariVersion + (ariCommit ? '+' + ariCommit : '');
  ariVersionStr ? ok('ARI version', ariVersionStr) : warn('ARI version', 'unknown');

  const nodeV = run('node --version');
  if (nodeV) {
    const major = Number(nodeV.replace(/^v/, '').split('.')[0]);
    if (major >= 18) ok('Node', nodeV);
    else fail('Node', nodeV + ' (need >= 18)');
  } else fail('Node', 'not found');

  const pnpmV = run('pnpm --version');
  pnpmV ? ok('pnpm', 'v' + pnpmV) : fail('pnpm', 'not found');

  const gitV = run('git --version');
  gitV ? ok('Git', gitV) : warn('Git', 'not found');

  // Postgres service / connectivity
  if (IS_WIN) {
    const svc = run('powershell -NoProfile -Command "Get-Service postgresql-x64-* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status"') || '';
    if (svc.includes('Running')) ok('Postgres service', 'Running');
    else if (svc.trim()) warn('Postgres service', svc.trim());
    else warn('Postgres service', 'not installed');
  }
  const pgReady = run(PG_IS_READY) !== null;
  pgReady ? ok('Postgres reachable', PG_IS_READY) : fail('Postgres reachable', PG_IS_READY + ' returned non-zero');

  // .env.local presence + required keys
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    fail('.env.local', 'missing — run the installer or /welcome wizard');
  } else {
    ok('.env.local', envPath);
    if (fs.existsSync(ENV_FILE)) ok('.env.supabase.local', ENV_FILE);

    const content = fs.readFileSync(envPath, 'utf8');
    const readKey = (text, key) => {
      const m = text.match(new RegExp('^' + key + '=(.*)$', 'm'));
      return m ? m[1].trim() : '';
    };

    // ARI_DB_MODE — fall back to getDbMode() inference for installs that predate this var.
    const mode = readKey(content, 'ARI_DB_MODE') || getDbMode();
    mode ? ok('  ARI_DB_MODE', mode) : fail('  ARI_DB_MODE', 'missing or empty');

    // DATABASE_URL — getDatabaseUrl() layers .env.local + .env.supabase.local like next.config.mjs.
    const dbVal = getDatabaseUrl();
    dbVal ? ok('  DATABASE_URL', redactDbUrl(dbVal)) : fail('  DATABASE_URL', 'missing or empty');

    for (const key of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_APP_URL']) {
      const val = readKey(content, key);
      if (!val) fail('  ' + key, 'missing or empty');
      else if (key === 'BETTER_AUTH_SECRET') ok('  ' + key, '(set, ' + val.length + ' chars)');
      else ok('  ' + key, val);
    }

    // AI Providers — informational only. Keys may instead be saved per-user in
    // the DB (module_settings 'integrations'), which this offline check can't
    // read, so the count reflects .env.local alone. Source of truth for the
    // key list: lib/ai-providers.ts (keep in sync if providers are added).
    const aiKeyEnv = [
      'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GEMINI_API_KEY',
      'XAI_API_KEY', 'MISTRAL_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'PERPLEXITY_API_KEY',
    ];
    const aiSet = aiKeyEnv.filter((k) => readKey(content, k));
    const ollamaUrl = readKey(content, 'OLLAMA_BASE_URL');
    if (aiSet.length === 0 && !ollamaUrl) {
      warn('AI Providers', 'none in .env.local (may be set in app settings)');
    } else {
      ok('AI Providers', aiSet.length + ' key' + (aiSet.length === 1 ? '' : 's') + ' in .env.local' + (ollamaUrl ? ' + Ollama URL' : ''));
      for (const k of aiSet) ok('  ' + k, '(set)');
      if (ollamaUrl) ok('  OLLAMA_BASE_URL', ollamaUrl);
    }
  }

  // Live DB connectivity
  const dbUrl = getDatabaseUrl();
  if (dbUrl) {
    try {
      const pg = cjsRequire(path.join(ROOT, 'node_modules', 'pg'));
      const client = new pg.Client({ connectionString: dbUrl, ssl: sslConfigFor(dbUrl), connectionTimeoutMillis: 3000 });
      await client.connect();
      const r = await client.query('SELECT 1 AS ok');
      await client.end();
      r.rows[0].ok === 1 ? ok('DB connect', 'SELECT 1 succeeded') : fail('DB connect', 'unexpected result');
    } catch (e) {
      fail('DB connect', (e.message || String(e)).split('\n')[0]);
    }
  } else {
    warn('DB connect', 'no DATABASE_URL to test against');
  }

  // pgweb
  const pgwebExe = pgwebExecutable();
  pgwebExe ? ok('pgweb', pgwebExe) : warn('pgweb', 'not installed (DB UI unavailable)');

  // cloudflared (optional — powers `./ari start --tunnel`)
  const cfExe = cloudflaredExecutable();
  const cfV = cfExe ? run(`"${cfExe}" --version`) : null;
  cfV
    ? ok('cloudflared', 'v' + (cfV.match(/(\d{4}\.\d+\.\d+)/) || [, '?'])[1])
    : warn('cloudflared', 'not installed (./ari start --tunnel unavailable)');

  // Mode-specific
  const mode = getDbMode();
  if (mode === 'supabaselocal') {
    const supaV = run('supabase --version');
    supaV ? ok('supabase CLI', 'v' + (supaV.match(/(\d+\.\d+\.\d+)/) || [, '?'])[1]) : fail('supabase CLI', 'not found on PATH');
    isDockerRunning() ? ok('Docker', 'running') : fail('Docker', 'not running');
  }

  // TypeScript — type errors don't affect `ari start`, but they block
  // production builds/deploys since the typecheck gate landed.
  const tscBin = path.join(ROOT, 'node_modules', '.bin', IS_WIN ? 'tsc.cmd' : 'tsc');
  if (!fs.existsSync(tscBin)) {
    warn('TypeScript', 'skipped — run pnpm install first');
  } else {
    process.stdout.write('  ' + DIM + 'Running TypeScript check (can take ~a minute)...' + RESET + '\r');
    // Regenerate the module registry first (same as predev / instrumentation.ts),
    // so a fresh clone that never ran `pnpm dev` doesn't report false errors
    // about missing generated files (lib/generated/*, schema barrel).
    const regen = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'generate-module-registry.js')], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    const tsc = regen.status === 0
      ? spawnSync(tscBin, ['--noEmit'], { cwd: ROOT, encoding: 'utf8', timeout: 300000 })
      : null;
    process.stdout.write(' '.repeat(60) + '\r'); // clear the progress line
    if (!tsc) {
      warn('TypeScript', 'skipped — module registry generation failed');
    } else if (tsc.status === 0) {
      ok('TypeScript', 'no type errors');
    } else {
      const counts = parseTscErrors((tsc.stdout || '') + (tsc.stderr || ''));
      for (const [id, n] of Object.entries(counts.modules)) {
        fail('Module "' + id + '"', n + ' type error' + (n === 1 ? '' : 's') + ' — will block deploys (run: pnpm typecheck)');
      }
      if (counts.core > 0) {
        fail('TypeScript (core)', counts.core + ' error' + (counts.core === 1 ? '' : 's') + ' — run pnpm typecheck for details');
      }
      if (counts.core === 0 && Object.keys(counts.modules).length === 0) {
        warn('TypeScript', 'tsc failed but no errors parsed — run pnpm typecheck manually');
      }
    }
  }

  console.log(lines.join('\n'));
  console.log('');
  console.log('  ' + DIM + 'Mode: ' + mode + RESET);
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const commands = { start: startDefault, startquiet: startDefault, stop, status, update, 'fix-deps': fixDeps, doctor };

if (!cmd || !commands[cmd]) {
  console.log('');
  console.log('  Usage: ./ari <command>');
  console.log('');
  console.log('  Commands:');
  console.log('    start              Start database + dev server (binds to localhost only)');
  console.log('    start --lan        Also accept connections from other devices on your LAN');
  console.log('    start --tunnel     Also open a temporary public URL (Cloudflare Quick Tunnel; needs cloudflared)');
  console.log('    start --verbose    Same as start, but shows full server logs');
  console.log('    startquiet         Alias for start (kept for backwards compatibility)');
  console.log('    stop               Stop database services');
  console.log('    status             Show database status');
  console.log('    update             Pull latest ARI updates + install dependencies');
  console.log('    fix-deps           Re-sync custom-module npm deps into package.json');
  console.log('    doctor             Print diagnostic report (paste this when asking for help)');
  console.log('');
  process.exit(cmd ? 1 : 0);
}

// stop() is async (uses readline), so we need to handle the promise
const result = commands[cmd]();
if (result && typeof result.then === 'function') {
  result.then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
