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
printf "    ${DIM}○${RESET}  ${BOLD}PostgreSQL Client${RESET}  ${DIM}— database operations (optional)${RESET}\n\n"
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
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
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

# ── Hand off to install.js ───────────────────────────────────────────────────
INSTALL_JS="/tmp/ari-install-$$.js"
INSTALL_URL="https://raw.githubusercontent.com/ARIsoftware/ARI/main/scripts/install.js"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd 2>/dev/null)" || SCRIPT_DIR=""
LOCAL_JS="${SCRIPT_DIR:+$SCRIPT_DIR/install.js}"

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
