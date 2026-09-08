#!/usr/bin/env bash
#
# ARI Installer — Bash Bootstrapper (macOS + Linux)
# Installs prerequisites (package manager + Node.js), then hands off to install.js.
#
# Usage:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/ARIsoftware/ARI/main/scripts/install.sh)"
#
# To install from a specific branch:
#   ARI_BRANCH=develop /bin/bash -c "$(curl -fsSL https://ari.software/install)"
#

set -euo pipefail

# Colors
RED='\033[1;31m'
YELLOW='\033[1;33m'
DIM='\033[2m'
RESET='\033[0m'

warn()  { printf "${YELLOW}⚠${RESET} %s\n" "$1"; }
err()   { printf "${RED}✘${RESET} %s\n" "$1"; }

# ── Platform detection ───────────────────────────────────────────────────────
OS_NAME="$(uname -s)"

case "$OS_NAME" in
  Darwin) ARI_PLATFORM="darwin" ;;
  Linux)  ARI_PLATFORM="linux"  ;;
  *)
    err "Unsupported operating system: $OS_NAME"
    echo "  See the README for setup instructions:"
    echo "  https://github.com/ARIsoftware/ARI#readme"
    exit 1
    ;;
esac

# ── Linux package manager detection ─────────────────────────────────────────
ARI_PKG_MGR=""

if [[ "$ARI_PLATFORM" == "linux" ]]; then
  if command -v apt-get &>/dev/null; then
    ARI_PKG_MGR="apt"
  elif command -v dnf &>/dev/null; then
    ARI_PKG_MGR="dnf"
  elif command -v pacman &>/dev/null; then
    ARI_PKG_MGR="pacman"
  elif command -v zypper &>/dev/null; then
    ARI_PKG_MGR="zypper"
  else
    warn "No supported package manager found (apt, dnf, pacman, zypper)."
    warn "You may need to install Node.js manually."
    ARI_PKG_MGR="unknown"
  fi
elif [[ "$ARI_PLATFORM" == "darwin" ]]; then
  ARI_PKG_MGR="brew"
fi

export ARI_PLATFORM ARI_PKG_MGR

# ── Show ARI logo and welcome ────────────────────────────────────────────────
CYAN='\033[1;36m'
BOLD='\033[1m'

echo ""
printf "  ${CYAN}╔═══╗   ╔════╗   ═╗${RESET}\n"
printf "  ${CYAN}║   ║   ║    ║    ║${RESET}\n"
printf "  ${CYAN}╠═══╣   ╠════╝    ║${RESET}\n"
printf "  ${CYAN}║   ║   ║  ╚═╗    ║${RESET}\n"
printf "  ${CYAN}╩   ╩   ╩    ╩   ═╩═${RESET}\n"
echo ""
printf "  ${DIM}P R E M I E R   P E R S O N A L   P R O D U C T I V I T Y${RESET}\n"
echo ""
printf "  Platform: ${BOLD}${ARI_PLATFORM}${RESET}\n"
echo ""
printf "  Welcome to ARI. Engineered for those who want complete command over the\n"
printf "  software that runs their life. The first AI-enabled No Code workspace that\n"
printf "  can be completely customized to your workflow and grows with you. Build\n"
printf "  entirely new modules in minutes. Where mastery, modularity, and AI work in\n"
printf "  your favour so you can do your best work and live your best life.\n"
echo ""
echo ""
printf "  This installer will set up everything you need to run ARI. The installer is\n"
printf "  open source as can be viewed on our Github repo.\n"
printf "  Need help? https://ari.software/docs\n"
echo ""
if [[ "$ARI_PLATFORM" == "darwin" ]]; then
  printf "    ${DIM}○${RESET}  ${BOLD}Homebrew${RESET}  ${DIM}— macOS package manager${RESET}\n\n"
fi
printf "    ${DIM}○${RESET}  ${BOLD}Node.js${RESET}  ${DIM}— JavaScript runtime${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}Git${RESET}  ${DIM}— version control${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}GitHub CLI${RESET}  ${DIM}— repository management${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}pnpm${RESET}  ${DIM}— package manager${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}Vercel CLI${RESET}  ${DIM}— deployment (optional)${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}Supabase CLI${RESET}  ${DIM}— database tools${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}PostgreSQL Server${RESET}  ${DIM}— database engine${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}PostgreSQL Client${RESET}  ${DIM}— database operations (optional)${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}pgweb${RESET}  ${DIM}— database UI (localhost:5050)${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}Claude Code${RESET}  ${DIM}— AI coding assistant${RESET}\n\n"
printf "    ${DIM}○${RESET}  ${BOLD}ARI${RESET}  ${DIM}— clone repo & install dependencies${RESET}\n"
echo ""
if [[ -t 0 ]] || [[ -e /dev/tty ]]; then
  read -rp "  Ready to start? Press ENTER " _ </dev/tty
fi
echo ""

# ── Homebrew (macOS only) ────────────────────────────────────────────────────
if [[ "$ARI_PLATFORM" == "darwin" ]]; then
  BREW_BIN=""
  if command -v brew &>/dev/null; then
    BREW_BIN="$(command -v brew)"
  elif [[ -x /opt/homebrew/bin/brew ]]; then
    BREW_BIN="/opt/homebrew/bin/brew"
  elif [[ -x /usr/local/bin/brew ]]; then
    BREW_BIN="/usr/local/bin/brew"
  fi

  if [[ -n "$BREW_BIN" ]]; then
    eval "$("$BREW_BIN" shellenv)" 2>/dev/null || true
  else
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH for this session (Apple Silicon)
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
fi

# ── Node.js ──────────────────────────────────────────────────────────────────
install_node() {
  if [[ "$ARI_PLATFORM" == "darwin" ]]; then
    brew install node
  elif [[ "$ARI_PLATFORM" == "linux" ]]; then
    case "$ARI_PKG_MGR" in
      apt)
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo bash -
        sudo apt-get install -y nodejs
        ;;
      dnf)    sudo dnf install -y nodejs ;;
      pacman) sudo pacman -S --noconfirm nodejs npm ;;
      zypper) sudo zypper install -y nodejs ;;
      *)
        err "No supported package manager found."
        echo "  Please install Node.js v18+ manually: https://nodejs.org"
        exit 1
        ;;
    esac
  fi
}

if command -v node &>/dev/null; then
  NODE_VER="$(node --version 2>/dev/null | sed 's/^v//')"
  NODE_MAJOR="${NODE_VER%%.*}"
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    : # Node.js is sufficient, continue silently
  else
    warn "Node.js v${NODE_VER} found but v18+ is required."
    install_node
  fi
else
  install_node
fi

# ── Hand off to the Node installer ──────────────────────────────────────────
# The installer is ESM (scripts/install.mjs) and must keep its .mjs extension
# when run from the temp dir — there's no package.json there to declare module
# type. Older branches only have a CJS scripts/install.js; fall back to that.

# ARI_BRANCH goes into a URL and a git command — allow only branch-name
# characters, and reject dot segments (../../other/repo would traverse the
# raw.githubusercontent path onto a different repository) and leading dashes.
ARI_BRANCH="${ARI_BRANCH:-main}"
if ! [[ "$ARI_BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || [[ "$ARI_BRANCH" == *..* ]]; then
  err "Invalid ARI_BRANCH: '$ARI_BRANCH'"
  exit 1
fi
export ARI_BRANCH

# Private 0700 scratch dir: predictable /tmp/ari-install-$$ names let another
# local user pre-create or symlink the path and swap contents between the
# download and the exec (mktemp names are unguessable and the dir is 0700).
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ari-install.XXXXXX")" || { err "mktemp failed"; exit 1; }
trap 'rm -rf "$WORK_DIR"' EXIT

INSTALL_DIR_FILE="$WORK_DIR/install-dir"
export ARI_INSTALL_DIR_FILE="$INSTALL_DIR_FILE"
INSTALL_MJS_URL="https://raw.githubusercontent.com/ARIsoftware/ARI/${ARI_BRANCH}/scripts/install.mjs"
INSTALL_JS_URL="https://raw.githubusercontent.com/ARIsoftware/ARI/${ARI_BRANCH}/scripts/install.js"
# Local fallback only for a real on-disk checkout (BASH_SOURCE set). When the
# one-liner pipes this script into bash, $0 is "bash" and dirname would
# resolve to the CURRENT DIRECTORY — executing whatever installer file happens
# to sit there is an attacker-planted-file hazard, so no cwd guessing.
SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null)" || SCRIPT_DIR=""
fi
LOCAL_MJS="${SCRIPT_DIR:+$SCRIPT_DIR/install.mjs}"
LOCAL_JS="${SCRIPT_DIR:+$SCRIPT_DIR/install.js}"

INSTALL_JS="$WORK_DIR/ari-install.mjs"
if curl -fsSL "$INSTALL_MJS_URL" -o "$INSTALL_JS" 2>/dev/null; then
  : # Downloaded the ESM installer
elif [[ -n "$LOCAL_MJS" && -f "$LOCAL_MJS" ]]; then
  cp "$LOCAL_MJS" "$INSTALL_JS"
else
  # Legacy fallback: branch predates install.mjs — fetch the CJS installer.
  rm -f "$INSTALL_JS"
  INSTALL_JS="$WORK_DIR/ari-install.js"
  if curl -fsSL "$INSTALL_JS_URL" -o "$INSTALL_JS" 2>/dev/null; then
    : # Downloaded successfully
  elif [[ -n "$LOCAL_JS" && -f "$LOCAL_JS" ]]; then
    cp "$LOCAL_JS" "$INSTALL_JS"
  else
    err "Failed to download the installer and no local copy found."
    exit 1
  fi
  # Safety net: if the .js turns out to be ESM, give it the .mjs extension.
  if grep -qE '^(import|export) ' "$INSTALL_JS"; then
    mv "$INSTALL_JS" "${INSTALL_JS%.js}.mjs"
    INSTALL_JS="${INSTALL_JS%.js}.mjs"
  fi
fi

echo ""
# `|| EXIT_CODE=$?` keeps set -e from killing the script here, so the cleanup
# trap and the cd-into-install-dir logic below always run.
EXIT_CODE=0
node "$INSTALL_JS" || EXIT_CODE=$?

# Read install directory written by the installer
INSTALL_DIR=""
if [[ -f "$INSTALL_DIR_FILE" ]]; then
  INSTALL_DIR="$(cat "$INSTALL_DIR_FILE")"
fi

# On success, switch into the install directory and start a fresh shell
if [[ $EXIT_CODE -eq 0 ]] && [[ -n "$INSTALL_DIR" ]] && [[ -d "$INSTALL_DIR" ]]; then
  unset ARI_PLATFORM ARI_PKG_MGR ARI_INSTALL_DIR_FILE
  cd "$INSTALL_DIR" || true
  exec "${SHELL:-bash}" -l
fi

exit $EXIT_CODE
