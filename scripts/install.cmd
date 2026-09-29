@echo off
REM Fax Inbox Windows install (root). Bypasses PowerShell ExecutionPolicy.
cd /d "%~dp0"
if not exist "%~dp0scripts\install.ps1" (
  echo [X] scripts\install.ps1 fehlt. Bitte im Repo-Hauptordner starten ^(git clone / git pull^).
  echo     Aktuell: %CD%
  pause
  exit /b 1
)
chcp 65001 >nul
echo === Fax Inbox Install ===
echo Ordner: %CD%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
set ERR=%ERRORLEVEL%
if %ERR% neq 0 (
  echo [X] Installation fehlgeschlagen ^(Code %ERR%^).
  pause
)
exit /b %ERR%
