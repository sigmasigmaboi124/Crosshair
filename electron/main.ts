import { app, BrowserWindow, ipcMain, nativeImage, screen, shell } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as readline from 'readline';
import { AppAutoUpdater } from './updater';

// Aggressive Low-RAM Chromium tuning (must run before app.whenReady)
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64 --optimize-for-size');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch(
  'disable-features',
  'Spellcheck,HardwareMediaKeyHandling,MediaRouter,CalculateNativeWinOcclusion'
);

const PIPE_PATH = '\\\\.\\pipe\\ZeroPointOverlayBridge';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

interface BridgeMonitor {
  index: number;
  device: string;
  primary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

interface OverlayPayload {
  enabled: boolean;
  activeConfig: Record<string, unknown>;
  secondaryAdsConfig: Record<string, unknown> | null;
  monitorIndex: number;
}

let mainWindow: BrowserWindow | null = null;
let bridgeSocket: net.Socket | null = null;
let updater: AppAutoUpdater | null = null;
let isQuittingEverything = false;
let minimizeToTray = true;
let latestMonitors: BridgeMonitor[] = [];
let latestOverlayPayload: OverlayPayload | null = null;
let latestProfilesForBridge: unknown[] = [];
let latestAudioLimiterConfig: Record<string, unknown> | null = null;
let latestOptimizerConfig: Record<string, unknown> | null = null;
let latestColorFilterConfig: Record<string, unknown> | null = null;
let latestAudioDevicesPayload: { devices: unknown[]; processes: string[] } = { devices: [], processes: [] };
let latestOptimizerStatus: unknown = null;
let latestColorStatus: unknown = null;
let pendingScreenCaptureResolve: ((dataUrl: string | null) => void) | null = null;
let pendingOpenTab: string | null = null;

let safetyAudit = {
  bridgeConnected: false,
  dllInjection: false,
  memoryAccess: false,
  globalInputHooks: false,
  syntheticInput: false,
  graphicsApiHooking: false,
  captureEvasion: false,
};

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'zeropoint-state.json');
}

function getBackupStorePath(): string {
  return path.join(app.getPath('userData'), 'zeropoint-state.backup.json');
}

function getBridgeExecutablePath(): string {
  const names = ['ZeroPointOverlay.exe', 'WinBridge.exe'];
  for (const name of names) {
    const prodPath = path.join(process.resourcesPath || '', 'WinBridge', name);
    if (app.isPackaged && fs.existsSync(prodPath)) return prodPath;
    const pubPath = path.join(__dirname, '..', 'native', 'WinBridge', 'publish', name);
    const devPath = path.join(__dirname, '..', 'native', 'WinBridge', 'out', name);
    const hasPub = fs.existsSync(pubPath);
    const hasDev = fs.existsSync(devPath);
    if (hasPub && hasDev) {
      const pubMtime = fs.statSync(pubPath).mtimeMs;
      const devMtime = fs.statSync(devPath).mtimeMs;
      return devMtime >= pubMtime ? devPath : pubPath;
    }
    if (hasDev) return devPath;
    if (hasPub) return pubPath;
  }
  return path.join(process.resourcesPath || '', 'WinBridge', 'ZeroPointOverlay.exe');
}

function sendBridgeCommand(obj: Record<string, unknown>): void {
  if (!bridgeSocket || bridgeSocket.destroyed || !bridgeSocket.writable) return;
  try {
    bridgeSocket.write(JSON.stringify(obj) + '\n');
  } catch {
    // Ignore pipe errors
  }
}

function getSortedElectronDisplays(): Electron.Display[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return [...screen.getAllDisplays()].sort((a, b) => {
    const ap = a.id === primaryId;
    const bp = b.id === primaryId;
    if (ap !== bp) return ap ? -1 : 1;
    return a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y;
  });
}

function buildFallbackMonitorsFromElectron(): BridgeMonitor[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return getSortedElectronDisplays().map((d, idx) => ({
    index: idx,
    device: `DISPLAY-${idx + 1}`,
    primary: d.id === primaryId,
    x: Math.round(d.bounds.x * d.scaleFactor),
    y: Math.round(d.bounds.y * d.scaleFactor),
    width: Math.round(d.bounds.width * d.scaleFactor),
    height: Math.round(d.bounds.height * d.scaleFactor),
    scaleFactor: d.scaleFactor,
  }));
}

function getAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  return undefined;
}

function tryMigrateStandaloneHyperHue(): Record<string, unknown> | null {
  try {
    const legacyPath = path.join(app.getPath('appData'), 'HyperHue', 'settings.json');
    if (!fs.existsSync(legacyPath)) return null;
    const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
    if (!raw || typeof raw !== 'object') return null;
    const mapLook = (l: Record<string, unknown> | undefined) => ({
      name: typeof l?.Name === 'string' ? l.Name : 'Hyper',
      builtIn: false,
      brightness: typeof l?.Brightness === 'number' ? l.Brightness : 0,
      contrast: typeof l?.Contrast === 'number' ? l.Contrast : 1,
      temperature: typeof l?.Temperature === 'number' ? l.Temperature : 0,
      saturation: typeof l?.Saturation === 'number' ? l.Saturation : 1,
      hue: typeof l?.Hue === 'number' ? l.Hue : 0,
      shadowBoost: typeof l?.ShadowBoost === 'number' ? l.ShadowBoost : 1,
    });
    const corners = ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'];
    return {
      enabled: !!raw.Enabled,
      activePreset: typeof raw.ActivePreset === 'string' ? raw.ActivePreset : 'Hyper',
      working: mapLook(raw.Working),
      applied: mapLook(raw.Applied ?? raw.Working),
      autoApply: raw.AutoApply !== false,
      customPresets: Array.isArray(raw.CustomPresets)
        ? raw.CustomPresets.map((c: Record<string, unknown>) => mapLook(c))
        : [],
      engineMode: raw.Engine === 1 ? 'amd' : 'screen',
      shadowBoostEnabled: raw.ShadowBoostEnabled !== false,
      rules: Array.isArray(raw.Rules)
        ? raw.Rules.map((r: Record<string, unknown>) => ({
            process: typeof r?.Process === 'string' ? r.Process : '',
            preset: typeof r?.Preset === 'string' ? r.Preset : 'Hyper',
          })).filter((r: { process: string }) => r.process)
        : [],
      rulesOnly: !!raw.RulesOnly,
      hudToasts: raw.HudToasts !== false,
      hudPinned: !!raw.HudPinned,
      hudCorner: corners[typeof raw.HudCorner === 'number' ? raw.HudCorner : 1] || 'TopRight',
    };
  } catch {
    return null;
  }
}

function loadStoreFromDisk(): Record<string, unknown> | null {
  const candidates = [
    getStorePath(),
    getBackupStorePath(),
    // Seamless migration if user saved crosshairs before the rename to ZeroPoint
    path.join(app.getPath('appData'), 'crosshair-studio-x', 'crosshair-studio-x-state.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          if (!obj.colorFilter) {
            const migrated = tryMigrateStandaloneHyperHue();
            if (migrated) obj.colorFilter = migrated;
          }
          return obj;
        }
      }
    } catch {
      // Try next fallback/backup
    }
  }
  const migratedOnly = tryMigrateStandaloneHyperHue();
  return migratedOnly ? { colorFilter: migratedOnly } : null;
}

function saveStoreToDisk(data: Record<string, unknown>): void {
  try {
    const target = getStorePath();
    const backup = getBackupStorePath();
    const tmp = `${target}.tmp`;
    const serialized = JSON.stringify({ schemaVersion: 2, ...data }, null, 2);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Keep last known-good backup before atomic replace
    if (fs.existsSync(target)) {
      try {
        fs.copyFileSync(target, backup);
      } catch {
        // Ignore backup copy issue
      }
    }
    fs.writeFileSync(tmp, serialized, 'utf-8');
    fs.renameSync(tmp, target);

    // Also mirror full profile list into WinBridge so Tray/Hotkeys work with 0 MB Electron RAM!
    if (Array.isArray(data.profiles)) {
      const activeId = data.activeProfileId;
      latestProfilesForBridge = (data.profiles as Array<Record<string, unknown>>).map((p) => ({
        id: p.id,
        name: (p.config as Record<string, unknown>)?.name ?? 'Profile',
        active: p.id === activeId,
        monitorIndex: p.monitorIndex ?? 0,
        quickSlot: p.quickSlot ?? null,
        gameTitleMatchers: p.gameTitleMatchers ?? [],
        config: p.config,
      }));
      sendBridgeCommand({ cmd: 'syncProfiles', profiles: latestProfilesForBridge });
    }
  } catch {
    // Ignore write failures
  }
}

function spawnDetachedWinBridge(): void {
  const exePath = getBridgeExecutablePath();
  if (!fs.existsSync(exePath)) return;

  const studioExe = process.execPath;
  const studioArgs = app.isPackaged ? '' : `"${path.resolve(__dirname, '..')}"`;
  const child = spawn(
    exePath,
    ['--studio-exe', studioExe, '--studio-args', studioArgs, '--state-file', getStorePath()],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }
  );
  child.unref();
}

function connectToWinBridge(retryCount = 0): void {
  const sock = net.createConnection(PIPE_PATH);

  sock.once('connect', () => {
    bridgeSocket = sock;
    const studioExe = process.execPath;
    const studioArgs = app.isPackaged ? '' : `"${path.resolve(__dirname, '..')}"`;
    sendBridgeCommand({
      cmd: 'registerStudio',
      exePath: studioExe,
      launchArgs: studioArgs,
      stateFilePath: getStorePath(),
    });

    if (latestOverlayPayload) {
      sendBridgeCommand({ cmd: 'syncOverlay', ...latestOverlayPayload });
    }
    if (latestProfilesForBridge.length > 0) {
      sendBridgeCommand({ cmd: 'syncProfiles', profiles: latestProfilesForBridge });
    }
    if (latestAudioLimiterConfig) {
      sendBridgeCommand({ cmd: 'syncAudioLimiter', config: latestAudioLimiterConfig });
    }
    if (latestOptimizerConfig) {
      sendBridgeCommand({ cmd: 'syncOptimizer', config: latestOptimizerConfig });
    }
    if (latestColorFilterConfig) {
      sendBridgeCommand({ cmd: 'syncColorFilter', config: latestColorFilterConfig, flash: false });
    }

    const rl = readline.createInterface({ input: sock });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        switch (msg.type) {
          case 'ready':
            safetyAudit = { bridgeConnected: true, ...(msg.safetyAudit ?? {}) };
            mainWindow?.webContents.send('bridge:safety', safetyAudit);
            break;

          case 'monitors':
            if (Array.isArray(msg.monitors) && msg.monitors.length > 0) {
              latestMonitors = msg.monitors;
              mainWindow?.webContents.send('bridge:monitors', latestMonitors);
            }
            break;

          case 'input':
            mainWindow?.webContents.send('bridge:input', msg);
            break;

          case 'hotkey':
            mainWindow?.webContents.send('bridge:hotkey', msg);
            break;

          case 'foreground':
            if (typeof msg.title === 'string') {
              mainWindow?.webContents.send('bridge:foreground', msg.title);
            }
            break;

          case 'audioTelemetry':
            mainWindow?.webContents.send('bridge:audioTelemetry', msg);
            break;

          case 'audioDevices':
            latestAudioDevicesPayload = {
              devices: Array.isArray(msg.devices) ? msg.devices : [],
              processes: Array.isArray(msg.processes) ? msg.processes : [],
            };
            mainWindow?.webContents.send('bridge:audioDevices', latestAudioDevicesPayload);
            break;

          case 'optimizerStatus':
            latestOptimizerStatus = msg;
            mainWindow?.webContents.send('bridge:optimizerStatus', msg);
            break;

          case 'optimizerActionResult':
            mainWindow?.webContents.send('bridge:optimizerActionResult', msg);
            break;

          case 'colorStatus':
            latestColorStatus = msg;
            mainWindow?.webContents.send('bridge:colorStatus', msg);
            break;

          case 'colorConfigSync':
            if (msg.config) latestColorFilterConfig = msg.config;
            if (msg.status) latestColorStatus = msg.status;
            mainWindow?.webContents.send('bridge:colorConfigSync', msg);
            break;

          case 'colorActionResult':
            mainWindow?.webContents.send('bridge:colorActionResult', msg);
            break;

          case 'colorScreenCapture':
            if (pendingScreenCaptureResolve) {
              const finish = pendingScreenCaptureResolve;
              pendingScreenCaptureResolve = null;
              finish(msg.ok && typeof msg.dataUrl === 'string' ? msg.dataUrl : null);
            }
            break;

          case 'trayAction':
            if (msg.action === 'quitAll') {
              isQuittingEverything = true;
              app.quit();
            } else if (msg.action === 'toggleStudio') {
              if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
                enterZeroRamGamingMode();
              } else if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
                mainWindow.focus();
              }
            } else if (msg.action === 'openStudio') {
              mainWindow?.show();
              mainWindow?.focus();
            } else if (
              msg.action === 'openAimTrainer' ||
              msg.action === 'openUpdates' ||
              msg.action === 'openAudioLimiter' ||
              msg.action === 'openFpsOptimizer' ||
              msg.action === 'openColorFilters'
            ) {
              mainWindow?.show();
              mainWindow?.focus();
              mainWindow?.webContents.send('tray:action', { type: msg.action });
            } else if (msg.action === 'selectProfile' && msg.profileId) {
              mainWindow?.webContents.send('tray:action', { type: 'selectProfile', profileId: msg.profileId });
            }
            break;
        }
      } catch {
        // Ignore malformed lines
      }
    });
  });

  sock.once('error', () => {
    sock.destroy();
    if (retryCount === 0) {
      spawnDetachedWinBridge();
    }
    if (retryCount < 20 && !isQuittingEverything) {
      setTimeout(() => connectToWinBridge(retryCount + 1), 220);
    } else {
      latestMonitors = buildFallbackMonitorsFromElectron();
    }
  });

  sock.once('close', () => {
    if (bridgeSocket === sock) bridgeSocket = null;
    safetyAudit = { ...safetyAudit, bridgeConnected: false };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bridge:safety', safetyAudit);
    }
  });
}

/**
 * Exits the Electron Studio UI completely so gaming RAM drops to ~10-20 MB
 * while WinBridge.exe keeps the native Win32 crosshair overlay, hotkeys & System Tray live!
 */
function enterZeroRamGamingMode(): void {
  sendBridgeCommand({ cmd: 'detachStudio' });
  setTimeout(() => {
    app.exit(0);
  }, 60);
}

function quitEverything(): void {
  isQuittingEverything = true;
  updater?.stop();
  sendBridgeCommand({ cmd: 'quit' });
  setTimeout(() => {
    app.quit();
  }, 100);
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0c0c0e',
    icon: getAppIcon(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (pendingOpenTab) {
      mainWindow?.webContents.send('tray:action', { type: pendingOpenTab });
      pendingOpenTab = null;
    }
  });

  mainWindow.on('close', (e) => {
    if (!isQuittingEverything && minimizeToTray) {
      e.preventDefault();
      enterZeroRamGamingMode();
    } else if (!isQuittingEverything) {
      e.preventDefault();
      quitEverything();
    }
  });
}

function registerIpcHandlers(): void {
  ipcMain.on('window:control', (_e, action: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else if (action === 'close') {
      if (minimizeToTray) enterZeroRamGamingMode();
      else quitEverything();
    } else if (action === 'quit') {
      quitEverything();
    }
  });

  ipcMain.handle('monitors:get', () => {
    if (latestMonitors.length > 0) return latestMonitors;
    return buildFallbackMonitorsFromElectron();
  });

  ipcMain.handle('safety:get', () => safetyAudit);

  ipcMain.on('overlay:sync', (_e, payload: OverlayPayload) => {
    latestOverlayPayload = payload;
    sendBridgeCommand({
      cmd: 'syncOverlay',
      enabled: !!payload.enabled,
      monitorIndex: payload.monitorIndex ?? 0,
      activeConfig: payload.activeConfig,
      secondaryAdsConfig: payload.secondaryAdsConfig ?? null,
    });
  });

  ipcMain.on('bridge:config', (_e, cfg) => {
    if (typeof cfg.minimizeToTray === 'boolean') minimizeToTray = cfg.minimizeToTray;
    sendBridgeCommand({
      cmd: 'setConfig',
      strictStaticMode: !!cfg.strictStaticMode,
      foregroundWatch: !!cfg.foregroundWatch,
      topmostKeepAlive: cfg.topmostKeepAlive !== false,
      toggleVk: Number(cfg.toggleVk ?? 0x58),
      toggleAlt: cfg.toggleAlt !== false,
      toggleCtrl: !!cfg.toggleCtrl,
      toggleShift: !!cfg.toggleShift,
      adsCustomVk: Number(cfg.adsCustomVk ?? 0),
    });
  });

  ipcMain.on('tray:profiles', () => {
    // Profiles are synced directly with configs via saveStoreToDisk
  });

  ipcMain.on('system:openGraphicsSettings', () => {
    shell.openExternal('ms-settings:display-advancedgraphics').catch(() => {});
  });

  ipcMain.handle('store:load', () => loadStoreFromDisk());
  ipcMain.on('store:save', (_e, data) => saveStoreToDisk(data as Record<string, unknown>));

  // Gunshot Limiter & Footstep EQ IPC
  ipcMain.on('audio:sync', (_e, cfg: Record<string, unknown>) => {
    latestAudioLimiterConfig = cfg;
    sendBridgeCommand({ cmd: 'syncAudioLimiter', config: cfg });
  });
  ipcMain.handle('audio:getDevices', () => {
    sendBridgeCommand({ cmd: 'getAudioDevices' });
    return latestAudioDevicesPayload;
  });

  // ROB RUN Competitive Config & FPS Optimizer IPC
  ipcMain.on('optimizer:sync', (_e, cfg: Record<string, unknown>) => {
    latestOptimizerConfig = cfg;
    sendBridgeCommand({ cmd: 'syncOptimizer', config: cfg });
  });
  ipcMain.handle('optimizer:getStatus', () => {
    sendBridgeCommand({ cmd: 'getOptimizerStatus' });
    return latestOptimizerStatus;
  });
  ipcMain.on('optimizer:applyNow', (_e, cfg: Record<string, unknown>) => {
    latestOptimizerConfig = cfg;
    sendBridgeCommand({ cmd: 'applyOptimizerNow', config: cfg });
  });
  ipcMain.on('optimizer:restoreBackup', () => {
    sendBridgeCommand({ cmd: 'restoreOptimizerBackup' });
  });
  ipcMain.on('optimizer:restoreDesktop', () => {
    sendBridgeCommand({ cmd: 'restoreDesktopNow' });
  });
  ipcMain.on('optimizer:launchGame', (_e, cfg: Record<string, unknown>) => {
    latestOptimizerConfig = cfg;
    sendBridgeCommand({ cmd: 'launchRobRun', config: cfg });
  });
  ipcMain.on('optimizer:openPath', (_e, targetPath: string) => {
    if (targetPath && typeof targetPath === 'string' && fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) shell.openPath(targetPath).catch(() => {});
      else shell.showItemInFolder(targetPath);
    }
  });

  // Color Filters & Shadow Boost (Unified HyperHue Engine) IPC
  ipcMain.on('color:sync', (_e, payload: { config: Record<string, unknown>; flash?: boolean }) => {
    latestColorFilterConfig = payload.config;
    sendBridgeCommand({ cmd: 'syncColorFilter', config: payload.config, flash: !!payload.flash });
  });
  ipcMain.handle('color:getStatus', () => {
    sendBridgeCommand({ cmd: 'getColorStatus' });
    return latestColorStatus;
  });
  ipcMain.on('color:previewHud', () => {
    sendBridgeCommand({ cmd: 'previewColorHud' });
  });
  ipcMain.on('color:unlockGamma', () => {
    sendBridgeCommand({ cmd: 'unlockGammaRange' });
  });
  ipcMain.handle('color:captureScreen', async () => {
    const wasVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    if (wasVisible && mainWindow) {
      mainWindow.setOpacity(0);
    }
    await new Promise((r) => setTimeout(r, 200));
    const dataUrl = await new Promise<string | null>((resolve) => {
      pendingScreenCaptureResolve = resolve;
      sendBridgeCommand({ cmd: 'captureCleanScreen' });
      setTimeout(() => {
        if (pendingScreenCaptureResolve === resolve) {
          pendingScreenCaptureResolve = null;
          resolve(null);
        }
      }, 2500);
    });
    if (wasVisible && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(1);
      mainWindow.focus();
    }
    return dataUrl;
  });

  // Auto-Updater IPC (GitHub Releases + Commits)
  ipcMain.handle('updater:getState', () => updater?.getState() ?? null);
  ipcMain.handle('updater:check', () => updater?.checkForUpdates() ?? null);
  ipcMain.handle('updater:download', () => updater?.downloadUpdate());
  ipcMain.on('updater:install', () => updater?.installDownloadedUpdate());
  ipcMain.handle('updater:pullCommit', () => updater?.pullCommitAndRebuild());
  ipcMain.on('updater:config', (_e, cfg) => updater?.updateSettings(cfg));
  ipcMain.on('updater:openUrl', (_e, url?: string) => updater?.openExternalUrl(url));
}

// Parse optional --open-tab=<tab> passed by WinBridge tray menu
for (const arg of process.argv) {
  if (arg.startsWith('--open-tab=')) {
    const val = arg.slice('--open-tab='.length);
    if (
      val === 'openAimTrainer' ||
      val === 'openUpdates' ||
      val === 'openAudioLimiter' ||
      val === 'openFpsOptimizer' ||
      val === 'openColorFilters'
    ) {
      pendingOpenTab = val;
    }
  }
}

if (gotLock) {
  app.on('second-instance', (_e, argv) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const tabArg = argv.find((a) => a.startsWith('--open-tab='));
      if (tabArg) {
        mainWindow.webContents.send('tray:action', { type: tabArg.slice('--open-tab='.length) });
      }
    }
  });

  app.whenReady().then(() => {
    const disk = loadStoreFromDisk();
    if (disk?.settings && typeof (disk.settings as Record<string, unknown>).minimizeToTray === 'boolean') {
      minimizeToTray = (disk.settings as Record<string, unknown>).minimizeToTray as boolean;
    }

    updater = new AppAutoUpdater(
      () => mainWindow,
      () => sendBridgeCommand({ cmd: 'quit' }) // Cleanly unlock WinBridge.exe right before NSIS installs an update!
    );
    registerIpcHandlers();
    createMainWindow();
    connectToWinBridge(0);
    updater.start();

    screen.on('display-added', () => sendBridgeCommand({ cmd: 'getMonitors' }));
    screen.on('display-removed', () => sendBridgeCommand({ cmd: 'getMonitors' }));
    screen.on('display-metrics-changed', () => sendBridgeCommand({ cmd: 'getMonitors' }));
  });

  app.on('window-all-closed', () => {
    if (isQuittingEverything) app.quit();
  });
}
