@echo off
title BOKK TV — Serveur Local
echo.
echo  ============================================================
echo    BOKK TV — Démarrage du serveur local...
echo    Ouvrez votre navigateur sur : http://localhost:8080
echo  ============================================================
echo.

:: Aller dans le bon dossier
cd /d "%~dp0"

:: Lancer l'ouverture du navigateur en arriere-plan apres 1 seconde
start "" cmd /c "timeout /t 1 /nobreak >nul && start http://localhost:8080"

:: Lancer le serveur Python
python server.py

pause
