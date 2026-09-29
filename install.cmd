@echo off
REM Fax Inbox — Windows launcher (bypasses PowerShell ExecutionPolicy)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
exit /b %ERRORLEVEL%
