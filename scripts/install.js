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

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

function runAsync(cmd) {
  return new Promise((resolve, reject) => {
    execCb(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
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
    process.stdout.write(HIDE_CURSOR);
    this.timer = setInterval(() => {
      const frame = `${BLUE}${this.frames[this.i]}${RESET}`;
      process.stdout.write(`\r  ${frame} ${this.text}`);
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
  // Logo and welcome text are shown by install.sh (bash) before Node.js runs.
  // When run directly via node (e.g. on Windows), show the logo here.
  if (!process.env.ARI_PLATFORM) {
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
  }

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
  const out = run('supabase --version');
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectClaudeCode() {
  const out = run('claude --version');
  return { installed: !!out, version: out ? parseVersion(out) : null };
}

function detectPsql() {
  // Check standard PATH first, then common Homebrew keg-only location
  const out = run('psql --version') || run('/opt/homebrew/opt/libpq/bin/psql --version');
  if (!out) return { installed: false, version: null };
  // psql outputs "psql (PostgreSQL) 18.3" — only two version parts, so parseVersion won't match
  const match = out.match(/(\d+\.\d+(?:\.\d+)?)/);
  return { installed: true, version: match ? match[1] : null };
}

function detectPgweb() {
  const out = run('pgweb --version');
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
    console.log(`  ${dim('Install Docker Desktop: https://www.docker.com/products/docker-desktop')}`);
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
      win32: 'winget install -e --id OpenJS.NodeJS.LTS',
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
      win32: 'winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements',
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
      win32: 'winget install -e --id GitHub.cli',
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
    name: 'Supabase CLI',
    required: true,
    installCmds: {
      darwin: 'brew install supabase/tap/supabase',
      fallback: 'npm install -g supabase',
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
      win32: 'winget install -e --id PostgreSQL.PostgreSQL',
    },
    detect: detectPostgresServer,
    description: 'Database server for ARI data storage.',
  },
  {
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
      win32: 'winget install -e --id PostgreSQL.psql',
    },
    detect: detectPsql,
    description: 'PostgreSQL client for database operations via Claude Code.',
  },
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

    const cmd = getInstallCmd(tool.installCmds);
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
    spinner.start(`Installing ${tool.name}…`);

    try {
      await runAsync(cmd);
      const after = tool.detect();
      spinner.success(`${tool.name} ${after.version ? `v${after.version}` : ''} installed`);
      results.push({ ...tool, status: 'installed', version: after.version });
    } catch (err) {
      spinner.error(`Failed to install ${tool.name}`);
      console.log(`  ${dim(err.message.split('\n').slice(0, 3).join('\n  '))}`);
      console.log('');
      console.log(`  ${dim('You can try running this manually:')}`);
      console.log(`  ${DIM_BLUE}${cmd}${RESET}`);
      results.push({ ...tool, status: 'failed', version: null });
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
    await runAsync(`cd "${targetDir}" && git remote rename origin upstream`);
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
    await spawnAsync('pnpm', ['install'], { stdio: 'inherit', cwd: targetDir });
    console.log('');
    console.log(`  ${SYM_CHECK} Dependencies installed`);
    return { cloned: true, dir: targetDir, depsInstalled: true };
  } catch (err) {
    console.log('');
    console.log(`  ${SYM_CROSS} ${red('Failed to install dependencies')}`);
    console.log(`  ${dim(err.message)}`);
    console.log('');
    console.log(`  ${dim('You can try running this manually:')}`);
    console.log(`  ${DIM_BLUE}cd "${targetDir}" && pnpm install${RESET}`);
    return { cloned: true, dir: targetDir, depsInstalled: false };
  }
}

// ── Local Supabase Setup ───────────────────────────────────────────────────

function parseSupabaseEnv(targetDir) {
  const raw = run(`cd "${targetDir}" && supabase status -o env`);
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
    // Fallback: try psql
    const psqlResult = run(`psql "${databaseUrl}" -f "${setupSqlPath}"`)
      || run(`/opt/homebrew/opt/libpq/bin/psql "${databaseUrl}" -f "${setupSqlPath}"`);
    if (psqlResult !== null) return true;
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

  // Ensure Homebrew's keg-only PostgreSQL binaries are in PATH (macOS)
  if (PLATFORM === 'darwin') {
    const brewPgBin = '/opt/homebrew/opt/postgresql@17/bin';
    const brewPgBinIntel = '/usr/local/opt/postgresql@17/bin';
    const pathEntries = process.env.PATH.split(':');
    if (fs.existsSync(brewPgBin) && !pathEntries.includes(brewPgBin)) {
      process.env.PATH = `${brewPgBin}:${process.env.PATH}`;
    } else if (fs.existsSync(brewPgBinIntel) && !pathEntries.includes(brewPgBinIntel)) {
      process.env.PATH = `${brewPgBinIntel}:${process.env.PATH}`;
    }
  }

  // 1. Check if PostgreSQL is running
  const pgReady = run('pg_isready -q') !== null;

  if (!pgReady) {
    console.log(`  ${SYM_DASH} PostgreSQL is not running. Attempting to start…`);
    if (PLATFORM === 'darwin') {
      run('brew services start postgresql@17');
    } else {
      run('sudo systemctl start postgresql');
    }
    // Re-check
    const now = run('pg_isready -q') !== null;
    if (!now) {
      console.log(`  ${SYM_CROSS} ${red('Could not start PostgreSQL.')}`);
      if (PLATFORM === 'darwin') {
        console.log(`  ${dim('Try: brew services start postgresql@17')}`);
        console.log(`  ${dim('You may need to add PostgreSQL to your PATH:')}`);
        console.log(`  ${dim('export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"')}`);
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

  const isLinux = PLATFORM === 'linux';
  const dbListCmd = isLinux ? 'sudo -u postgres psql -lqt' : 'psql -lqt';
  const dbList = run(dbListCmd) || '';
  const dbExists = dbList.split('\n').some(line => line.trim().startsWith('ari ') || line.trim().startsWith('ari|'));

  if (dbExists) {
    spinner.success('Database "ari" already exists');
  } else {
    const createCmd = isLinux ? 'sudo -u postgres createdb ari' : 'createdb ari';
    const createResult = run(createCmd);
    if (createResult === null) {
      spinner.error('Failed to create database "ari"');
      console.log(`  ${dim('Try manually: ' + createCmd)}`);
      return result;
    }
    spinner.success('Database "ari" created');
  }
  result.dbCreated = true;

  // 3. Determine DATABASE_URL
  const dbUrl = isLinux
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
  const alreadyRunning = !!run(`cd "${targetDir}" && supabase status 2>/dev/null | grep "API URL"`);

  if (alreadyRunning) {
    console.log(`  ${SYM_CHECK} Supabase is already running`);
    result.supabaseStarted = true;
  } else {
    console.log('');
    console.log(`  ${dim('Starting Supabase (first run downloads images — this may take a few minutes)…')}`);
    console.log('');
    try {
      await spawnAsync('supabase', ['start'], { stdio: 'inherit', cwd: targetDir });
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
    console.log(`  ${dim('You can run it manually via Supabase Studio:')}`);
    console.log(`  ${DIM_BLUE}http://127.0.0.1:54323${RESET}`);
  }

  return result;
}

// ── Verification Tests ──────────────────────────────────────────────────────

function runVerification(ariResult, supabaseResult) {
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

  if (ariResult && ariResult.dir) {
    console.log(`  To start ARI, navigate to the directory where you installed ARI and run:`);
    console.log('');
    console.log(`    ${DIM_BLUE}./ari start${RESET}`);
    console.log('');
    console.log(`  Or prefer a cleaner terminal with fewer logs? Run in quiet mode:`);
    console.log('');
    console.log(`    ${DIM_BLUE}./ari startquiet${RESET}`);
    console.log('');
    console.log(`  Then open ${blue('http://localhost:3000')}`);
    console.log('');
    console.log(`  To stop ARI, press Ctrl+C and run:`);
    console.log('');
    console.log(`    ${DIM_BLUE}./ari stop${RESET}`);

  } else {
    console.log(`  Clone ARI manually and run:`);
    console.log('');
    console.log(`    ${DIM_BLUE}git clone${ARI_BRANCH !== 'main' ? ` --branch ${ARI_BRANCH}` : ''} https://github.com/ARIsoftware/ARI.git${RESET}`);
    console.log(`    ${DIM_BLUE}cd ARI${RESET}`);
    console.log(`    ${DIM_BLUE}pnpm install${RESET}`);
    console.log(`    ${DIM_BLUE}./ari start${RESET}`);
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

  // Welcome screen (skip if install.sh already showed it)
  if (!process.env.ARI_PLATFORM) {
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
