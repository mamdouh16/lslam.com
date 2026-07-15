@echo off
title Bal-Islam Test Server
echo ==========================================================
echo           Bal-Islam Quran Memorizer Local Server
echo ==========================================================
echo.
echo Starting local test server...
echo.
echo Opening http://127.0.0.1:8000 in your browser...
start http://127.0.0.1:8000/
echo.
echo Press Ctrl+C in this window to stop the server at any time.
echo ----------------------------------------------------------
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
