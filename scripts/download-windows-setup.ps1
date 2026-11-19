# Inbox — neuesten Windows-Installer von GitHub holen und starten.
# Umgeht den typischen Browser-Download mit „Mark of the Web“ / SmartScreen-Blockade:
# die Datei wird per PowerShell geladen, freigegeben (Unblock-File) und gestartet.
#
# Nutzung (PowerShell):
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   irm https://raw.githubusercontent.com/AniGerm/Inbox/main/scripts/download-windows-setup.ps1 | iex
#
# Oder lokal aus dem Repo:
#   .\scripts\download-windows-setup.ps1
#   .\scripts\download-windows-setup.ps1 -Tag v0.4.0   # feste Version
#   .\scripts\download-windows-setup.ps1 -NoLaunch

param(
  [string]$Tag = "",
  [string]$OutDir = $env:TEMP,
  [switch]$NoLaunch,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$Repo = "AniGerm/Inbox"

function Write-Ok($msg)   { Write-Host "OK  $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "->  $msg" -ForegroundColor Cyan }
function Write-Err($msg)  { Write-Host "X   $msg" -ForegroundColor Red }

if ($Help) {
  Write-Host @"
Usage: download-windows-setup.ps1 [-Tag v0.4.5] [-OutDir Pfad] [-NoLaunch]

  Laedt Inbox-Setup-*.exe vom GitHub-Release, entfernt die Zone-Markierung
  (Unblock-File) und startet den Installer.
"@
  exit 0
}

if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$apiBase = "https://api.github.com/repos/$Repo/releases"
$headers = @{
  "Accept"     = "application/vnd.github+json"
  "User-Agent" = "Inbox-download-windows-setup"
}

Write-Info "Frage GitHub Releases ab…"
if ($Tag) {
  $tagName = if ($Tag.StartsWith("v")) { $Tag } else { "v$Tag" }
  $release = Invoke-RestMethod -Uri "$apiBase/tags/$tagName" -Headers $headers
} else {
  $release = Invoke-RestMethod -Uri "$apiBase/latest" -Headers $headers
}

$asset = @(
  $release.assets |
    Where-Object {
      $_.name -like "Inbox-Setup-*.exe" -and
      $_.name -notlike "*.blockmap"
    }
) | Select-Object -First 1

if (-not $asset) {
  Write-Err "Kein Inbox-Setup-*.exe im Release $($release.tag_name) gefunden."
  exit 1
}

$dest = Join-Path $OutDir $asset.name
Write-Info "Lade $($asset.name) ($([math]::Round($asset.size/1MB,1)) MB) → $dest"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $dest -UseBasicParsing

# Browser-Downloads tragen Zone.Identifier (MOTW) → SmartScreen blockiert oft.
# Auch PowerShell kann die Zone setzen; Unblock-File entfernt sie.
try {
  Unblock-File -LiteralPath $dest -ErrorAction Stop
  Write-Ok "Zone-Markierung entfernt (Unblock-File)"
} catch {
  Write-Host "!  Unblock-File nicht moeglich: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "   Rechtsklick auf die .exe → Eigenschaften → Zulassen" -ForegroundColor Yellow
}

Write-Ok "Gespeichert: $dest"
Write-Host ""
Write-Host "Falls Windows SmartScreen erscheint:" -ForegroundColor Yellow
Write-Host "  Weitere Informationen → Trotzdem ausfuehren" -ForegroundColor Yellow
Write-Host ""

if ($NoLaunch) {
  Write-Info "Start uebersprungen (-NoLaunch)."
  exit 0
}

Write-Info "Starte Installer…"
Start-Process -FilePath $dest -Wait
Write-Ok "Installer beendet. Inbox findest du im Startmenue."
