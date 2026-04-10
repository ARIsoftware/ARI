# ARI.Software

**Premier Personal Productivity.**

Open Source. Self-Hosted. Full Data Control. Fully Extendable. AI Native. Dozens of Built-In Modules And Build Your Own In Minutes. No Coding Required.

Engineered for those who want complete command over the software that runs their life. The first AI-enabled No Code workspace that can be completely customized to your workflow and grows with you. Build entirely new modules in minutes. Where mastery, modularity, and AI work in your favour so you can do your best work and live your best life.

https://ari.software


## Quick Start (Recommended)

Install ARI and all its dependencies with a single command:

**macOS / Linux:**
```bash
/bin/bash -c "$(curl -fsSL https://ari.software/install)"
```

**Windows** (PowerShell):
```powershell
irm https://ari.software/install-win | iex
```

The installer will:
1. Install required tools (Git, Node.js, pnpm, Supabase CLI, etc.)
2. Clone the ARI repository
3. Install dependencies
4. Set up a local Supabase database (requires [Docker](https://www.docker.com/products/docker-desktop))
5. Initialize the database schema
6. Create the `./ari` CLI for daily use

After installation:

```bash
cd ~/ARI
./ari start     # Start Supabase + dev server
```

Then open http://localhost:3000

When you're done:

```
Ctrl+C          # Stop the dev server
./ari stop      # Stop Supabase containers
```

---

## Requirements

- **Node.js** v18+
- **pnpm** (package manager)
- **Git**
- **Docker** (for local Supabase database)
- **Supabase CLI**

The automated installer handles all of these. See the Manual Setup section below if you prefer to install them yourself.

---

## Daily Usage

```bash
./ari start     # Check Docker, start Supabase, start dev server
./ari stop      # Stop Supabase containers
./ari status    # Show Supabase status
```

`./ari start` regenerates `.env.supabase.local` on every run to keep Supabase connection details fresh while preserving your auth secret and admin credentials.

On Windows, use `.\ari.cmd` instead of `./ari`.

---

## Manual Setup

If you prefer not to use the automated installer, follow the steps below for your platform.

### Prerequisites

1. [Node.js](https://nodejs.org) v18+
2. [pnpm](https://pnpm.io)
3. [Git](https://git-scm.com)
4. [Docker](https://www.docker.com/products/docker-desktop) (for local Supabase)
5. [Supabase CLI](https://supabase.com/docs/guides/cli)
6. [Vercel CLI](https://vercel.com/docs/cli) (optional, for deployment)

### macOS

```bash
# Install Homebrew (if needed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install tools
brew install git node pnpm supabase/tap/supabase

# Clone and install
git clone https://github.com/ARIsoftware/ARI.git
cd ARI
pnpm install

# Start local Supabase (requires Docker)
supabase start

# Start ARI
pnpm run dev
```

### Windows

```powershell
# Install tools via winget
winget install Git.Git
winget install OpenJS.NodeJS.LTS
npm install -g pnpm

# Install Supabase CLI via Scoop
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Clone and install
git clone https://github.com/ARIsoftware/ARI.git
cd ARI
pnpm install

# Start local Supabase (requires Docker)
supabase start

# Start ARI
pnpm run dev
```

### Linux (Debian/Ubuntu)

> Adjust commands for your distribution (e.g., `dnf` for Fedora, `pacman` for Arch).

```bash
# Install tools
sudo apt update
sudo apt install git -y
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install nodejs -y
npm install -g pnpm supabase

# Clone and install
git clone https://github.com/ARIsoftware/ARI.git
cd ARI
pnpm install

# Start local Supabase (requires Docker)
supabase start

# Start ARI
pnpm run dev
```

### After Manual Setup

Open http://localhost:3000 in your browser.

The first time you run ARI, you'll need a `.env.supabase.local` file with your local Supabase credentials. Run `supabase status -o env` to see the values, then create the file:

```env
NEXT_PUBLIC_SUPABASE_URL=<API_URL from supabase status>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from supabase status>
DATABASE_URL=<DB_URL from supabase status>
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
ARI_FIRST_RUN_ADMIN_EMAIL=local@ari.software
ARI_FIRST_RUN_ADMIN_PASSWORD=<choose a password, minimum 18 characters>
```

You'll also need to run the database setup SQL against your local database:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f lib/db/setup.sql
```

The automated installer (`./ari start`) handles all of this automatically.

---

## Module Library & Backend API

ARI connects to a backend API for module discovery, license validation, and module downloads. The backend is open source and stored in a separate repository: [ARIsoftware/ARI-Modules](https://github.com/ARIsoftware/ARI-Modules).

**Base URL:** `https://api.ari.software`

### Endpoints

Both endpoints accept `POST` requests with `Content-Type: application/json`.

#### `POST /modules/library`

Returns the module catalog and license validation status.

```json
{
  "license_key": "XXXXX-XXXXX-XXXXX",
  "client_info": {
    "ari_version": "1.0.0",
    "platform": "darwin",
    "timestamp": "2026-03-09T12:00:00Z"
  }
}
```

Response:

```json
{
  "valid_license": true,
  "modules": [
    {
      "name": "module-name",
      "title": "Module Title",
      "description": "What this module does",
      "access": "free",
      "latest_version": "1.0.0",
      "download_enabled": true,
      "locked": false
    }
  ]
}
```

#### `POST /modules/download`

Returns a presigned download URL (expires in 120 seconds). The downloaded `.zip` file is extracted to `modules-core/{module-name}/`.

```json
{
  "module": "module-name",
  "version": "1.0.0",
  "license_key": "XXXXX-XXXXX-XXXXX",
  "client_info": {
    "ari_version": "1.0.0"
  }
}
```

Response:

```json
{
  "ok": true,
  "download_url": "https://..."
}
```

### License Key

Users can activate a license key in the UI on the Modules or Module Library page. Alternatively, set the `ARI_LICENSE_KEY` environment variable in `.env.local` (or Vercel environment variables) to pre-fill the license key automatically.

### Rate Limits

- 60 requests/minute per IP
- 10 downloads/minute per license key
- 10 license validation attempts/minute per IP

For full API documentation, see `FRONTEND_INTEGRATION.md` in the [ARI-Modules](https://github.com/ARIsoftware/ARI-Modules) repository.

---

## 🤝 Need Help?

Reach out to us at hello@ari.software


