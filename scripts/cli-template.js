#!/usr/bin/env node

/**
 * ARI CLI — Local development helper
 * Usage: ./ari start | stop | status
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
    '--url', dbUrl,
  ], {
    stdio: 'ignore',
    detached: true,
    cwd: ROOT,
  });

  child.unref();
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

// ── Commands ───────────────────────────────────────────────────────────────

function start() {
  const mode = getDbMode();

  if (mode === 'supabaselocal') {
    // Check Docker — if unavailable, skip Supabase and start dev server only
    if (!isDockerRunning()) {
      console.log('  ' + YELLOW + '⚠' + RESET + ' Docker is not running — skipping local Supabase.');
      console.log('  ' + DIM + 'Configure your database connection in the setup wizard.' + RESET);
      console.log('');
    } else {
      // Start Supabase (idempotent)
      if (!isSupabaseRunning()) {
        console.log('  Starting Supabase...');
        try {
          execSync('supabase start', { stdio: 'inherit', cwd: ROOT });
        } catch {
          console.log('\n  ' + RED + '✘' + RESET + ' Failed to start Supabase.');
          process.exit(1);
        }
      } else {
        console.log('  ' + GREEN + '✔' + RESET + ' Supabase is already running');
      }

      // Regenerate env file
      const vars = parseSupabaseEnv();
      if (vars) {
        writeEnvFile(vars);
        console.log('  ' + GREEN + '✔' + RESET + ' .env.supabase.local updated');
      }
    }
  } else if (mode === 'postgres') {
    const pgReady = run('pg_isready -q') !== null;
    if (pgReady) {
      console.log('  ' + GREEN + '✔' + RESET + ' PostgreSQL is running');
      startPgweb();
    } else {
      console.log('  ' + YELLOW + '⚠' + RESET + ' PostgreSQL is not running.');
      if (process.platform === 'darwin') {
        console.log('  ' + DIM + 'Start it with: brew services start postgresql@17' + RESET);
      } else {
        console.log('  ' + DIM + 'Start it with: sudo systemctl start postgresql' + RESET);
      }
    }
  } else {
    // supabasecloud — no local DB to manage
    console.log('  ' + DIM + 'Cloud database mode — no local database to start' + RESET);
  }

  console.log('');

  // Start Next.js dev server (foreground)
  const child = spawn('pnpm', ['dev'], { stdio: 'inherit', cwd: ROOT });

  const cleanup = () => {
    child.kill();
    if (mode === 'postgres') stopPgweb();
    if (mode === 'supabaselocal') {
      console.log('\n  ' + DIM + 'Next.js stopped. Supabase containers are still running.' + RESET);
      console.log('  ' + DIM + 'Run ./ari stop to shut them down.' + RESET + '\n');
    } else {
      console.log('\n  ' + DIM + 'Next.js stopped.' + RESET + '\n');
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
    const pgReady = run('pg_isready -q') !== null;
    console.log('  PostgreSQL: ' + (pgReady ? GREEN + '✔ running' : RED + '✘ not reachable') + RESET);
    const pgwebUp = isPgwebRunning();
    console.log('  pgweb:      ' + (pgwebUp ? GREEN + '✔ running ' + DIM + 'http://localhost:' + PGWEB_PORT + RESET : DIM + '✘ not running' + RESET));
  } else {
    console.log('  ' + DIM + 'Cloud mode — database hosted on Supabase.com' + RESET);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const commands = { start, stop, status };

if (!cmd || !commands[cmd]) {
  console.log('');
  console.log('  Usage: ./ari <command>');
  console.log('');
  console.log('  Commands:');
  console.log('    start    Start database + dev server');
  console.log('    stop     Stop database services');
  console.log('    status   Show database status');
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
