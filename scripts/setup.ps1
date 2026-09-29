# Fax Inbox — Setup für Windows (PowerShell)
# Prüft Node/npm, installiert Abhängigkeiten, optional Dev oder Windows-Build.
param(
  [switch]$Dev,
  [switch]$Build,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "✗ $msg" -ForegroundColor Red }

if ($Help) {
  Write-Host @"
Usage: .\scripts\setup.ps1 [-Dev] [-Build]

  (default)  Node/npm prüfen, npm install
  -Dev       danach npm run dev starten
  -Build     danach Windows-Installer bauen (NSIS + portable)
"@
  exit 0
}

Write-Host "=== Fax Inbox Setup (Windows) ==="
Write-Host "Arbeitsverzeichnis: $Root"
Write-Host ""

# Execution policy hint
try {
  Get-Command npm -ErrorAction Stop | Out-Null
} catch {
  # continue to detailed checks
}

$needMajor = 20

# --- Node ---
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Err "Node.js fehlt."
  Write-Host "  Download LTS: https://nodejs.org/  (mind. v$needMajor)"
  Write-Host "  oder winget: winget install OpenJS.NodeJS.LTS"
  exit 1
}

$nodeVer = (node -v).TrimStart('v')
$nodeMajor = [int]($nodeVer.Split('.')[0])
if ($nodeMajor -lt $needMajor) {
  Write-Err "Node.js $nodeVer gefunden — benötigt wird >= $needMajor"
  exit 1
}
Write-Ok "Node.js v$nodeVer"

# --- npm ---
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
  Write-Err "npm fehlt (kommt normalerweise mit Node)."
  exit 1
}
Write-Ok "npm $(npm -v)"

Write-Host ""
Write-Host "Installiere npm-Abhängigkeiten…"
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Ok "npm install abgeschlossen"

if (-not (Test-Path "package.json")) {
  Write-Err "package.json fehlt"
  exit 1
}
Write-Ok "package.json vorhanden"

Write-Host ""
Write-Host "Fertig. Nächste Schritte:"
Write-Host "  Entwicklung:  npm run dev"
Write-Host "  Windows-Build: npm run dist:win   → Artefakte in release\"
Write-Host "  Installer:    .exe aus release\ ausführen (NSIS) oder portable .exe starten"
Write-Host ""

if ($Build) {
  Write-Host "Baue Windows-Installer…"
  npm run dist:win
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Ok "Build fertig — siehe release\"
}

if ($Dev) {
  Write-Host "Starte Dev-App…"
  npm run dev
}
