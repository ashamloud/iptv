@echo off
title BOKK TV - Lancement
cd /d "%~dp0"
echo Demarrage du serveur BOKK TV...
powershell -ExecutionPolicy Bypass -File "start-server.ps1"
pause
