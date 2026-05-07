#!/usr/bin/env node

/**
 * ARI CLI — Local development helper
 * Usage: ./ari start | stop | status | update
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.supabase.local');
const PGWEB_PID_FILE = path.join(ROOT, '.ari', 'pgweb.pid');
const PGWEB_PORT = 5050;

// ── Helpers ────────────────────────────────────────────────────────────────

const YELLOW = '\x1b[1;33m';
const GREEN = '\x1b[1;32m';
const RED = '\x1b[1;31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', cwd: ROOT }).trim();
  } catch {
    return null;
  }
}

function getDbMode() {
  // Check .env.local for ARI_DB_MODE
  const envPath = path.join(ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^ARI_DB_MODE=["']?([^"'\s]+)["']?$/m);
    if (match) return match[1];
  }
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
  const content = [
    'NEXT_PUBLIC_SUPABASE_URL=' + (supabaseVars.API_URL || ''),
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=' + (supabaseVars.ANON_KEY || ''),
    'SUPABASE_SERVICE_ROLE_KEY=' + (supabaseVars.SERVICE_ROLE_KEY || ''),
    'DATABASE_URL=' + (supabaseVars.DB_URL || ''),
    '',
  ].join('\n');

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

function getDatabaseUrl() {
  const envPath = path.join(ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^DATABASE_URL=["']?([^"'\s]+)["']?$/m);
    if (match) return match[1];
  }
  return null;
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

function startPgweb() {
  if (!run('command -v pgweb')) {
    console.log('  ' + DIM + 'pgweb not installed — skip database UI' + RESET);
    console.log('  ' + DIM + 'Install with: brew install pgweb' + RESET);
    return;
  }

  if (isPgwebRunning()) {
    console.log('  ' + GREEN + '✔' + RESET + ' pgweb is already running ' + DIM + `http://localhost:${PGWEB_PORT}` + RESET);
    return;
  }

  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.log('  ' + YELLOW + '⚠' + RESET + ' No DATABASE_URL found — skipping pgweb');
    return;
  }

  const child = spawn('pgweb', [
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
  console.log('  ' + GREEN + '✔' + RESET + ' pgweb started ' + DIM + `http://localhost:${PGWEB_PORT}` + RESET);
}

function stopPgweb() {
  if (!isPgwebRunning()) return false;
  const pid = fs.readFileSync(PGWEB_PID_FILE, 'utf8').trim();
  try {
    process.kill(Number(pid), 'SIGTERM');
    try { fs.unlinkSync(PGWEB_PID_FILE); } catch {}
    console.log('  ' + GREEN + '✔' + RESET + ' pgweb stopped');
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

function ensureMacPostgresPath() {
  if (process.platform !== 'darwin') return;
  const brewPgBin = '/opt/homebrew/opt/postgresql@17/bin';
  const brewPgBinIntel = '/usr/local/opt/postgresql@17/bin';
  const pathEntries = process.env.PATH.split(':');
  if (fs.existsSync(brewPgBin) && !pathEntries.includes(brewPgBin)) {
    process.env.PATH = `${brewPgBin}:${process.env.PATH}`;
  } else if (fs.existsSync(brewPgBinIntel) && !pathEntries.includes(brewPgBinIntel)) {
    process.env.PATH = `${brewPgBinIntel}:${process.env.PATH}`;
  }
}

function startDefault() {
  return start({ quiet: !process.argv.includes('--verbose') });
}

function start(opts = {}) {
  const mode = getDbMode();
  const quiet = !!opts.quiet;
  const log = (...args) => { if (!quiet) console.log(...args); };

  // Spinner — only used in quiet mode
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIdx = 0;
  let spinnerTimer = null;
  let spinnerLabel = 'Starting ARI';
  function startSpinner(label) {
    if (!quiet || spinnerTimer) return;
    spinnerLabel = label || spinnerLabel;
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

  fs.mkdirSync(path.join(ROOT, 'data', 'storage'), { recursive: true });

  const updateCheck = checkForUpdates();

  if (quiet) startSpinner('Starting ARI');

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
    ensureMacPostgresPath();
    const pgReady = run('pg_isready -q') !== null;
    if (pgReady) {
      log('  ' + GREEN + '✔' + RESET + ' PostgreSQL is running');
      if (!quiet) startPgweb();
    } else {
      log('  ' + YELLOW + '⚠' + RESET + ' PostgreSQL is not running.');
      if (process.platform === 'darwin') {
        log('  ' + DIM + 'Start it with: brew services start postgresql@17' + RESET);
      } else {
        log('  ' + DIM + 'Start it with: sudo systemctl start postgresql' + RESET);
      }
    }
  } else {
    // supabasecloud — no local DB to manage
    log('  ' + DIM + 'Cloud database mode — no local database to start' + RESET);
  }

  log('');

  // Start Next.js dev server — pipe stdout (and stderr in quiet mode) so we can suppress.
  const child = spawn('pnpm', ['dev'], {
    stdio: ['inherit', 'pipe', quiet ? 'pipe' : 'inherit'],
    cwd: ROOT,
  });
  if (quiet && child.stderr) child.stderr.on('data', () => {}); // drain

  // Next.js prints "Local:" before any route is compiled, so opening the
  // browser immediately shows a 2-3s white page while routes JIT-compile.
  // We GET the URL first (following redirects) to force compilation of the
  // landing route, then open the browser to a ready page.
  let browserScheduled = false;
  function openBrowser(url) {
    if (process.platform === 'darwin') run(`open ${url}`);
    else if (process.platform === 'linux') run(`xdg-open ${url}`);
    else if (process.platform === 'win32') run(`start ${url}`);
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

  child.stdout.on('data', (data) => {
    const text = data.toString();

    if (!browserScheduled) {
      const match = text.match(/Local:\s+(http:\/\/localhost:\d+)/);
      if (match) {
        browserScheduled = true;
        const url = match[1];
        waitForReady(url).then(async () => {
          openBrowser(url);
          const updateAvailable = await updateCheck;
          if (quiet) {
            stopSpinner('  ' + GREEN + '✔' + RESET + ' ARI is running at ' + DIM + url + RESET);
          }
          if (updateAvailable) {
            const line = '  ↑ ARI update available  ' + DIM + UPDATE_DOCS_URL + RESET + '\n';
            process.stdout.write(quiet ? line : '\n' + line + '\n');
          }
          if (quiet) {
            process.stdout.write('    ' + DIM + 'Press Ctrl+C to stop ARI.' + RESET + '\n');
          }
        });
      }
    }

    if (!quiet) process.stdout.write(data);
    // In quiet mode, all child stdout is dropped.
  });

  const cleanup = () => {
    stopSpinner();
    child.kill();
    if (mode === 'postgres') stopPgweb();
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

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

async function stop() {
  const mode = getDbMode();

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
    ensureMacPostgresPath();
    stopPgweb();
    const pgReady = run('pg_isready -q') !== null;
    if (pgReady) {
      const answer = await ask('  Your PostgreSQL database is running. Stop it now? (Y/n) ');
      if (!answer || answer.toLowerCase() === 'y') {
        if (process.platform === 'darwin') {
          run('brew services stop postgresql@17');
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
    ensureMacPostgresPath();
    const pgReady = run('pg_isready -q') !== null;
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
    console.log('  ' + DIM + 'Tip: keep customizations in modules-custom/ to avoid conflicts.' + RESET);
    process.exit(1);
  }
  console.log('  ' + GREEN + '✔' + RESET + ' Code updated');

  // Install dependencies
  console.log('  Installing dependencies...');
  try {
    execSync('pnpm install', { stdio: 'inherit', cwd: ROOT });
  } catch {
    console.log('  ' + RED + '✘' + RESET + ' pnpm install failed');
    process.exit(1);
  }
  console.log('  ' + GREEN + '✔' + RESET + ' Dependencies installed');

  console.log('');
  console.log('  ' + GREEN + 'Update complete!' + RESET + ' Run ' + DIM + './ari start' + RESET + ' to launch.');
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const commands = { start: startDefault, startquiet: startDefault, stop, status, update };

if (!cmd || !commands[cmd]) {
  console.log('');
  console.log('  Usage: ./ari <command>');
  console.log('');
  console.log('  Commands:');
  console.log('    start              Start database + dev server (hides logs)');
  console.log('    start --verbose    Same as start, but shows full server logs');
  console.log('    startquiet         Alias for start (kept for backwards compatibility)');
  console.log('    stop               Stop database services');
  console.log('    status             Show database status');
  console.log('    update             Pull latest ARI updates + install dependencies');
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
