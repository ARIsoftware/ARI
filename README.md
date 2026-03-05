# ARI.Software

**Premier Personal Productivity.**

Open Source. Self-Hosted. Full Data Control. Fully Extendable. AI Native. Dozens of Built-In Modules And Build Your Own In Minutes. No Coding Required.

Engineered for those who want complete command over the software that runs their life. The first AI-enabled No Code workspace that can be completely customized to your workflow and grows with you. Build entirely new modules in minutes. Where mastery, modularity, and AI work in your favour so you can do your best work and live your best life.

https://ari.software


## Automated Setup

Install ARI and all its dependencies with a single command:

**macOS / Linux:**
```bash
/bin/bash -c "$(curl -fsSL https://ari.software/install)"
```

**Windows** (PowerShell):
```powershell
irm https://ari.software/install-win | iex
```

This interactive wizard will detect your platform and set up your environment with the tools needed to run ARI (Git, Node.js, pnpm, Supabase CLI, etc.), then clone and install ARI for you.

## Manual Setup (macOS, Windows, Linux)

Here are the full step by step instructions to set up your local environment to run ARI. Below you will find installations instructions for macOS, Windows and Linux. If you have run the automated setup script, you do not need to complete these steps.

## Prerequisites

1. Node.js JavaScript runtime
2. pnpm Package manager
3. Git Version control
4. Vercel CLI Deployment (optional)
5. Supabase CLI Database management

---

## Get Started (macOS)

### 1. Install Homebrew (Package Manager)

Open Terminal and run:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After installation, follow the on-screen instructions to add Homebrew to your PATH.

### 2. Install Git

```bash
brew install git
```

### 3. Install Node.js (v18+)

```bash
brew install node
```

Verify installation:

```bash
node --version
```

### 4. Install pnpm (Package Manager)

```bash
brew install pnpm
```

### 5. Install Vercel CLI (Optional)

For managing Vercel Hosting:

```bash
npm install -g vercel
```

### 6. Install Supabase CLI

For database management:

```bash
brew install supabase/tap/supabase
```

### 7. Clone the Repository & Install Dependencies (If you don't have the files already):

```bash
git clone https://github.com/ARIsoftware/ARI.git
cd ARI
pnpm install
```

### 8. Run the Development Server

```bash
pnpm run dev
```

### 9. Open in Browser

Navigate to: http://localhost:3000/

---

## Get Started (Windows)

### 1. Install winget (Package Manager)

winget comes pre-installed on Windows 11 and Windows 10 (version 1809+). Open PowerShell or Command Prompt and verify:

```powershell
winget --version
```

If not installed, download [App Installer](https://apps.microsoft.com/store/detail/app-installer/9NBLGGH4NNS1) from the Microsoft Store.

### 2. Install Git

```powershell
winget install Git.Git
```

Restart your terminal after installation.

### 3. Install Node.js (v18+)

```powershell
winget install OpenJS.NodeJS.LTS
```

Verify installation:

```powershell
node --version
```

### 4. Install pnpm (Package Manager)

```powershell
npm install -g pnpm
```

Or using winget:

```powershell
winget install pnpm.pnpm
```

### 5. Install Vercel CLI (Optional)

For managing Vercel Hosting:

```powershell
npm install -g vercel
```

### 6. Install Supabase CLI

Using Scoop (recommended for Windows):

```powershell
# Install Scoop if you don't have it
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

# Add Supabase bucket and install
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Or using npm (requires Node.js 20+):

```powershell
npm install -g supabase
```

### 7. Clone the Repository & Install Dependencies (If you don't have the files already):

```powershell
git clone https://github.com/ARIsoftware/ARI.git
cd ARI
pnpm install
```

### 8. Run the Development Server

```powershell
pnpm run dev
```

### 9. Open in Browser

Navigate to: http://localhost:3000/

---

## Get Started (Linux)

> These instructions use `apt` for Debian/Ubuntu-based distributions. Adjust commands for your distribution (e.g., `dnf` for Fedora, `pacman` for Arch).

### 1. Update System Packages

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Git

```bash
sudo apt install git -y
```

### 3. Install Node.js (v18+)

Using NodeSource repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install nodejs -y
```

Verify installation:

```bash
node --version
```

### 4. Install pnpm (Package Manager)

```bash
npm install -g pnpm
```

Or using Corepack (included with Node.js 16.13+):

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### 5. Install Vercel CLI (Optional)

For managing Vercel Hosting:

```bash
npm install -g vercel
```

### 6. Install Supabase CLI

Using npm (requires Node.js 20+):

```bash
npm install -g supabase
```

Or using Homebrew for Linux:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install supabase/tap/supabase
```

### 7. Clone the Repository & Install Dependencies (If you don't have the files already):

```bash
git clone https://github.com/ARIsoftware/ARI.git
cd ARI
pnpm install
```

### 8. Run the Development Server

```bash
pnpm run dev
```

### 9. Open in Browser

Navigate to: http://localhost:3000/


## 🤝 Need Help?

Reach out to us at hello@ari.software
