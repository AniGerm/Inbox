@echo off
REM Fax Inbox — Windows launcher (bypasses ExecutionPolicy; UTF-8 safe)
cd /d "%~dp0"
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
exit /b %ERRORLEVEL%
