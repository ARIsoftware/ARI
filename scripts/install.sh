#!/usr/bin/env bash
#
# ARI Installer — Bash Bootstrapper (macOS + Linux)
# Installs prerequisites (package manager + Node.js), then hands off to install.js.
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
DIM='\033[2m'
RESET='\033[0m'

info()  { printf "${BLUE}%s${RESET}\n" "$1"; }
ok()    { printf "${GREEN}✔${RESET} %s\n" "$1"; }
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
DIM='\033[2m'
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
fi

# ── Node.js ──────────────────────────────────────────────────────────────────
install_node() {
  info "Node.js (v18+) is required but not installed or outdated."
  printf "  Node.js is the JavaScript runtime that powers ARI.\n\n"

  if [[ "$ARI_PLATFORM" == "darwin" ]]; then
    read -rp "  Install Node.js via Homebrew? [Y/n] " yn
    yn="${yn:-Y}"
    if [[ "$yn" =~ ^[Yy] ]]; then
      brew install node
      ok "Node.js installed"
    else
      err "Node.js v18+ is required. Cannot continue without it."
      exit 1
    fi

  elif [[ "$ARI_PLATFORM" == "linux" ]]; then
    case "$ARI_PKG_MGR" in
      apt)
        read -rp "  Install Node.js via NodeSource LTS? [Y/n] " yn
        yn="${yn:-Y}"
        if [[ "$yn" =~ ^[Yy] ]]; then
          # NodeSource setup for LTS
          curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
          sudo apt-get install -y nodejs
          ok "Node.js installed"
        else
          err "Node.js v18+ is required. Cannot continue without it."
          exit 1
        fi
        ;;
      dnf)
        read -rp "  Install Node.js via dnf? [Y/n] " yn
        yn="${yn:-Y}"
        if [[ "$yn" =~ ^[Yy] ]]; then
          sudo dnf install -y nodejs
          ok "Node.js installed"
        else
          err "Node.js v18+ is required. Cannot continue without it."
          exit 1
        fi
        ;;
      pacman)
        read -rp "  Install Node.js via pacman? [Y/n] " yn
        yn="${yn:-Y}"
        if [[ "$yn" =~ ^[Yy] ]]; then
          sudo pacman -S --noconfirm nodejs npm
          ok "Node.js installed"
        else
          err "Node.js v18+ is required. Cannot continue without it."
          exit 1
        fi
        ;;
      zypper)
        read -rp "  Install Node.js via zypper? [Y/n] " yn
        yn="${yn:-Y}"
        if [[ "$yn" =~ ^[Yy] ]]; then
          sudo zypper install -y nodejs
          ok "Node.js installed"
        else
          err "Node.js v18+ is required. Cannot continue without it."
          exit 1
        fi
        ;;
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

# ── Hand off to install.js ───────────────────────────────────────────────────
INSTALL_JS="/tmp/ari-install-$$.js"
INSTALL_URL="https://raw.githubusercontent.com/ARIsoftware/ARI/main/scripts/install.js"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_JS="$SCRIPT_DIR/install.js"

if curl -fsSL "$INSTALL_URL" -o "$INSTALL_JS" 2>/dev/null; then
  : # Downloaded successfully
elif [[ -f "$LOCAL_JS" ]]; then
  cp "$LOCAL_JS" "$INSTALL_JS"
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
