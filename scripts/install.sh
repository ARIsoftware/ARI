#!/usr/bin/env bash
#
# ARI Installer — Bash Bootstrapper
# Installs Homebrew + Node.js (minimum to run install.js), then hands off to Node.
#
# Usage:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/ARIsoftware/ARI/main/scripts/install.sh)"
#

set -euo pipefail

# Colors
BLUE='\033[1;34m'
GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

info()  { printf "${BLUE}%s${RESET}\n" "$1"; }
ok()    { printf "${GREEN}✔${RESET} %s\n" "$1"; }
warn()  { printf "${YELLOW}⚠${RESET} %s\n" "$1"; }
err()   { printf "${RED}✘${RESET} %s\n" "$1"; }

# ── macOS check ──────────────────────────────────────────────────────────────
if [[ "$(uname -s)" != "Darwin" ]]; then
  err "This installer is for macOS only."
  echo "See the README for Windows and Linux instructions:"
  echo "  https://github.com/ARIsoftware/ARI#readme"
  exit 1
fi

printf "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BLUE}  ARI Setup — Bootstrapping Environment${RESET}\n"
printf "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

# ── Homebrew ─────────────────────────────────────────────────────────────────
BREW_BIN=""
if command -v brew &>/dev/null; then
  BREW_BIN="$(command -v brew)"
elif [[ -x /opt/homebrew/bin/brew ]]; then
  BREW_BIN="/opt/homebrew/bin/brew"
elif [[ -x /usr/local/bin/brew ]]; then
  BREW_BIN="/usr/local/bin/brew"
fi

if [[ -n "$BREW_BIN" ]]; then
  ok "Homebrew found at $BREW_BIN"
  eval "$("$BREW_BIN" shellenv)" 2>/dev/null || true
else
  info "Homebrew is required but not installed."
  printf "  Homebrew is the standard macOS package manager used to install developer tools.\n\n"
  read -rp "  Install Homebrew? [Y/n] " yn
  yn="${yn:-Y}"
  if [[ "$yn" =~ ^[Yy] ]]; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH for this session (Apple Silicon)
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
    ok "Homebrew installed"
  else
    err "Homebrew is required. Cannot continue without it."
    exit 1
  fi
fi

# ── Node.js ──────────────────────────────────────────────────────────────────
install_node() {
  info "Node.js (v18+) is required but not installed or outdated."
  printf "  Node.js is the JavaScript runtime that powers ARI.\n\n"
  read -rp "  Install Node.js via Homebrew? [Y/n] " yn
  yn="${yn:-Y}"
  if [[ "$yn" =~ ^[Yy] ]]; then
    brew install node
    ok "Node.js installed"
  else
    err "Node.js v18+ is required. Cannot continue without it."
    exit 1
  fi
}

if command -v node &>/dev/null; then
  NODE_VER="$(node --version 2>/dev/null | sed 's/^v//')"
  NODE_MAJOR="${NODE_VER%%.*}"
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    ok "Node.js v${NODE_VER} found"
  else
    warn "Node.js v${NODE_VER} found but v18+ is required."
    install_node
  fi
else
  install_node
fi

# ── Hand off to install.js ───────────────────────────────────────────────────
INSTALL_JS="/tmp/ari-install-$$.js"
INSTALL_URL="https://raw.githubusercontent.com/ARIsoftware/ARI/main/scripts/install.js"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_JS="$SCRIPT_DIR/install.js"

info "Downloading installer…"
if curl -fsSL "$INSTALL_URL" -o "$INSTALL_JS" 2>/dev/null; then
  ok "Installer downloaded"
elif [[ -f "$LOCAL_JS" ]]; then
  cp "$LOCAL_JS" "$INSTALL_JS"
  ok "Using local installer (${LOCAL_JS})"
else
  err "Failed to download install.js and no local copy found."
  rm -f "$INSTALL_JS"
  exit 1
fi

echo ""
node "$INSTALL_JS"
EXIT_CODE=$?
rm -f "$INSTALL_JS"
exit $EXIT_CODE
