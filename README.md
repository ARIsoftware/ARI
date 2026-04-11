# ARI.Software

**Premier Personal Productivity.**

Open Source. Self-Hosted. Full Data Control. Fully Extendable. AI Native. Dozens of Built-In Modules And Build Your Own In Minutes. No Coding Required.

Engineered for those who want complete command over the software that runs their life. The first AI-enabled No Code workspace that can be completely customized to your workflow and grows with you. Build entirely new modules in minutes. Where mastery, modularity, and AI work in your favour so you can do your best work and live your best life.

https://ari.software

## Requirements

ARI uses Docker for a self-contained Supabase database - local, secure, fast, and hassle-free. Download the free Docker Desktop app:
https://www.docker.com/products/docker-desktop/

When you run the ARI installer, it will automatically install all the required packages. See the Manual Setup section below if you prefer to install them yourself.

- **Node.js** v18+
- **pnpm** (package manager)
- **Git**
- **Docker** (for local Supabase database)
- **Supabase CLI**

## Quick Start (Recommended)

Install ARI with a single command:

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
7. Start ARI and the supabase database.

## Accessing ARI:
**To view ARI visit:** http://localhost:3000

**Access the Database Studio:** http://localhost:54323/

## Useful Commands:

When you want to start ARI, change into your ARI directory (`cd ~/ARI`) and then run:

```bash
./ari start
```

To view the status of ARI, run:

```bash
./ari status
```

When you want to stop ARI:

```
Ctrl+C          # Stop the dev server
./ari stop      # Stop Supabase containers
```

On Windows, use `.\ari.cmd start` `.\ari.cmd status` and `.\ari.cmd stop`

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


