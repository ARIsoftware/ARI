#!/usr/bin/env node

/**
 * ARI Installer — Main Interactive Installer
 *
 * Zero-dependency Node.js script that installs remaining tools (Git, pnpm,
 * Vercel CLI, Supabase CLI), clones the ARI repo, runs pnpm install, and
 * verifies the full setup.
 *
 * Called by install.sh after Homebrew + Node.js are bootstrapped.
 */

const { execSync, exec: execCb, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARI_BRANCH = process.env.ARI_BRANCH || 'main';
const readline = require('readline');
const os = require('os');
const crypto = require('crypto');

// Local-dev Postgres password used on Windows. EDB's installer leaves the
// postgres superuser with no usable password unless we pass one via --override
// at install time. Generated once per run so multiple winget calls and the
// later setupLocalPostgres() step share the same value.
const POSTGRES_PASSWORD = process.env.ARI_POSTGRES_PASSWORD
  || crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '');

// ── ANSI Colors & Symbols ───────────────────────────────────────────────────

const BLUE = '\x1b[1;34m';
const DIM_BLUE = '\x1b[34m';
const GREEN = '\x1b[1;32m';
const YELLOW = '\x1b[1;33m';
const RED = '\x1b[1;31m';
const CYAN = '\x1b[1;36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

const SYM_CHECK = `${GREEN}✔${RESET}`;
const SYM_CROSS = `${RED}✘${RESET}`;
const SYM_ARROW = `${DIM}○${RESET}`;
const SYM_DASH = `${DIM}–${RESET}`;
const SYM_WARN = `${YELLOW}⚠${RESET}`;

// ── Utility Functions ───────────────────────────────────────────────────────

function blue(s) { return `${BLUE}${s}${RESET}`; }
function dim(s) { return `${DIM}${s}${RESET}`; }
function green(s) { return `${GREEN}${s}${RESET}`; }
function red(s) { return `${RED}${s}${RESET}`; }
function yellow(s) { return `${YELLOW}${s}${RESET}`; }
function bold(s) { return `${BOLD}${s}${RESET}`; }

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch {
    return null;
  }
}

function runAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    execCb(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, ...opts }, (error, stdout, stderr) => {
      if (error) {
        // Some installers (winget, EDB) exit non-zero with empty stderr but
        // useful info in stdout — and the exit code itself is often the real
        // signal. Surface all three so failures are debuggable.
        const parts = [];
        if (typeof error.code !== 'undefined') parts.push(`Exit code: ${error.code}`);
        const trimmedStderr = (stderr || '').trim();
        const trimmedStdout = (stdout || '').trim();
        if (trimmedStderr) parts.push(`stderr: ${trimmedStderr}`);
        if (trimmedStdout) parts.push(`stdout: ${trimmedStdout}`);
        if (parts.length === 0) parts.push(error.message);
        reject(new Error(parts.join('\n')));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// ── Windows PATH helpers ────────────────────────────────────────────────────
// Node captures process.env.PATH at startup. After `winget install <tool>`,
// the new binary is on the system PATH but NOT in this process's PATH. These
// helpers re-read PATH from the registry / known install dirs so subsequent
// detect() calls actually see the just-installed tools.

function refreshWindowsPath() {
  if (process.platform !== 'win32') return;
  try {
    const cmd =
      'powershell -NoProfile -Command "' +
      "[System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + " +
      "[System.Environment]::GetEnvironmentVariable('Path','User')\"";
    const merged = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (merged) process.env.PATH = merged;
  } catch { /* best-effort */ }
}

const WIN_POSTGRES_BASE = 'C:\\Program Files\\PostgreSQL';

// Versions are stable for the duration of an install run — winget can't add a
// new EDB Postgres mid-process. Cache the readdir result.
let _winPostgresVersionsCache = null;
function findWindowsPostgresVersions() {
  if (process.platform !== 'win32') return [];
  if (_winPostgresVersionsCache) return _winPostgresVersionsCache;
  if (!fs.existsSync(WIN_POSTGRES_BASE)) return [];
  try {
    _winPostgresVersionsCache = fs.readdirSync(WIN_POSTGRES_BASE)
      .filter(d => /^\d+$/.test(d))
      .sort((a, b) => Number(b) - Number(a));
    return _winPostgresVersionsCache;
  } catch {
    return [];
  }
}

function ensureWindowsPostgresPath() {
  if (process.platform !== 'win32') return;
  for (const v of findWindowsPostgresVersions()) {
    const bin = path.join(WIN_POSTGRES_BASE, v, 'bin');
    const entries = (process.env.PATH || '').split(';');
    if (fs.existsSync(bin) && !entries.includes(bin)) {
      process.env.PATH = bin + ';' + (process.env.PATH || '');
    }
  }
}

// Where Windows-only binaries we download (pgweb, supabase) live. Independent
// of the ARI clone location since installTools() runs before cloneAndSetup().
function getWindowsAriBinDir() {
  return path.join(process.env.LOCALAPPDATA || os.homedir(), 'ARI', 'bin');
}

// Map Node's process.arch to the convention used in GitHub release asset names.
function getWindowsReleaseArch() {
  return process.arch === 'arm64' ? 'arm64' : 'amd64';
}

// Find a release asset by arch, falling back to amd64 if no arch-specific one
// is published. amd64 binaries run on Windows ARM64 via emulation.
function findWindowsArchAsset(release, namePattern) {
  const arch = getWindowsReleaseArch();
  const archPattern = new RegExp(namePattern.replace('{arch}', arch), 'i');
  const direct = release.assets && release.assets.find(a => archPattern.test(a.name));
  if (direct) return direct;
  if (arch !== 'amd64') {
    const amdPattern = new RegExp(namePattern.replace('{arch}', 'amd64'), 'i');
    return release.assets && release.assets.find(a => amdPattern.test(a.name));
  }
  return null;
}

function httpGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    https.get(url, { headers: { 'User-Agent': 'ari-installer', ...headers } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGetJson(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GET ${url} returned ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Invalid JSON from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function httpDownload(url, destPath) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    https.get(url, { headers: { 'User-Agent': 'ari-installer' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpDownload(res.headers.location, destPath));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GET ${url} returned ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', (err) => { try { fs.unlinkSync(destPath); } catch {} reject(err); });
    }).on('error', reject);
  });
}

async function installPgwebWindows() {
  const binDir = getWindowsAriBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  const release = await httpGetJson('https://api.github.com/repos/sosedoff/pgweb/releases/latest');
  const asset = findWindowsArchAsset(release, '^pgweb_windows_{arch}\\.zip$');
  if (!asset) throw new Error('pgweb release has no Windows zip asset for this architecture');

  const zipPath = path.join(os.tmpdir(), `pgweb-${process.pid}.zip`);
  await httpDownload(asset.browser_download_url, zipPath);

  // Expand-Archive ships with PowerShell 5.1+ (Win10+).
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${binDir}'"`,
    { stdio: 'pipe' }
  );

  // The pgweb zip contains a single file named like 'pgweb_windows_amd64'
  // (no .exe extension). Some GoReleaser builds nest under a folder of the
  // same name. Find anything pgweb-shaped and rename to pgweb.exe so cli.js
  // can spawn it without guessing.
  const flat = path.join(binDir, 'pgweb.exe');
  if (!fs.existsSync(flat)) {
    const found = findFileMatching(binDir, /^pgweb[\w.-]*$/i);
    if (found) {
      fs.renameSync(found, flat);
      const parent = path.dirname(found);
      if (parent !== binDir) {
        try { fs.rmdirSync(parent); } catch {}
      }
    }
  }

  try { fs.unlinkSync(zipPath); } catch {}

  if (!fs.existsSync(flat)) {
    throw new Error(`pgweb binary not found after extraction in ${binDir}`);
  }
  return flat;
}

// Walk a directory tree (one level deep is enough for our archives) and
// return the first file whose name matches `pattern`. Used by the Windows
// release extractors to locate binaries that may or may not be nested and
// may or may not have a .exe extension.
function findFileMatching(dir, pattern) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && pattern.test(entry.name)) return full;
    if (entry.isDirectory()) {
      try {
        for (const nested of fs.readdirSync(full, { withFileTypes: true })) {
          if (nested.isFile() && pattern.test(nested.name)) {
            return path.join(full, nested.name);
          }
        }
      } catch { /* unreadable subdir, skip */ }
    }
  }
  return null;
}

async function installSupabaseCliWindows() {
  const binDir = getWindowsAriBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  const release = await httpGetJson('https://api.github.com/repos/supabase/cli/releases/latest');
  // Asset name pattern: supabase_<version>_windows_<arch>.tar.gz
  // (Supabase publishes only tar.gz for Windows, not zip.)
  const asset = findWindowsArchAsset(release, '^supabase_.*windows_{arch}\\.tar\\.gz$');
  if (!asset) throw new Error('supabase/cli release has no Windows tar.gz asset for this architecture');

  const tarPath = path.join(os.tmpdir(), `supabase-${process.pid}.tar.gz`);
  await httpDownload(asset.browser_download_url, tarPath);

  // Windows 10 1803+ ships bsdtar as tar.exe in System32; -xzf handles tar.gz.
  execSync(`tar -xzf "${tarPath}" -C "${binDir}"`, { stdio: 'pipe' });

  const flat = path.join(binDir, 'supabase.exe');
  if (!fs.existsSync(flat)) {
    const found = findFileMatching(binDir, /^supabase[\w.-]*$/i);
    if (found) {
      fs.renameSync(found, flat);
      const parent = path.dirname(found);
      if (parent !== binDir) {
        try { fs.rmdirSync(parent); } catch {}
      }
    }
  }

  try { fs.unlinkSync(tarPath); } catch {}

  if (!fs.existsSync(flat)) {
    throw new Error(`supabase binary not found after extraction in ${binDir}`);
  }
  return flat;
}

function findWindowsPsqlExe() {
  for (const v of findWindowsPostgresVersions()) {
    const exe = path.join(WIN_POSTGRES_BASE, v, 'bin', 'psql.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

function askQuestion(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await askQuestion(`  ${question} ${dim(hint)} `);
  if (answer === '') return defaultYes;
  return /^[Yy]/.test(answer);
}

async function pressEnter(msg = 'Press ENTER to continue') {
  await askQuestion(`  ${dim(msg)} `);
}

// ── Spinner ─────────────────────────────────────────────────────────────────

class Spinner {
  constructor() {
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.i = 0;
    this.timer = null;
    this.text = '';
  }

  start(text = '') {
    this.text = text;
    this.startedAt = Date.now();
    process.stdout.write(HIDE_CURSOR);
    this.timer = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - this.startedAt) / 1000);
      const elapsedTag = elapsedSec >= 5 ? ` ${DIM}(${elapsedSec}s)${RESET}` : '';
      const frame = `${BLUE}${this.frames[this.i]}${RESET}`;
      process.stdout.write(`\r  ${frame} ${this.text}${elapsedTag}   `);
      this.i = (this.i + 1) % this.frames.length;
    }, 80);
  }

  update(text) {
    this.text = text;
  }

  success(text) {
    this.stop();
    console.log(`  ${SYM_CHECK} ${text}`);
  }

  error(text) {
    this.stop();
    console.log(`  ${SYM_CROSS} ${text}`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write('\r\x1b[2K');
      process.stdout.write(SHOW_CURSOR);
    }
  }
}

// ── Terminal UI Helpers ─────────────────────────────────────────────────────

function hr() {
  console.log(`  ${DIM_BLUE}${'─'.repeat(50)}${RESET}`);
}

function drawBox(lines) {
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const w = maxLen + 4;
  const top = `  ${BLUE}╔${'═'.repeat(w)}╗${RESET}`;
  const bot = `  ${BLUE}╚${'═'.repeat(w)}╝${RESET}`;
  console.log(top);
  for (const line of lines) {
    const visible = stripAnsi(line).length;
    const pad = w - visible - 2;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    console.log(`  ${BLUE}║${RESET} ${' '.repeat(left)}${line}${' '.repeat(right)} ${BLUE}║${RESET}`);
  }
  console.log(bot);
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function showWelcome() {
  console.log('');
  console.log(`  ${CYAN}╔═══╗   ╔════╗   ═╗${RESET}`);
  console.log(`  ${CYAN}║   ║   ║    ║    ║${RESET}`);
  console.log(`  ${CYAN}╠═══╣   ╠════╝    ║${RESET}`);
  console.log(`  ${CYAN}║   ║   ║  ╚═╗    ║${RESET}`);
  console.log(`  ${CYAN}╩   ╩   ╩    ╩   ═╩═${RESET}`);
  console.log('');
  console.log(`  ${DIM}P R E M I E R   P E R S O N A L   P R O D U C T I V I T Y${RESET}`);
  console.log('');
  console.log(`  Platform: ${bold(platformLabel())}`);
  console.log('');
  console.log(`  Welcome to ARI. Engineered for those who want complete command over the`);
  console.log(`  software that runs their life. The first AI-enabled No Code workspace that`);
  console.log(`  can be completely customized to your workflow and grows with you. Build`);
  console.log(`  entirely new modules in minutes. Where mastery, modularity, and AI work in`);
  console.log(`  your favour so you can do your best work and live your best life.`);
  console.log('');

  console.log(`  This installer will set up everything you need to run ARI. The installer is`);
  console.log(`  open source as can be viewed on our Github repo.`);
  console.log(`  Need help? https://ari.software/docs`);
  console.log('');
  if (PLATFORM === 'darwin') {
    console.log(`    ${SYM_ARROW}  ${bold('Homebrew')}  ${dim('— macOS package manager')}`);
    console.log('');
  }
  console.log(`    ${SYM_ARROW}  ${bold('Node.js')}  ${dim('— JavaScript runtime')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('Git')}  ${dim('— version control')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('GitHub CLI')}  ${dim('— repository management')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('pnpm')}  ${dim('— package manager')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('Vercel CLI')}  ${dim('— deployment (optional)')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('Supabase CLI')}  ${dim('— database tools')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('PostgreSQL Server')}  ${dim('— database engine')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('PostgreSQL Client')}  ${dim('— database operations (optional)')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('pgweb')}  ${dim('— database UI (localhost:5050)')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('Claude Code')}  ${dim('— AI coding assistant')}`);
  console.log('');
  console.log(`    ${SYM_ARROW}  ${bold('ARI')}  ${dim('— clone repo & install dependencies')}`);
  console.log('');
}

function showStepHeader(current, total, title) {
  console.log('');
  hr();
  console.log(`  ${blue(`Step ${current} of ${total}:`)} ${bold(title)}`);
  hr();
}

// ── Platform Detection ──────────────────────────────────────────────────────

const PLATFORM = process.env.ARI_PLATFORM || os.platform();   // darwin | linux | win32
const PKG_MGR  = process.env.ARI_PKG_MGR  || (PLATFORM === 'darwin' ? 'brew' : 'npm');

function platformLabel() {
  if (PLATFORM === 'darwin') return 'macOS';
  if (PLATFORM === 'linux')  return `Linux (${PKG_MGR})`;
  if (PLATFORM === 'win32')  return 'Windows';
  return PLATFORM;
}

function getInstallCmd(cmds) {
  if (typeof cmds === 'string') return cmds;                   // universal command
  if (PLATFORM === 'win32' && cmds.win32) return cmds.win32;
  if (PLATFORM === 'darwin' && cmds.darwin) return cmds.darwin;
  if (PLATFORM === 'linux') {
    if (cmds.linux && cmds.linux[PKG_MGR]) return cmds.linux[PKG_MGR];
    if (cmds.linux && cmds.linux.npm) return cmds.linux.npm;   // npm fallback
  }
  return cmds.fallback || cmds.darwin || null;
}

// ── Detection Functions ─────────────────────────────────────────────────────

function parseVersion(str) {
  if (!str) return null;
  const match = str.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function isVersionBelow(current, minimum) {
  if (!current || !minimum) return true;
  const cur = current.split('.').map(Number);
  const min = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((cur[i] || 0) < (min[i] || 0)) return true;
    if ((cur[i] || 0) > (min[i] || 0)) return false;
  }
  return false;
}

function detectBrew() {
  const out = run('brew --version');
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectNode() {
  const out = run('node --version');
  const ver = out ? parseVersion(out) : null;
  return { installed: !!ver, version: ver, sufficient: ver && !isVersionBelow(ver, '18.0.0') };
}

function detectGit() {
  const out = run('git --version');
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectPnpm() {
  const out = run('pnpm --version');
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectVercelCli() {
  const out = run('vercel --version');
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectSupabaseCli() {
  let out = run('supabase --version');
  if (!out && process.platform === 'win32') {
    const exe = path.join(getWindowsAriBinDir(), 'supabase.exe');
    if (fs.existsSync(exe)) out = run(`"${exe}" --version`);
  }
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectClaudeCode() {
  const out = run('claude --version');
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectPsql() {
  // Check standard PATH, then platform-specific known locations.
  let out = run('psql --version');
  if (!out) {
    if (process.platform === 'darwin') {
      out = run('/opt/homebrew/opt/libpq/bin/psql --version');
    } else if (process.platform === 'win32') {
      const exe = findWindowsPsqlExe();
      if (exe) out = run(`"${exe}" --version`);
    }
  }
  if (!out) return { installed: false, version: null };
  // psql outputs "psql (PostgreSQL) 18.3" — only two version parts, so parseVersion won't match
  const match = out.match(/(\d+\.\d+(?:\.\d+)?)/);
  return { installed: true, version: match ? match[1] : null };
}

function detectPgweb() {
  let out = run('pgweb --version');
  if (!out && process.platform === 'win32') {
    const exe = path.join(getWindowsAriBinDir(), 'pgweb.exe');
    if (fs.existsSync(exe)) out = run(`"${exe}" --version`);
  }
  if (!out) return { installed: false, version: null };
  const match = out.match(/(\d+\.\d+(?:\.\d+)?)/);
  return { installed: true, version: match ? match[1] : null };
}

function detectPostgresServer() {
  // Check for actual server installation (not just libpq client)
  if (PLATFORM === 'darwin') {
    for (const formula of ['postgresql@17', 'postgresql']) {
      if (run(`brew list --formula ${formula} 2>/dev/null`) !== null) {
        const psqlInfo = detectPsql();
        return { installed: true, version: psqlInfo.version ?? 'unknown' };
      }
    }
    return { installed: false, version: null };
  }
  // On Windows, the EDB installer drops binaries under C:\Program Files\PostgreSQL\<v>\bin.
  // pg_isready isn't on PATH after winget install, so we check the install dir directly.
  if (PLATFORM === 'win32') {
    const exe = findWindowsPsqlExe();
    if (exe) {
      const psqlInfo = detectPsql();
      return { installed: true, version: psqlInfo.version ?? 'unknown' };
    }
    return { installed: false, version: null };
  }
  // On Linux, pg_isready comes with the server package, not client-only
  if (run('pg_isready --version') !== null) {
    const psqlInfo = detectPsql();
    return { installed: true, version: psqlInfo.version ?? 'unknown' };
  }
  return { installed: false, version: null };
}

function detectGhCli() {
  const out = run('gh --version');
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectDocker() {
  const version = run('docker --version');
  if (!version) return { installed: false, running: false, version: null };
  const running = !!run('docker info');
  return { installed: true, running, version: parseVersion(version) };
}

async function waitForDocker(initialStatus) {
  if (!initialStatus.installed) {
    console.log(`  ${SYM_WARN} ${yellow('Docker is not installed.')}`);
    if (PLATFORM === 'win32') {
      console.log('');
      console.log(`  Local Supabase needs Docker Desktop, which isn't installed.`);
      console.log(`    1. Install Docker Desktop: ${blue('https://www.docker.com/products/docker-desktop')}`);
      console.log(`    2. Reboot if prompted.`);
      console.log(`    3. Launch Docker Desktop and wait for the whale icon to be steady.`);
      console.log(`    4. Re-run this installer and pick "Local Supabase" again.`);
    } else {
      console.log(`  ${dim('Install Docker Desktop: https://www.docker.com/products/docker-desktop')}`);
    }
    return false;
  }

  const maxRetries = 2;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`  ${SYM_WARN} ${yellow('Docker is not running.')}`);
    console.log('');
    console.log(`  Please start Docker and wait until it is ready.`);

    await pressEnter('Then press ENTER to continue');
    console.log('');

    if (detectDocker().running) return true;
  }

  console.log(`  ${dim('Skipping local Supabase setup — Docker is required.')}`);
  return false;
}

// ── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS = [
  ...(PLATFORM === 'darwin' ? [{
    id: 'homebrew',
    name: 'Homebrew',
    required: true,
    installCmds: {
      darwin: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    },
    detect: detectBrew,
    description: 'macOS package manager for installing developer tools.',
  }] : []),
  {
    id: 'node',
    name: 'Node.js',
    required: true,
    installCmds: {
      darwin: 'brew install node',
      linux: {
        apt: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
        dnf: 'sudo dnf install -y nodejs',
        pacman: 'sudo pacman -S --noconfirm nodejs npm',
        zypper: 'sudo zypper install -y nodejs',
      },
      win32: 'winget install -e --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements',
    },
    detect: detectNode,
    description: 'JavaScript runtime that powers ARI.',
  },
  {
    id: 'git',
    name: 'Git',
    required: true,
    installCmds: {
      darwin: 'brew install git',
      linux: {
        apt: 'sudo apt-get install -y git',
        dnf: 'sudo dnf install -y git',
        pacman: 'sudo pacman -S --noconfirm git',
        zypper: 'sudo zypper install -y git',
      },
      win32: 'winget install -e --id Git.Git --source winget --accept-source-agreements --accept-package-agreements',
    },
    detect: detectGit,
    description: 'Version control system for managing source code.',
  },
  {
    id: 'gh',
    name: 'GitHub CLI',
    required: true,
    installCmds: {
      darwin: 'brew install gh',
      linux: {
        apt: 'sudo apt-get install -y gh',
        dnf: 'sudo dnf install -y gh',
        pacman: 'sudo pacman -S --noconfirm github-cli',
      },
      win32: 'winget install -e --id GitHub.cli --source winget --accept-source-agreements --accept-package-agreements',
    },
    detect: detectGhCli,
    description: 'GitHub CLI for creating and managing your private repository.',
  },
  {
    id: 'pnpm',
    name: 'pnpm',
    required: true,
    installCmds: {
      darwin: 'brew install pnpm',
      fallback: 'npm install -g pnpm',
    },
    detect: detectPnpm,
    description: 'Fast, disk space efficient package manager used by ARI.',
  },
  {
    id: 'vercel',
    name: 'Vercel CLI',
    required: false,
    installCmds: 'npm install -g vercel',
    detect: detectVercelCli,
    description: 'Deploy and manage ARI on Vercel hosting.',
  },
  {
    id: 'supabase',
    // Supabase explicitly disabled `npm install -g supabase` (it exits non-zero
    // by design). brew works on macOS. On Windows we download the prebuilt
    // amd64 binary from their GitHub releases (handled as a special case in
    // installTools) since their winget id is unreliable. Required only on
    // macOS — Local Postgres mode (Windows default) doesn't need it.
    name: 'Supabase CLI',
    required: PLATFORM === 'darwin',
    installCmds: {
      darwin: 'brew install supabase/tap/supabase',
    },
    detect: detectSupabaseCli,
    description: 'Database management tools for Supabase PostgreSQL.',
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL Server',
    required: true,
    installCmds: {
      darwin: 'brew install postgresql@17 && brew services start postgresql@17',
      linux: {
        apt: 'sudo apt-get install -y postgresql',
        dnf: 'sudo dnf install -y postgresql-server && sudo postgresql-setup --initdb && sudo systemctl enable postgresql && sudo systemctl start postgresql',
        pacman: 'sudo pacman -S --noconfirm postgresql && sudo -u postgres initdb -D /var/lib/postgres/data && sudo systemctl enable postgresql && sudo systemctl start postgresql',
        zypper: 'sudo zypper install -y postgresql-server && sudo systemctl enable postgresql && sudo systemctl start postgresql',
      },
      // winget-pkgs organizes Postgres by major version (PostgreSQL.PostgreSQL.17,
      // .18, etc.) — there is no bare PostgreSQL.PostgreSQL id. We pin to v17
      // to match the rest of the codebase (postgresql@17 on macOS,
      // postgresql-x64-17 service name on Windows, setup.sql expectations).
      //
      // --disable-components pgAdmin,stackbuilder explicitly skips the
      // ~600 MB pgAdmin Python/Flask GUI (ARI talks to Postgres via the pg
      // Node module — pgweb is the user-facing DB UI on both platforms)
      // and StackBuilder (extension picker GUI). EDB treats
      // --enable-components additively rather than restrictively, so
      // --disable-components is the unambiguous form. Cuts install time
      // from ~3 minutes to ~30 seconds.
      //
      // --force bypasses winget's "already installed" check, which fires
      // when EDB's uninstaller leaves an Add/Remove Programs registry entry
      // behind — common after partial cleanups. Without this, a re-install
      // attempt fails with 0x8A15002B (no upgrade available) even though
      // the binaries are gone.
      win32:
        `winget install -e --id PostgreSQL.PostgreSQL.17 --source winget --force ` +
        `--accept-source-agreements --accept-package-agreements ` +
        `--override "--mode unattended --unattendedmodeui none ` +
        `--superpassword ${POSTGRES_PASSWORD} ` +
        `--servicepassword ${POSTGRES_PASSWORD} ` +
        `--disable-components pgAdmin,stackbuilder"`,
    },
    detect: detectPostgresServer,
    description: 'Database server for ARI data storage.',
    // Stream installer output instead of using a spinner — winget download
    // progress + EDB unpacking progress are useful signal during a multi-
    // minute install.
    streamOutput: true,
  },
  // psql is a separate tool on macOS/Linux but bundled with PostgreSQL.PostgreSQL
  // on Windows (no separate winget package exists). On Windows we skip this
  // entry entirely — detectPsql() picks up the bundled binary.
  ...(PLATFORM === 'win32' ? [] : [{
    id: 'psql',
    name: 'PostgreSQL Client',
    required: false,
    installCmds: {
      darwin: 'brew install libpq',
      linux: {
        apt: 'sudo apt-get install -y postgresql-client',
        dnf: 'sudo dnf install -y postgresql',
        pacman: 'sudo pacman -S --noconfirm postgresql-libs',
        zypper: 'sudo zypper install -y postgresql',
      },
    },
    detect: detectPsql,
    description: 'PostgreSQL client for database operations via Claude Code.',
  }]),
  {
    id: 'pgweb',
    name: 'pgweb',
    required: true,
    installCmds: {
      darwin: 'brew install pgweb',
      linux: {
        apt: 'sudo apt-get install -y pgweb',
        dnf: 'sudo dnf install -y pgweb',
      },
      fallback: 'go install github.com/sosedoff/pgweb@latest',
    },
    detect: detectPgweb,
    description: 'Lightweight web UI for PostgreSQL (runs on localhost:5050).',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    required: true,
    installCmds: {
      darwin: 'brew install --cask claude-code',
      fallback: 'npm install -g @anthropic-ai/claude-code',
    },
    detect: detectClaudeCode,
    description: 'AI-powered coding assistant for building and customizing ARI.',
  },
];

// ── Installation Loop ───────────────────────────────────────────────────────

async function installTools() {
  // Pick up tools installed in a previous run of this script — Node inherits
  // process.env.PATH from the parent shell at startup, which may predate
  // those installs.
  refreshWindowsPath();
  ensureWindowsPostgresPath();

  const results = [];
  const total = TOOLS.length;

  for (let i = 0; i < TOOLS.length; i++) {
    const tool = TOOLS[i];
    showStepHeader(i + 1, total, tool.name);

    const status = tool.detect();

    if (status.installed) {
      console.log(`  ${SYM_CHECK} ${tool.name} v${status.version || '?'} already installed`);
      results.push({ ...tool, status: 'installed', version: status.version });
      continue;
    }

    console.log(`  ${dim(tool.description)}`);
    console.log('');

    // Windows tools without a reliable winget/choco package: download the
    // prebuilt amd64 binary directly from the project's GitHub releases.
    const isWinGithubBinary =
      PLATFORM === 'win32' && (tool.id === 'pgweb' || tool.id === 'supabase');

    const cmd = isWinGithubBinary ? '<download from GitHub releases>' : getInstallCmd(tool.installCmds);
    if (!cmd) {
      console.log(`  ${SYM_WARN} ${yellow(`No install method for ${tool.name} on ${platformLabel()}.`)}`);
      results.push({ ...tool, status: 'skipped', version: null });
      continue;
    }

    const label = tool.required
      ? `Install ${tool.name}?`
      : `Install ${tool.name}? ${dim('(optional)')}`;
    const defaultYes = tool.required;
    const shouldInstall = await askYesNo(label, defaultYes);

    if (!shouldInstall) {
      if (tool.required) {
        console.log(`  ${SYM_WARN} ${yellow(`${tool.name} is required — you may need it later.`)}`);
      } else {
        console.log(`  ${SYM_DASH} Skipped ${tool.name}`);
      }
      results.push({ ...tool, status: 'skipped', version: null });
      continue;
    }

    const spinner = new Spinner();
    const streamMode = !!tool.streamOutput && !isWinGithubBinary;
    if (streamMode) {
      console.log(`  ${dim('Installing ' + tool.name + ' — this can take a few minutes…')}`);
      console.log('');
    } else {
      spinner.start(`Installing ${tool.name}…`);
    }

    try {
      if (isWinGithubBinary) {
        if (tool.id === 'pgweb') await installPgwebWindows();
        else if (tool.id === 'supabase') await installSupabaseCliWindows();
      } else if (streamMode) {
        await spawnShellAsync(cmd);
      } else {
        await runAsync(cmd);
      }
      // Refresh PATH so the just-installed binary is visible to subsequent
      // detect()/run() calls in this same Node process.
      refreshWindowsPath();
      ensureWindowsPostgresPath();
      const after = tool.detect();
      spinner.success(`${tool.name} ${after.version ? `v${after.version}` : ''} installed`);
      results.push({ ...tool, status: 'installed', version: after.version });
    } catch (err) {
      // winget returns non-zero when the package is already installed at the
      // current version. Re-detect: if the binary is actually there, the
      // "failure" was just winget being noisy about a no-op.
      refreshWindowsPath();
      ensureWindowsPostgresPath();
      const recheck = tool.detect();
      if (recheck.installed) {
        spinner.success(`${tool.name} ${recheck.version ? `v${recheck.version}` : ''} already installed`);
        results.push({ ...tool, status: 'installed', version: recheck.version });
      } else {
        spinner.error(`Failed to install ${tool.name}`);
        // Show enough lines to surface the underlying installer error (winget,
        // EDB, etc.) without flooding the screen.
        console.log(`  ${dim(err.message.split('\n').slice(0, 12).join('\n  '))}`);
        console.log('');
        console.log(`  ${dim('You can try running this manually:')}`);
        console.log(`  ${DIM_BLUE}${cmd}${RESET}`);
        results.push({ ...tool, status: 'failed', version: null });
      }
    }
  }

  return results;
}

// ── Setup ARI ───────────────────────────────────────────────────────

async function cloneAndSetup() {
  console.log('');
  hr();
  console.log(`  ${blue('Setup ARI')}`);
  hr();

  const defaultDir = path.join(os.homedir(), 'ARI');
  const answer = await askQuestion(`  Where would you like to install ARI? ${dim(`[${defaultDir}]`)} `);
  let targetDir = answer || defaultDir;

  // Expand ~ to home directory
  if (targetDir.startsWith('~')) {
    targetDir = path.join(os.homedir(), targetDir.slice(1));
  }

  // Resolve to absolute path
  targetDir = path.resolve(targetDir);

  // Check if target exists
  if (fs.existsSync(targetDir)) {
    const packageJson = path.join(targetDir, 'package.json');
    if (fs.existsSync(packageJson)) {
      console.log(`  ${SYM_WARN} ${yellow('Directory already exists and contains a project.')}`);
      const useExisting = await askYesNo('Use existing directory?', true);
      if (useExisting) {
        console.log(`  ${SYM_CHECK} Using existing directory: ${dim(targetDir)}`);
        return await installDependencies(targetDir);
      }
    }

    // Find an alternative name
    let counter = 2;
    let altDir = `${targetDir}-${counter}`;
    while (fs.existsSync(altDir)) {
      counter++;
      altDir = `${targetDir}-${counter}`;
    }
    console.log(`  ${SYM_WARN} ${yellow(`${targetDir} already exists.`)}`);
    const altAnswer = await askQuestion(`  Use ${dim(altDir)} instead? [Y/n] `);
    if (altAnswer === '' || /^[Yy]/.test(altAnswer)) {
      targetDir = altDir;
    } else {
      const custom = await askQuestion('  Enter a custom path: ');
      if (!custom) {
        console.log(`  ${SYM_CROSS} ${red('No path provided. Skipping clone.')}`);
        return { cloned: false, dir: null };
      }
      targetDir = custom.startsWith('~') ? path.join(os.homedir(), custom.slice(1)) : path.resolve(custom);
    }
  }

  // Clone
  const spinner = new Spinner();
  spinner.start('Cloning ARI repository…');

  try {
    const branchFlag = ARI_BRANCH !== 'main' ? ` --branch ${ARI_BRANCH}` : '';
    await runAsync(`git clone${branchFlag} https://github.com/ARIsoftware/ARI.git "${targetDir}"`);
    // Rename origin to upstream (public ARI repo) so user can add their own origin later
    await runAsync('git remote rename origin upstream', { cwd: targetDir });
    spinner.success(`ARI cloned to ${dim(targetDir)}${ARI_BRANCH !== 'main' ? ` (branch: ${ARI_BRANCH})` : ''}`);
  } catch (err) {
    spinner.error('Failed to clone ARI repository');
    console.log(`  ${dim(err.message.split('\n').slice(0, 3).join('\n  '))}`);
    console.log('');
    console.log(`  ${dim('You can try cloning manually:')}`);
    console.log(`  ${DIM_BLUE}git clone${ARI_BRANCH !== 'main' ? ` --branch ${ARI_BRANCH}` : ''} https://github.com/ARIsoftware/ARI.git "${targetDir}"${RESET}`);
    return { cloned: false, dir: targetDir };
  }

  return await installDependencies(targetDir);
}

async function installDependencies(targetDir) {
  console.log('');
  console.log(`  ${dim('Installing dependencies (this may take a minute)…')}`);
  console.log('');

  try {
    await spawnAsync('pnpm', ['install'], { stdio: 'inherit', cwd: targetDir, shell: PLATFORM === 'win32' });
    console.log('');
    console.log(`  ${SYM_CHECK} Dependencies installed`);
    return { cloned: true, dir: targetDir, depsInstalled: true };
  } catch (err) {
    console.log('');
    console.log(`  ${SYM_CROSS} ${red('Failed to install dependencies')}`);
    console.log(`  ${dim(err.message)}`);
    console.log('');
    console.log(`  ${dim('You can try running this manually:')}`);
    const cdFlag = PLATFORM === 'win32' ? 'cd /d' : 'cd';
    console.log(`  ${DIM_BLUE}${cdFlag} "${targetDir}" && pnpm install${RESET}`);
    return { cloned: true, dir: targetDir, depsInstalled: false };
  }
}

// ── Local Supabase Setup ───────────────────────────────────────────────────

function parseSupabaseEnv(targetDir) {
  const raw = run('supabase status -o env', { cwd: targetDir });
  if (!raw) return null;

  const vars = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

// SYNC: env key mapping is duplicated in the embedded cli.js writeEnvFile(). Keep both in sync.
function generateEnvFile(targetDir, supabaseVars) {
  const envPath = path.join(targetDir, '.env.supabase.local');

  // Only write keys that have values. Writing empty `KEY=` lines causes
  // dotenv (with override: true in next.config.mjs) to overwrite values from
  // .env.local with empty strings, which would break the client bundle.
  const mappings = [
    ['NEXT_PUBLIC_SUPABASE_URL', supabaseVars.API_URL],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', supabaseVars.ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', supabaseVars.SERVICE_ROLE_KEY],
    ['DATABASE_URL', supabaseVars.DB_URL],
  ];
  const envContent = mappings
    .filter(([, value]) => value)
    .map(([key, value]) => key + '=' + value)
    .join('\n') + '\n';

  fs.writeFileSync(envPath, envContent);
  return { databaseUrl: supabaseVars.DB_URL };
}

async function runSetupSql(targetDir, databaseUrl) {
  const setupSqlPath = path.join(targetDir, 'lib', 'db', 'setup.sql');
  if (!fs.existsSync(setupSqlPath)) return false;

  try {
    const pg = require(path.join(targetDir, 'node_modules', 'pg'));
    const sql = fs.readFileSync(setupSqlPath, 'utf8');
    const client = new pg.Client({ connectionString: databaseUrl, ssl: false });
    await client.connect();
    await client.query(sql);
    await client.end();
    return true;
  } catch (err) {
    // Fallback: try psql at known locations.
    const candidates = ['psql'];
    if (process.platform === 'darwin') {
      candidates.push('/opt/homebrew/opt/libpq/bin/psql');
    } else if (process.platform === 'win32') {
      const winExe = findWindowsPsqlExe();
      if (winExe) candidates.push(`"${winExe}"`);
    }
    for (const psql of candidates) {
      const psqlResult = run(`${psql} "${databaseUrl}" -f "${setupSqlPath}"`);
      if (psqlResult !== null) return true;
    }
    throw err;
  }
}

// Like runAsync but streams output to terminal (stdio: 'inherit') instead of capturing it
function spawnAsync(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

// Run a full shell command string with stdout/stderr streamed live to the
// user's terminal. Used for slow installs (e.g. Postgres) where winget +
// installer progress is the most informative thing we can show.
//
// shell: true is critical — it tells Node to hand the command string to
// the platform shell (cmd.exe on Windows, /bin/sh on Unix) without
// applying CRT-style argument escaping. That preserves nested quotes in
// patterns like `winget --override "--mode unattended ..."` which would
// otherwise be mangled when bouncing through `spawn('cmd', ['/c', ...])`.
function spawnShellAsync(cmdString, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmdString, [], { shell: true, stdio: 'inherit', ...opts });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Exit code: ${code}`));
    });
    child.on('error', reject);
  });
}

function writeInstallerEnvFile(targetDir, { dbMode, dbUrl }) {
  const crypto = require('crypto');
  const secret = crypto.randomBytes(32).toString('base64');
  const lines = [
    '# ARI Environment Configuration',
    '# Generated by ARI installer',
    '',
    `ARI_DB_MODE=${dbMode}`,
    '',
  ];

  if (dbUrl) {
    lines.push('# Database', `DATABASE_URL=${dbUrl}`, 'DATABASE_POOL_MAX=', '');
  }

  lines.push(
    '# Better Auth',
    `BETTER_AUTH_SECRET=${secret}`,
    'BETTER_AUTH_URL=http://localhost:3000',
    '',
    '# App URL',
    'NEXT_PUBLIC_APP_URL=http://localhost:3000',
    '',
    '# Backup operations',
    'ALLOW_BACKUP_OPERATIONS=true',
    '',
  );

  fs.writeFileSync(path.join(targetDir, '.env.local'), lines.join('\n'));
}

async function chooseDatabaseMode() {
  console.log('');
  hr();
  console.log(`  ${blue('Database Setup')}`);
  hr();
  console.log('');
  console.log('  Which database setup would you like?');
  console.log('');
  console.log(`    ${green('1.')} Local PostgreSQL ${dim('(default)')}`);
  console.log(`       ${dim('Uses PostgreSQL directly. No Docker required.')}`);
  console.log('');
  console.log(`    ${green('2.')} Local Supabase ${dim('(requires Docker)')}`);
  console.log(`       ${dim('Runs a full Supabase stack in Docker containers.')}`);
  if (PLATFORM === 'win32') {
    console.log(`       ${dim('On Windows: install Docker Desktop first and have it running.')}`);
  }
  console.log('');
  console.log(`    ${green('3.')} Supabase Cloud`);
  console.log(`       ${dim('Connect to a Supabase.com project. Configure on first launch.')}`);
  console.log('');

  const answer = await askQuestion(`  ${dim('Enter choice [1/2/3]:')} `);
  const choice = answer.trim();
  if (choice === '2') return 'supabaselocal';
  if (choice === '3') return 'supabasecloud';
  return 'postgres';
}

async function setupLocalPostgres(targetDir) {
  console.log('');
  hr();
  console.log(`  ${blue('Local PostgreSQL Setup')}`);
  hr();

  const result = {
    pgReady: false,
    dbCreated: false,
    schemaInitialized: false,
  };

  // Ensure platform-specific PostgreSQL binaries are visible in this process.
  if (PLATFORM === 'darwin') {
    const brewPgBin = '/opt/homebrew/opt/postgresql@17/bin';
    const brewPgBinIntel = '/usr/local/opt/postgresql@17/bin';
    const pathEntries = process.env.PATH.split(':');
    if (fs.existsSync(brewPgBin) && !pathEntries.includes(brewPgBin)) {
      process.env.PATH = `${brewPgBin}:${process.env.PATH}`;
    } else if (fs.existsSync(brewPgBinIntel) && !pathEntries.includes(brewPgBinIntel)) {
      process.env.PATH = `${brewPgBinIntel}:${process.env.PATH}`;
    }
  } else if (PLATFORM === 'win32') {
    refreshWindowsPath();
    ensureWindowsPostgresPath();
  }

  const isLinux = PLATFORM === 'linux';
  const isWin = PLATFORM === 'win32';
  // On Windows we authenticate with the password we set during winget install.
  const childEnv = isWin ? { ...process.env, PGPASSWORD: POSTGRES_PASSWORD } : process.env;
  // Use 127.0.0.1 explicitly on Windows: pg_hba.conf is host-based on IPv4.
  const hostArg = isWin ? '-h 127.0.0.1' : '';
  const userArg = isWin ? '-U postgres' : '';
  const sudo = isLinux ? 'sudo -u postgres ' : '';
  const pgIsReadyCmd = isWin ? 'pg_isready -h 127.0.0.1 -q' : 'pg_isready -q';

  // 1. Check if PostgreSQL is running
  const pgReady = run(pgIsReadyCmd, { env: childEnv }) !== null;

  if (!pgReady) {
    console.log(`  ${SYM_DASH} PostgreSQL is not running. Attempting to start…`);
    if (PLATFORM === 'darwin') {
      run('brew services start postgresql@17');
    } else if (isWin) {
      run('powershell -NoProfile -Command "Get-Service postgresql-x64-* | Start-Service"');
    } else {
      run('sudo systemctl start postgresql');
    }
    // Re-check
    const now = run(pgIsReadyCmd, { env: childEnv }) !== null;
    if (!now) {
      console.log(`  ${SYM_CROSS} ${red('Could not start PostgreSQL.')}`);
      if (PLATFORM === 'darwin') {
        console.log(`  ${dim('Try: brew services start postgresql@17')}`);
        console.log(`  ${dim('You may need to add PostgreSQL to your PATH:')}`);
        console.log(`  ${dim('export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"')}`);
      } else if (isWin) {
        console.log(`  ${dim('Try: net start postgresql-x64-17  (or open Services.msc)')}`);
      } else {
        console.log(`  ${dim('Try: sudo systemctl start postgresql')}`);
      }
      return result;
    }
  }
  console.log(`  ${SYM_CHECK} PostgreSQL is running`);
  result.pgReady = true;

  // 2. Create database (platform-aware)
  const spinner = new Spinner();
  spinner.start('Creating database…');

  const dbListCmd = [sudo.trim(), 'psql', userArg, hostArg, '-lqt'].filter(Boolean).join(' ');
  const dbList = run(dbListCmd, { env: childEnv }) || '';
  const dbExists = dbList.split('\n').some(line => line.trim().startsWith('ari ') || line.trim().startsWith('ari|'));

  if (dbExists) {
    spinner.success('Database "ari" already exists');
  } else {
    const createCmd = [sudo.trim(), 'createdb', userArg, hostArg, 'ari'].filter(Boolean).join(' ');
    const createResult = run(createCmd, { env: childEnv });
    if (createResult === null) {
      spinner.error('Failed to create database "ari"');
      console.log(`  ${dim('Try manually: ' + createCmd)}`);
      return result;
    }
    spinner.success('Database "ari" created');
  }
  result.dbCreated = true;

  // 3. Determine DATABASE_URL
  const dbUrl = isWin
    ? `postgresql://postgres:${encodeURIComponent(POSTGRES_PASSWORD)}@127.0.0.1:5432/ari`
    : isLinux
      ? 'postgresql://postgres@localhost:5432/ari'
      : 'postgresql://localhost:5432/ari';

  // 4. Run setup.sql
  spinner.start('Initializing database schema…');
  try {
    const ok = await runSetupSql(targetDir, dbUrl);
    if (ok) {
      spinner.success('Database schema initialized');
      result.schemaInitialized = true;
    } else {
      spinner.error('setup.sql not found');
    }
  } catch (err) {
    spinner.error('Failed to initialize database schema');
    console.log(`  ${dim(err.message.split('\n').slice(0, 3).join('\n  '))}`);
  }

  // 5. Write .env.local with ARI_DB_MODE and DATABASE_URL
  spinner.start('Writing .env.local…');
  writeInstallerEnvFile(targetDir, { dbMode: 'postgres', dbUrl });
  spinner.success('.env.local generated');

  return result;
}

async function setupLocalSupabase(targetDir) {
  console.log('');
  hr();
  console.log(`  ${blue('Local Supabase Setup')}`);
  hr();

  const result = {
    supabaseStarted: false,
    envGenerated: false,
    schemaInitialized: false,
  };

  // Check Docker
  const docker = detectDocker();
  if (!docker.running) {
    const dockerReady = await waitForDocker(docker);
    if (!dockerReady) {
      console.log(`  ${SYM_DASH} Skipping local Supabase setup`);
      console.log(`  ${dim('You can set up Supabase Cloud manually or run ./ari start later.')}`);
      return result;
    }
  } else {
    console.log(`  ${SYM_CHECK} Docker is running`);
  }

  // Ask user
  const shouldSetup = await askYesNo('Set up local Supabase database?', true);
  if (!shouldSetup) {
    console.log(`  ${SYM_DASH} Skipped local Supabase setup`);
    return result;
  }

  // Start Supabase
  const spinner = new Spinner();
  // run() already swallows stderr via stdio:pipe; check the captured stdout for "API URL".
  const supabaseStatusOut = run('supabase status', { cwd: targetDir }) || '';
  const alreadyRunning = supabaseStatusOut.includes('API URL');

  if (alreadyRunning) {
    console.log(`  ${SYM_CHECK} Supabase is already running`);
    result.supabaseStarted = true;
  } else {
    console.log('');
    console.log(`  ${dim('Starting Supabase (first run downloads images — this may take a few minutes)…')}`);
    console.log('');
    try {
      await spawnAsync('supabase', ['start'], { stdio: 'inherit', cwd: targetDir, shell: PLATFORM === 'win32' });
      console.log('');
      console.log(`  ${SYM_CHECK} Supabase started`);
      result.supabaseStarted = true;
    } catch (err) {
      console.log('');
      console.log(`  ${SYM_CROSS} ${red('Failed to start Supabase')}`);
      console.log(`  ${dim(err.message)}`);
      console.log(`  ${dim('You can try running: cd ' + shortenPath(targetDir) + ' && supabase start')}`);
      return result;
    }
  }

  // Parse env and generate .env.supabase.local
  spinner.start('Generating .env.supabase.local…');
  const supabaseVars = parseSupabaseEnv(targetDir);
  if (!supabaseVars || !supabaseVars.DB_URL) {
    spinner.error('Failed to read Supabase status');
    return result;
  }

  const envResult = generateEnvFile(targetDir, supabaseVars);
  spinner.success('.env.supabase.local generated');
  result.envGenerated = true;

  // Run setup.sql
  spinner.start('Initializing database schema…');
  try {
    const ok = await runSetupSql(targetDir, envResult.databaseUrl);
    if (ok) {
      spinner.success('Database schema initialized');
      result.schemaInitialized = true;
    } else {
      spinner.error('setup.sql not found');
    }
  } catch (err) {
    spinner.error('Failed to initialize database schema');
    console.log(`  ${dim(err.message.split('\n').slice(0, 3).join('\n  '))}`);
    console.log('');
    console.log(`  ${dim('You can run lib/db/setup.sql manually in your SQL client.')}`);
    console.log(`  ${dim('For local Supabase: open Studio at')} ${DIM_BLUE}http://127.0.0.1:54323${RESET}`);
    console.log(`  ${dim('For local Postgres: pgweb, psql, or any other SQL client.')}`);
  }

  return result;
}

// ── Verification Tests ──────────────────────────────────────────────────────

function runVerification(ariResult, supabaseResult) {
  // Make sure detect() calls below see binaries that were just installed in this
  // same Node process (winget mutates Machine PATH but not process.env.PATH).
  refreshWindowsPath();
  ensureWindowsPostgresPath();

  console.log('');
  hr();
  console.log(`  ${blue('Verification Tests')}`);
  hr();
  console.log('');

  const checks = [];

  // Package manager (platform-specific)
  if (PLATFORM === 'darwin') {
    const brew = detectBrew();
    checks.push({
      name: 'Homebrew',
      ok: brew.installed,
      detail: brew.installed ? `v${brew.version}` : 'not found',
    });
  } else if (PLATFORM === 'linux') {
    const hasPkgMgr = !!run(`command -v ${PKG_MGR}`);
    checks.push({
      name: `Package manager (${PKG_MGR})`,
      ok: hasPkgMgr,
      detail: hasPkgMgr ? 'available' : 'not found',
    });
  } else if (PLATFORM === 'win32') {
    const hasWinget = !!run('winget --version');
    checks.push({
      name: 'winget',
      ok: hasWinget,
      detail: hasWinget ? 'available' : 'not found',
    });
  }

  // Git
  const git = detectGit();
  checks.push({
    name: 'Git',
    ok: git.installed,
    detail: git.installed ? `v${git.version}` : 'not found',
  });

  // GitHub CLI
  const gh = detectGhCli();
  checks.push({
    name: 'GitHub CLI',
    ok: gh.installed,
    detail: gh.installed ? `v${gh.version}` : 'not found',
  });

  // Node.js
  const node = detectNode();
  checks.push({
    name: 'Node.js',
    ok: node.sufficient,
    detail: node.installed
      ? `v${node.version}${node.sufficient ? ` ${dim('(≥ 18 ✔)')}` : ` ${red('(< 18)')}`}`
      : 'not found',
  });

  // pnpm
  const pnpm = detectPnpm();
  checks.push({
    name: 'pnpm',
    ok: pnpm.installed,
    detail: pnpm.installed ? `v${pnpm.version}` : 'not found',
  });

  // Vercel CLI
  const vercel = detectVercelCli();
  checks.push({
    name: 'Vercel CLI',
    ok: true, // optional, always "ok"
    detail: vercel.installed ? `v${vercel.version}` : 'skipped',
    optional: true,
  });

  // Supabase CLI
  const supabase = detectSupabaseCli();
  checks.push({
    name: 'Supabase CLI',
    ok: supabase.installed,
    detail: supabase.installed ? `v${supabase.version}` : 'not found',
  });

  // PostgreSQL Client
  const psql = detectPsql();
  checks.push({
    name: 'PostgreSQL Client',
    ok: true, // optional, always "ok"
    detail: psql.installed ? `v${psql.version}` : 'skipped',
    optional: true,
  });

  // ARI cloned
  const ariCloned = ariResult && ariResult.cloned && ariResult.dir;
  checks.push({
    name: 'ARI cloned',
    ok: !!ariCloned,
    detail: ariCloned ? shortenPath(ariResult.dir) : 'not cloned',
  });

  // Dependencies
  const depsExist = ariResult && ariResult.dir && fs.existsSync(path.join(ariResult.dir, 'node_modules'));
  checks.push({
    name: 'Dependencies',
    ok: !!depsExist,
    detail: depsExist ? 'node_modules exists' : 'not installed',
  });

  // Docker
  const docker = detectDocker();
  checks.push({
    name: 'Docker',
    ok: true, // optional
    detail: docker.running ? `running (v${docker.version || '?'})` : docker.installed ? 'installed but not running' : 'not installed',
    optional: true,
  });

  // Database setup results
  if (supabaseResult) {
    // Supabase local mode
    if (supabaseResult.supabaseStarted !== undefined) {
      checks.push({
        name: 'Supabase Local',
        ok: true,
        detail: supabaseResult.supabaseStarted ? 'running' : 'not started',
        optional: true,
      });
      checks.push({
        name: '.env.supabase.local',
        ok: true,
        detail: supabaseResult.envGenerated ? 'generated' : 'not generated',
        optional: true,
      });
    }

    // PostgreSQL local mode
    if (supabaseResult.pgReady !== undefined) {
      checks.push({
        name: 'PostgreSQL',
        ok: supabaseResult.pgReady,
        detail: supabaseResult.pgReady ? 'running' : 'not reachable',
      });
      checks.push({
        name: 'Database "ari"',
        ok: supabaseResult.dbCreated,
        detail: supabaseResult.dbCreated ? 'created' : 'not created',
      });
    }

    if (supabaseResult.schemaInitialized !== undefined) {
      checks.push({
        name: 'Database Schema',
        ok: supabaseResult.schemaInitialized,
        detail: supabaseResult.schemaInitialized ? 'initialized' : 'not initialized',
      });
    }

    const ariLauncherExists = ariResult && ariResult.dir && fs.existsSync(path.join(ariResult.dir, 'ari'));
    checks.push({
      name: 'ARI CLI',
      ok: !!ariLauncherExists,
      detail: ariLauncherExists ? './ari ready' : 'not found',
    });
  }

  // Print results
  const nameWidth = Math.max(...checks.map((c) => c.name.length));
  let passed = 0;
  let total = 0;

  for (const check of checks) {
    const sym = check.ok ? SYM_CHECK : (check.optional && !check.ok ? SYM_DASH : SYM_CROSS);
    const dots = '.'.repeat(nameWidth - check.name.length + 3);
    console.log(`    ${sym} ${check.name} ${dim(dots)} ${check.detail}`);
    if (!check.optional) {
      total++;
      if (check.ok) passed++;
    } else {
      total++;
      passed++; // optional always passes
    }
  }

  console.log('');
  if (passed === total) {
    console.log(`    ${green(`${passed}/${total} checks passed`)}`);
  } else {
    console.log(`    ${yellow(`${passed}/${total} checks passed`)}`);
    console.log('');
    console.log(`  ${SYM_WARN} Some checks failed. You may need to install missing tools manually.`);
    console.log(`  ${dim('See: https://github.com/ARIsoftware/ARI#readme')}`);
  }

  return { passed, total };
}

function shortenPath(p) {
  const home = os.homedir();
  if (p.startsWith(home)) {
    return '~' + p.slice(home.length);
  }
  return p;
}

// ── Completion Screen ───────────────────────────────────────────────────────

function showCompletion(ariResult, supabaseResult) {
  console.log('');
  drawBox([
    '',
    green('Installation Complete!'),
    '',
  ]);
  console.log('');

  const ariStart = PLATFORM === 'win32' ? '.\\ari.cmd start' : './ari start';
  const ariStartVerbose = PLATFORM === 'win32' ? '.\\ari.cmd start --verbose' : './ari start --verbose';
  const ariStop = PLATFORM === 'win32' ? '.\\ari.cmd stop' : './ari stop';

  if (ariResult && ariResult.dir) {
    console.log(`  To start ARI, navigate to the directory where you installed ARI and run:`);
    console.log('');
    console.log(`    ${DIM_BLUE}${ariStart}${RESET}`);
    console.log('');
    console.log(`  Or if you prefer to see full server logs, run it in verbose mode:`);
    console.log('');
    console.log(`    ${DIM_BLUE}${ariStartVerbose}${RESET}`);
    console.log('');
    console.log(`  Then open ${blue('http://localhost:3000')}`);
    console.log('');
    console.log(`  To stop ARI, press Ctrl+C and run:`);
    console.log('');
    console.log(`    ${DIM_BLUE}${ariStop}${RESET}`);

  } else {
    console.log(`  Clone ARI manually and run:`);
    console.log('');
    console.log(`    ${DIM_BLUE}git clone${ARI_BRANCH !== 'main' ? ` --branch ${ARI_BRANCH}` : ''} https://github.com/ARIsoftware/ARI.git${RESET}`);
    console.log(`    ${DIM_BLUE}cd ARI${RESET}`);
    console.log(`    ${DIM_BLUE}pnpm install${RESET}`);
    console.log(`    ${DIM_BLUE}${ariStart}${RESET}`);
  }

  if (PLATFORM === 'win32' && supabaseResult && supabaseResult.dbCreated) {
    console.log('');
    console.log(`  ${dim('Postgres password is saved in .env.local (DATABASE_URL).')}`);
  }

  console.log('');
  if (supabaseResult && supabaseResult.supabaseStarted) {
    console.log(`  ${dim('Supabase Studio:')} ${blue('http://127.0.0.1:54323')}`);
  }
  console.log(`  ${dim('Need help? hello@ari.software')}`);
  console.log('');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Platform check
  if (!['darwin', 'linux', 'win32'].includes(PLATFORM)) {
    console.log(`\n  ${SYM_CROSS} ${red(`Unsupported platform: ${PLATFORM}`)}`);
    console.log(`  See the README for setup instructions: https://github.com/ARIsoftware/ARI#readme\n`);
    process.exit(1);
  }

  // Non-interactive terminal check
  if (!process.stdin.isTTY) {
    console.log(`\n  ${SYM_CROSS} ${red('This installer requires an interactive terminal.')}`);
    console.log(`  Run it directly in your terminal (not piped).\n`);
    process.exit(1);
  }

  // SIGINT handler
  process.on('SIGINT', () => {
    process.stdout.write(SHOW_CURSOR);
    console.log(`\n\n  ${dim('Installation cancelled.')}\n`);
    process.exit(0);
  });

  // install.sh (bash, used on macOS + Linux) prints the logo and welcome text
  // before invoking node, so skip it here to avoid double-printing. install.ps1
  // does not, so on Windows we print it here.
  const parentPrintedWelcome = process.env.ARI_PLATFORM === 'darwin' || process.env.ARI_PLATFORM === 'linux';
  if (!parentPrintedWelcome) {
    showWelcome();
    await pressEnter('Ready to start? Press ENTER');
  }

  // Install tools
  const toolResults = await installTools();

  // Clone & setup
  const ariResult = await cloneAndSetup();

  // Database mode selection and setup (only if clone succeeded and deps installed)
  let dbResult = null;
  let dbMode = 'postgres';
  if (ariResult && ariResult.cloned && ariResult.depsInstalled) {
    dbMode = await chooseDatabaseMode();

    if (dbMode === 'postgres') {
      dbResult = await setupLocalPostgres(ariResult.dir);
    } else if (dbMode === 'supabaselocal') {
      dbResult = await setupLocalSupabase(ariResult.dir);
      writeInstallerEnvFile(ariResult.dir, { dbMode: 'supabaselocal' });
      console.log(`  ${SYM_CHECK} .env.local generated`);
    } else {
      // supabasecloud — user configures on /welcome
      writeInstallerEnvFile(ariResult.dir, { dbMode: 'supabasecloud' });
      console.log(`  ${SYM_CHECK} .env.local generated ${dim('(configure Supabase on /welcome)')}`);
      dbResult = {};
    }
  }

  // Verification
  runVerification(ariResult, dbResult);

  // Completion
  showCompletion(ariResult, dbResult);

  // Write install directory for the shell wrapper to cd into
  const dirFile = process.env.ARI_INSTALL_DIR_FILE;
  if (dirFile && ariResult && ariResult.dir) {
    try { fs.writeFileSync(dirFile, ariResult.dir); } catch (e) { /* best-effort */ }
  }

  process.stdout.write(SHOW_CURSOR);
  process.exit(0);
}

main().catch((err) => {
  process.stdout.write(SHOW_CURSOR);
  console.error(`\n  ${SYM_CROSS} ${red('Unexpected error:')}`);
  console.error(`  ${dim(err.message)}\n`);
  process.exit(1);
});
