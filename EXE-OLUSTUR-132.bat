@echo off
title Karabarakorsa AFK Client v1.15.20 - Derleme (paket 132)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js LTS kurun: https://nodejs.org
  pause
  exit /b 1
)
call npm ci
if errorlevel 1 (
  pause
  exit /b 1
)
call npm run verify
if errorlevel 1 (
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  echo [HATA] Derleme basarisiz.
  pause
  exit /b 1
)
echo Bitti. Installer ve portable EXE dist klasorunde.
pause
