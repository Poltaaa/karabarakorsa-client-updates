@echo off
title Paket 127 - Baglanti Tanilama
cd /d "%~dp0"
if not exist "node_modules\minecraft-protocol" (
  echo Once BASLAT-132.bat ile bagimliliklari kurun.
  pause
  exit /b 1
)
node diag-132.js %*
pause
