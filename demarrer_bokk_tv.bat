@echo off
chcp 65001 >nul
title BOKK TV — Serveur Local

echo ========================================
echo   BOKK TV — Démarrage du serveur local
echo ========================================

REM Arrêter tout serveur BOKK TV existant sur le port 8080
for /f "tokens=5" %%i in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    echo Arrêt du serveur existant (PID %%i)...
    taskkill /PID %%i /F >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo.
echo Démarrage du serveur BOKK TV sur http://localhost:8080
echo.

cd /d "%~dp0site"
python server.py

pause

