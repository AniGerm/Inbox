# Fax Inbox — Fire-and-forget Installation (Windows)
# Installiert bei Bedarf Node.js (winget), baut NSIS-Installer + portable EXE
# und startet die Setup-.exe (Startmenü + Desktop-Verknüpfung).
# Die fertige App braucht zur Laufzeit KEIN Node.
param(
  [switch]$NoLaunch,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Building under System32 breaks NSIS (WOW64 redirection -> missing StdUtils.nsh).
$rootFull = [System.IO.Path]::GetFullPath($Root)
if ($rootFull -match '(?i)[\\/]Windows[\\/]System32[\\/]') {
  Write-Host "[X] Bitte nicht unter C:\Windows\System32 installieren/bauen." -ForegroundColor Red
  Write-Host "    Kopiere das Projekt nach z.B. C:\Users\$env:USERNAME\Inbox und starte .\install.cmd erneut." -ForegroundColor Yellow
  Write-Host "    Aktueller Pfad: $rootFull" -ForegroundColor Yellow
  exit 1
}

function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[X] $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "-> $msg" -ForegroundColor Cyan }

if ($Help) {
  Write-Host @"
Usage: .\scripts\install.ps1 [-NoLaunch]

  Fire-and-forget:
    1. Node.js LTS installieren falls fehlend (winget)
    2. npm install + Windows-Build (NSIS + portable)
    3. Setup-.exe starten (Startmenü + Desktop-Shortcut)
"@
  exit 0
}

Write-Host "=== Fax Inbox — Installation (Windows) ==="
Write-Host "Arbeitsverzeichnis: $Root"
Write-Host ""

$needMajor = 20

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Test-NodeOk {
  Refresh-Path
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $false }
  $ver = (node -v).TrimStart('v')
  $major = [int]($ver.Split('.')[0])
  return ($major -ge $needMajor)
}

function Ensure-Node {
  if (Test-NodeOk) {
    Write-Ok "Node.js $(node -v) vorhanden"
    return
  }

  Write-Warn "Node.js fehlt. Schritt 1: bitte zuerst Node.js LTS von https://nodejs.org/ installieren (enthält npm), PowerShell neu öffnen, dann dieses Skript erneut starten."
  Write-Info "Alternativ versuche ich winget (OpenJS.NodeJS.LTS)..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Err "winget nicht gefunden. Bitte Node LTS manuell von https://nodejs.org/ installieren und Skript erneut starten."
    exit 1
  }

  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  Refresh-Path

  # winget sometimes needs a new shell; try common install paths
  $candidates = @(
    "$env:ProgramFiles\nodejs",
    "${env:ProgramFiles(x86)}\nodejs",
    "$env:LOCALAPPDATA\Programs\nodejs"
  )
  foreach ($c in $candidates) {
    if (Test-Path "$c\node.exe") {
      $env:Path = "$c;$env:Path"
    }
  }

  if (-not (Test-NodeOk)) {
    Write-Err "Node.js nach winget nicht im PATH. PowerShell neu öffnen und .\scripts\install.ps1 erneut ausführen."
    exit 1
  }
  Write-Ok "Node.js $(node -v) installiert"
}

Ensure-Node

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Err "npm fehlt."
  exit 1
}
Write-Ok "npm $(npm -v)"

Write-Info "npm install..."
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Ok "Abhängigkeiten installiert"

# Skip Windows code-sign tool download (often hangs forever behind Defender).
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = "true"

Write-Info "Baue Windows-Installer (NSIS, x64) — kann beim ersten Mal 5-15 Min. dauern..."
Write-Info "Hinweis: Bei >20 Min. ohne Ausgabe: Strg+C, Defender-Ausschluss fuer den Ordner, erneut .\install.cmd"
npm run dist:win -- --publish never
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Ok "Build fertig -> release\"

$setup = Get-ChildItem -Path "release" -Filter "*Setup*.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $setup) {
  # electron-builder may name artifact Fax-Inbox-Setup-0.1.0.exe
  $setup = Get-ChildItem -Path "release" -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch 'portable|Portable' -and $_.Name -notmatch '\.blockmap$' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

$portable = Get-ChildItem -Path "release" -Filter "*portable*.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($portable) {
  Write-Ok "Portable EXE: $($portable.FullName)"
}

if (-not $setup) {
  Write-Err "Keine Setup-.exe in release\ gefunden."
  exit 1
}

Write-Ok "Installer: $($setup.FullName)"
Write-Host ""
Write-Host "Die Setup-.exe richtet Fax Inbox im Startmenü und optional als Desktop-Verknüpfung ein."
Write-Host "Hinweis: Die installierte App enthält Electron bereits — Node wird nur zum Bauen gebraucht."
Write-Host ""

if (-not $NoLaunch) {
  Write-Info "Starte Installer..."
  Start-Process -FilePath $setup.FullName -Wait
  Write-Ok "Installer beendet. Fax Inbox findest du im Startmenü."
} else {
  Write-Info "Überspringe Launch (-NoLaunch). Bitte $($setup.Name) manuell ausführen."
}
