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

## 🤝 Need Help?

Reach out to us at hello@ari.software


