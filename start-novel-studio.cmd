@echo off
setlocal DisableDelayedExpansion

set "STUDIO_ROOT=%~dp0"
set "ELECTRON_EXE=%STUDIO_ROOT%node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" goto :build_required
if not exist "%STUDIO_ROOT%dist\index.html" goto :build_required
if not exist "%STUDIO_ROOT%dist-electron\main.cjs" goto :build_required
if not exist "%STUDIO_ROOT%dist-electron\preload.cjs" goto :build_required
if not exist "%STUDIO_ROOT%dist-electron\worker.cjs" goto :build_required

set "ELECTRON_RUN_AS_NODE="
set "VITE_DEV_SERVER_URL="
set "NOVEL_STUDIO_DISABLE_SINGLE_INSTANCE_LOCK="
set "NOVEL_STUDIO_WORKSPACE=%STUDIO_ROOT%.workspace"
set "NOVEL_STUDIO_USER_DATA=%STUDIO_ROOT%.local-profile"
start "" /D "%STUDIO_ROOT%." "%ELECTRON_EXE%" .
if errorlevel 1 goto :launch_failed
exit /b 0

:build_required
echo The workbench has not been built. Run npm ci and npm run build in this folder.
pause
exit /b 1

:launch_failed
echo Windows could not start Electron from this folder.
pause
exit /b 1
