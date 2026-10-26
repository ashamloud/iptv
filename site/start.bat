@echo off
title BOKK TV - Lancement
cd /d "%~dp0"
echo Demarrage du serveur BOKK TV...
powershell -ExecutionPolicy Bypass -File "start-server.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo Tentative de lancement direct avec python...
    start http://localhost:8080/
    python server.py
)
pause
