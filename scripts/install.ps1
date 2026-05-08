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

  To capture a full log of the install (for debugging or sharing):
    $env:ARI_LOG="1"; irm https://raw.githubusercontent.com/ARIsoftware/ARI/main/scripts/install.ps1 | iex
#>

# Wrapped in a scriptblock so that `return` and `throw` exit cleanly when
# this is run via `irm | iex`. Bare `exit` would terminate the host PowerShell
# session, which closes the user's terminal window.
& {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = "Stop"

    # ── Colors ───────────────────────────────────────────────────────────────

    function Write-OK    { param($msg) Write-Host "  ✔ $msg" -ForegroundColor Green }
    function Write-Warn  { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
    function Write-Err   { param($msg) Write-Host "  ✘ $msg" -ForegroundColor Red }
    function Write-Info  { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }

    # ── winget check ─────────────────────────────────────────────────────────

    function Test-Winget {
        try { $null = Get-Command winget -ErrorAction Stop; return $true }
        catch { return $false }
    }

    # ── Node.js ──────────────────────────────────────────────────────────────

    function Find-NodeExe {
        $candidates = @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")
        $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
        if ($programFilesX86) {
            $candidates += (Join-Path $programFilesX86 'nodejs\node.exe')
        }
        foreach ($candidate in $candidates) {
            if (Test-Path $candidate) { return $candidate }
        }
        return $null
    }

    function Install-NodeJS {
        Write-Info "Node.js (v18+) is required but not installed or outdated."
        Write-Host "  Node.js is the JavaScript runtime that powers ARI."
        Write-Host ""
        $yn = Read-Host "  Install Node.js via winget? [Y/n]"
        if ([string]::IsNullOrWhiteSpace($yn)) { $yn = "Y" }
        if ($yn -notmatch "^[Yy]") {
            throw "Node.js v18+ is required. Cannot continue without it."
        }

        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        # Refresh PATH from the registry. winget's MSI registers PATH
        # asynchronously, so as a fallback we also prepend the install dir
        # directly when node.exe is on disk but the registry hasn't caught up.
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = (@($machinePath, $userPath) | Where-Object { $_ }) -join ";"
        $nodeExe = Find-NodeExe
        if ($nodeExe) {
            $nodeDir = Split-Path -Parent $nodeExe
            if (($env:Path -split ';') -notcontains $nodeDir) {
                $env:Path = "$nodeDir;$env:Path"
            }
        }
        Write-OK "Node.js installed"
    }

    function Resolve-NodeCommand {
        $cmd = Get-Command node -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
        return Find-NodeExe
    }

    function Get-NodeVersion {
        try {
            $ver = (node --version 2>$null) -replace '^v', ''
            return $ver
        } catch {
            return $null
        }
    }

    # ── Logging (opt-in via $env:ARI_LOG) ────────────────────────────────────

    $logPath = $null
    if ($env:ARI_LOG) {
        $logPath = Join-Path $env:TEMP "ari-install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
        try {
            Start-Transcript -Path $logPath -Force | Out-Null
            Write-Host "  Logging this session to:" -ForegroundColor Cyan
            Write-Host "    $logPath" -ForegroundColor Cyan
            Write-Host ""
        } catch {
            Write-Warn "Could not start log: $($_.Exception.Message)"
            $logPath = $null
        }
    }

    # ── Main ─────────────────────────────────────────────────────────────────

    try {
        if (-not (Test-Winget)) {
            Write-Err "winget is required but not found."
            Write-Host ""
            Write-Host "  winget is pre-installed on Windows 10 (1809+) and Windows 11."
            Write-Host "  If missing, install 'App Installer' from the Microsoft Store:"
            Write-Host "  https://apps.microsoft.com/detail/9NBLGGH4NNS1" -ForegroundColor Blue
            Write-Host ""
            return
        }

        Write-Host ""

        $nodeVer = Get-NodeVersion
        $needInstall = $true
        if ($nodeVer) {
            $major = [int]($nodeVer.Split('.')[0])
            if ($major -ge 18) {
                $needInstall = $false
            } else {
                Write-Warn "Node.js v$nodeVer found but v18+ is required."
            }
        }
        if ($needInstall) { Install-NodeJS }

        $installJs = Join-Path $env:TEMP "ari-install-$PID.js"
        if (-not $env:ARI_BRANCH) { $env:ARI_BRANCH = "main" }
        $installUrl = "https://raw.githubusercontent.com/ARIsoftware/ARI/$($env:ARI_BRANCH)/scripts/install.js"
        $scriptDir = $null
        try {
            if ($MyInvocation.MyCommand.Path) {
                $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
            }
        } catch {
            $scriptDir = $null
        }
        $localJs = if ($scriptDir) { Join-Path $scriptDir "install.js" } else { $null }

        $downloaded = $false
        try {
            Invoke-WebRequest -Uri $installUrl -OutFile $installJs -UseBasicParsing -ErrorAction Stop
            $downloaded = $true
        } catch {
            if ($localJs -and (Test-Path $localJs)) {
                Copy-Item $localJs $installJs
                $downloaded = $true
            }
        }

        if (-not $downloaded) {
            Write-Err "Failed to download install.js and no local copy found."
            return
        }

        Write-Host ""

        $env:ARI_PLATFORM = "win32"
        $env:ARI_PKG_MGR = "winget"

        $nodeCmd = Resolve-NodeCommand
        if (-not $nodeCmd) {
            Write-Err "Node.js was installed but 'node' is not on PATH yet."
            Write-Host ""
            Write-Host "  Close this PowerShell window, open a new Administrator PowerShell, and re-run:"
            Write-Host "    irm https://ari.software/install-win | iex" -ForegroundColor Cyan
            Write-Host ""
            return
        }

        & $nodeCmd $installJs
        Remove-Item $installJs -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host ""
        Write-Err $_.Exception.Message
        Write-Host ""
    } finally {
        if ($logPath) {
            try { Stop-Transcript | Out-Null } catch {}
            Write-Host ""
            Write-Host "  Log saved to: $logPath" -ForegroundColor Cyan
            Write-Host "  Share this file when reporting issues." -ForegroundColor Gray
            Write-Host ""
        }
    }
}
