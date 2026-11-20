@echo off
title ZeroPoint
cd /d "%~dp0"
if exist "release\win-unpacked\ZeroPoint.exe" (
  start "" "release\win-unpacked\ZeroPoint.exe"
  exit /b
)
if not exist "dist\index.html" (
  echo Building ZeroPoint...
  call npm run build
)
start "" "node_modules\electron\dist\electron.exe" .
