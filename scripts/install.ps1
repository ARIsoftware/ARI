#Requires -Version 5.1
<#
.SYNOPSIS
  ARI Installer — Windows Bootstrapper (PowerShell)
  Installs Node.js via winget, then hands off to install.js.

.DESCRIPTION
  Usage (run in PowerShell):
    irm https://raw.githubusercontent.com/ARIsoftware/ARI/main/scripts/install.ps1 | iex

  To install from a specific branch:
    $env:ARI_BRANCH="develop"; irm https://raw.githubusercontent.com/ARIsoftware/ARI/main/scripts/install.ps1 | iex
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Colors ───────────────────────────────────────────────────────────────────

function Write-OK    { param($msg) Write-Host "  ✔ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "  ✘ $msg" -ForegroundColor Red }
function Write-Info  { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }

# ── winget check ─────────────────────────────────────────────────────────────

function Test-Winget {
    try { $null = Get-Command winget -ErrorAction Stop; return $true }
    catch { return $false }
}

if (-not (Test-Winget)) {
    Write-Err "winget is required but not found."
    Write-Host ""
    Write-Host "  winget is pre-installed on Windows 10 (1809+) and Windows 11."
    Write-Host "  If missing, install 'App Installer' from the Microsoft Store:"
    Write-Host "  https://apps.microsoft.com/detail/9NBLGGH4NNS1" -ForegroundColor Blue
    Write-Host ""
    exit 1
}

Write-Host ""

# ── Node.js ──────────────────────────────────────────────────────────────────

function Install-NodeJS {
    Write-Info "Node.js (v18+) is required but not installed or outdated."
    Write-Host "  Node.js is the JavaScript runtime that powers ARI."
    Write-Host ""
    $yn = Read-Host "  Install Node.js via winget? [Y/n]"
    if ([string]::IsNullOrWhiteSpace($yn)) { $yn = "Y" }
    if ($yn -match "^[Yy]") {
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        # Refresh PATH so node is available immediately
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-OK "Node.js installed"
    } else {
        Write-Err "Node.js v18+ is required. Cannot continue without it."
        exit 1
    }
}

function Get-NodeVersion {
    try {
        $ver = (node --version 2>$null) -replace '^v', ''
        return $ver
    } catch {
        return $null
    }
}

$nodeVer = Get-NodeVersion
if ($nodeVer) {
    $major = [int]($nodeVer.Split('.')[0])
    if ($major -ge 18) {
        # Node.js is sufficient, continue silently
    } else {
        Write-Warn "Node.js v$nodeVer found but v18+ is required."
        Install-NodeJS
    }
} else {
    Install-NodeJS
}

# ── Hand off to install.js ───────────────────────────────────────────────────

$installJs = Join-Path $env:TEMP "ari-install-$PID.js"
if (-not $env:ARI_BRANCH) { $env:ARI_BRANCH = "main" }
$installUrl = "https://raw.githubusercontent.com/ARIsoftware/ARI/$($env:ARI_BRANCH)/scripts/install.js"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$localJs = Join-Path $scriptDir "install.js"

$downloaded = $false
try {
    Invoke-WebRequest -Uri $installUrl -OutFile $installJs -UseBasicParsing -ErrorAction Stop
    $downloaded = $true
} catch {
    if (Test-Path $localJs) {
        Copy-Item $localJs $installJs
        $downloaded = $true
    }
}

if (-not $downloaded) {
    Write-Err "Failed to download install.js and no local copy found."
    exit 1
}

Write-Host ""

$env:ARI_PLATFORM = "win32"
$env:ARI_PKG_MGR = "winget"

node $installJs
$exitCode = $LASTEXITCODE

Remove-Item $installJs -Force -ErrorAction SilentlyContinue
exit $exitCode
