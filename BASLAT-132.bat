@echo off
title Karabarakorsa AFK Client v1.15.19 (paket 132)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js LTS kurulu degil: https://nodejs.org/en/download
  pause
  exit /b 1
)
set "NEED_INSTALL="
if not exist "node_modules\electron\dist\electron.exe" set "NEED_INSTALL=1"
if not exist "node_modules\mineflayer-pathfinder\package.json" set "NEED_INSTALL=1"
if defined NEED_INSTALL (
  echo Bagimliliklar npm ci ile kuruluyor...
  call npm ci
  if errorlevel 1 (
    echo [HATA] Bagimliliklar kurulamadi.
    pause
    exit /b 1
  )
)
call npm run verify
if errorlevel 1 (
  pause
  exit /b 1
)
call npm start
if errorlevel 1 pause
