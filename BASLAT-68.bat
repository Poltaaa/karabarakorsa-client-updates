@echo off
title Karabarakorsa AFK Client v1.15.13 (paket 68)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [HATA] Node.js kurulu degil.
  echo Node.js LTS indirme sayfasi aciliyor.
  start https://nodejs.org/en/download
  pause
  exit /b
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Bagimliliklar bulunamadi veya eksik - npm ci ile kuruluyor...
  call npm ci
  if errorlevel 1 (
    echo [HATA] Bagimliliklar kurulamadi. Internet baglantisini kontrol edin.
    pause
    exit /b
  )
)

call npm run verify
if errorlevel 1 pause & exit /b
call npm start
if errorlevel 1 pause
