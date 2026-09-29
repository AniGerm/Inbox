# Fax Inbox — Dev-Setup (Windows)
# Für Fire-and-forget inkl. Startmenü: .\install.ps1
param(
  [switch]$Dev,
  [switch]$Build,
  [switch]$Install,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "✗ $msg" -ForegroundColor Red }

if ($Help) {
  Write-Host @"
Usage: .\scripts\setup.ps1 [-Dev] [-Build] [-Install]

  (default)  Node/npm prüfen, npm install
  -Dev       npm run dev
  -Build     Windows-Installer bauen (ohne auszuführen)
  -Install   Fire-and-forget → scripts\install.ps1
"@
  exit 0
}

if ($Install) {
  & "$Root\scripts\install.ps1"
  exit $LASTEXITCODE
}

Write-Host "=== Fax Inbox Dev-Setup (Windows) ==="
Write-Host "Tipp: Für echte Installation mit Startmenü → .\install.ps1"
Write-Host ""

$needMajor = 20
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Err "Node.js fehlt. Für Auto-Install: .\install.ps1"
  exit 1
}

$nodeVer = (node -v).TrimStart('v')
$nodeMajor = [int]($nodeVer.Split('.')[0])
if ($nodeMajor -lt $needMajor) {
  Write-Err "Node.js $nodeVer — benötigt >= $needMajor"
  exit 1
}
Write-Ok "Node.js v$nodeVer"
Write-Ok "npm $(npm -v)"

npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Ok "npm install abgeschlossen"

if ($Build) {
  npm run dist:win
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Ok "Build fertig — siehe release\"
}

if ($Dev) {
  npm run dev
}
