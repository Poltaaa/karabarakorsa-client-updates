@echo off
title Karabarakorsa AFK Client v1.15.13 - Derleme (paket 69)
cd /d "%~dp0"
where node >nul 2>nul || (echo [HATA] Once Node.js LTS kurun: https://nodejs.org & pause & exit /b)
call npm ci
if errorlevel 1 pause & exit /b
call npm run verify
if errorlevel 1 pause & exit /b
call npm run build
echo.
echo Bitti. Installer ve portable EXE dist klasorunde.
pause
