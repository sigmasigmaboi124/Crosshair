# ZeroPoint — Precision Reticle Overlay, Dynamic Designer & 3D Aim Lab

A standalone, ultra-low-RAM Windows desktop application (`.exe` installer & portable `.exe`) combining precision reticle authoring, dynamic reactive animations, community vault & sharing, multi-monitor / per-game profiles, built-in **The Range 3D** Aim Trainer, and **automatic GitHub Releases + Commits updating**.

## Standalone Windows App (`release/`)

- **Auto-Updating Installer**: `release/ZeroPoint-Setup-1.0.0.exe` — installs **ZeroPoint** with Start Menu & Desktop shortcuts and 1-click self-updating.
- **Portable Executable**: `release/ZeroPoint-Portable-1.0.0.exe` — double-click to run anywhere on Windows without installation.
- **Direct App Executable**: `release/win-unpacked/ZeroPoint.exe`

Rebuild the Windows app packages anytime:
```powershell
npm run dist:win
```

## Ultra-Low RAM Architecture

- **Native Win32 Layered Overlay (`WinBridge.exe`)**: The live crosshair renders natively via Win32 `UpdateLayeredWindow` (0 Chromium overlay process, 0.0% CPU when static, instantaneous 0-hop input reaction).
- **Low-RAM Gaming Mode (Tray Unload)**: Closing ZeroPoint to the System Tray destroys the Chromium Studio window completely while keeping the native overlay, hotkeys (`Alt+X`, `Alt+1..9`, `Alt+Arrows`), ADS reactions, and tray menu active.
- **On-Demand 3D Engine**: Three.js (`The Range 3D`) is lazy-loaded only when opened.

## Auto-Update for Both GitHub Releases & Commits

Wired directly to **`https://github.com/sigmasigmaboi124/Crosshair`**:
- **Releases + Commits (Default)**: Watches official GitHub Releases via `electron-updater` **and** live commits on `main`.
- **GitHub Actions CI/CD (`.github/workflows/auto-release-and-commits.yml`)**: Automatically builds & publishes Windows auto-update binaries on every commit to `main` (rolling pre-release) and every version tag (`v*.*.*`, stable release).

## Anti-Cheat Safe External Architecture

- **Zero DLL Injection** — isolated user-mode desktop app
- **Zero Memory Access** — never calls `OpenProcess`, `ReadProcessMemory`, or `WriteProcessMemory`
- **Zero Graphics Hooking** — pure OS DWM transparent click-through layered window
- **Zero Input Hooks / Zero Synthetic Input** — no `SetWindowsHookEx`, no `SendInput`, passive read-only `GetAsyncKeyState` + `XInputGetState` (plus **Ultra-Strict Static Mode**)
- **Zero Capture Evasion** — never sets `WDA_EXCLUDEFROMCAPTURE`
