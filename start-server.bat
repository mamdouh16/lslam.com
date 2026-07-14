@echo off
title Quran Memorizer Server
echo Starting local web server for Quran Memorizer...
echo.
python -m http.server 8000
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH.
    echo Opening index.html directly in browser...
    start index.html
) else (
    echo Server running at http://localhost:8000
    start http://localhost:8000
)
pause
