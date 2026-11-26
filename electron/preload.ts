import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronBridgeAPI {
  isElectron: boolean;
  windowControl: (action: 'minimize' | 'maximize' | 'close' | 'quit') => void;
  getMonitors: () => Promise<unknown[]>;
  getSafetyAudit: () => Promise<unknown>;
  syncOverlayState: (payload: {
    enabled: boolean;
    activeConfig: unknown;
    secondaryAdsConfig: unknown | null;
    monitorIndex: number;
  }) => void;
  updateBridgeConfig: (config: {
    strictStaticMode: boolean;
    foregroundWatch: boolean;
    topmostKeepAlive: boolean;
    minimizeToTray: boolean;
    toggleVk: number;
    toggleAlt: boolean;
    toggleCtrl: boolean;
    toggleShift: boolean;
    adsCustomVk: number;
  }) => void;
  updateTrayProfiles: (profiles: Array<{ id: string; name: string; active: boolean }>) => void;
  openWindowsGraphicsSettings: () => void;
  loadPersistedState: () => Promise<unknown | null>;
  savePersistedState: (data: unknown) => void;

  // Auto-Updater (GitHub Releases + Commits)
  getUpdaterState: () => Promise<unknown>;
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => void;
  pullCommitUpdate: () => Promise<void>;
  updateUpdaterConfig: (cfg: {
    channel?: 'both' | 'releases' | 'commits';
    autoCheck?: boolean;
    autoDownload?: boolean;
    checkIntervalMinutes?: number;
  }) => void;
  openExternalUrl: (url?: string) => void;
  onUpdaterState: (cb: (state: unknown) => void) => () => void;

  onInputState: (cb: (state: unknown) => void) => () => void;
  onHotkeyEvent: (cb: (evt: unknown) => void) => () => void;
  onForegroundChange: (cb: (title: string) => void) => () => void;
  onMonitorsUpdate: (cb: (monitors: unknown[]) => void) => () => void;
  onSafetyAuditUpdate: (cb: (audit: unknown) => void) => () => void;
  onOverlayPayload: (cb: (payload: unknown) => void) => () => void;
  onTrayAction: (cb: (action: { type: string; profileId?: string }) => void) => () => void;

  // Gunshot Limiter & Footstep EQ
  syncAudioLimiter: (cfg: unknown) => void;
  getAudioDevices: () => Promise<{ devices: unknown[]; processes: string[] }>;
  onAudioTelemetry: (cb: (telemetry: unknown) => void) => () => void;
  onAudioDevicesUpdate: (cb: (payload: { devices: unknown[]; processes: string[] }) => void) => () => void;

  // ROB RUN Competitive Config & FPS Optimizer
  syncOptimizerConfig: (cfg: unknown) => void;
  getOptimizerStatus: () => Promise<unknown>;
  applyOptimizerNow: (cfg: unknown) => void;
  restoreOptimizerBackup: () => void;
  restoreDesktopNow: () => void;
  launchRobRunOptimized: (cfg: unknown) => void;
  openLocalPath: (targetPath: string) => void;
  onOptimizerStatus: (cb: (status: unknown) => void) => () => void;
  onOptimizerActionResult: (cb: (res: { action: string; ok: boolean; message: string }) => void) => () => void;

  // Color Filters & Shadow Boost (Unified HyperHue Engine)
  syncColorFilter: (config: unknown, flash?: boolean) => void;
  getColorStatus: () => Promise<unknown>;
  previewColorHud: () => void;
  unlockGammaRange: () => void;
  captureCleanScreen: () => Promise<string | null>;
  onColorStatus: (cb: (status: unknown) => void) => () => void;
  onColorConfigSync: (cb: (payload: { config: unknown; status: unknown }) => void) => () => void;
  onColorActionResult: (cb: (res: { action: string; ok: boolean; message: string }) => void) => () => void;

  // PC & Latency Tuner
  syncSystemTuner: (cfg: unknown) => void;
  getSystemTunerStatus: () => Promise<unknown>;
  applySystemUserTweaks: (cfg: unknown) => void;
  applySystemKernelTweaks: (cfg: unknown) => void;
  restoreSystemDefaults: () => void;
  purgeStandbyRam: () => void;
  cleanShaderCache: () => void;
  onSystemTunerStatus: (cb: (status: unknown) => void) => () => void;
  onSystemTunerActionResult: (cb: (res: { action: string; ok: boolean; message: string }) => void) => () => void;
}

const api: ElectronBridgeAPI = {
  isElectron: true,
  windowControl: (action) => ipcRenderer.send('window:control', action),
  getMonitors: () => ipcRenderer.invoke('monitors:get'),
  getSafetyAudit: () => ipcRenderer.invoke('safety:get'),
  syncOverlayState: (payload) => ipcRenderer.send('overlay:sync', payload),
  updateBridgeConfig: (config) => ipcRenderer.send('bridge:config', config),
  updateTrayProfiles: (profiles) => ipcRenderer.send('tray:profiles', profiles),
  openWindowsGraphicsSettings: () => ipcRenderer.send('system:openGraphicsSettings'),
  loadPersistedState: () => ipcRenderer.invoke('store:load'),
  savePersistedState: (data) => ipcRenderer.send('store:save', data),

  getUpdaterState: () => ipcRenderer.invoke('updater:getState'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.send('updater:install'),
  pullCommitUpdate: () => ipcRenderer.invoke('updater:pullCommit'),
  updateUpdaterConfig: (cfg) => ipcRenderer.send('updater:config', cfg),
  openExternalUrl: (url) => ipcRenderer.send('updater:openUrl', url),
  onUpdaterState: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, state: unknown) => cb(state);
    ipcRenderer.on('updater:state', handler);
    return () => ipcRenderer.removeListener('updater:state', handler);
  },

  onInputState: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('bridge:input', handler);
    return () => ipcRenderer.removeListener('bridge:input', handler);
  },
  onHotkeyEvent: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('bridge:hotkey', handler);
    return () => ipcRenderer.removeListener('bridge:hotkey', handler);
  },
  onForegroundChange: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, title: string) => cb(title);
    ipcRenderer.on('bridge:foreground', handler);
    return () => ipcRenderer.removeListener('bridge:foreground', handler);
  },
  onMonitorsUpdate: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, monitors: unknown[]) => cb(monitors);
    ipcRenderer.on('bridge:monitors', handler);
    return () => ipcRenderer.removeListener('bridge:monitors', handler);
  },
  onSafetyAuditUpdate: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, audit: unknown) => cb(audit);
    ipcRenderer.on('bridge:safety', handler);
    return () => ipcRenderer.removeListener('bridge:safety', handler);
  },
  onOverlayPayload: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on('overlay:payload', handler);
    return () => ipcRenderer.removeListener('overlay:payload', handler);
  },
  onTrayAction: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, action: { type: string; profileId?: string }) => cb(action);
    ipcRenderer.on('tray:action', handler);
    return () => ipcRenderer.removeListener('tray:action', handler);
  },

  syncAudioLimiter: (cfg) => ipcRenderer.send('audio:sync', cfg),
  getAudioDevices: () => ipcRenderer.invoke('audio:getDevices'),
  onAudioTelemetry: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('bridge:audioTelemetry', handler);
    return () => ipcRenderer.removeListener('bridge:audioTelemetry', handler);
  },
  onAudioDevicesUpdate: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { devices: unknown[]; processes: string[] }) => cb(data);
    ipcRenderer.on('bridge:audioDevices', handler);
    return () => ipcRenderer.removeListener('bridge:audioDevices', handler);
  },

  syncOptimizerConfig: (cfg) => ipcRenderer.send('optimizer:sync', cfg),
  getOptimizerStatus: () => ipcRenderer.invoke('optimizer:getStatus'),
  applyOptimizerNow: (cfg) => ipcRenderer.send('optimizer:applyNow', cfg),
  restoreOptimizerBackup: () => ipcRenderer.send('optimizer:restoreBackup'),
  restoreDesktopNow: () => ipcRenderer.send('optimizer:restoreDesktop'),
  launchRobRunOptimized: (cfg) => ipcRenderer.send('optimizer:launchGame', cfg),
  openLocalPath: (targetPath) => ipcRenderer.send('optimizer:openPath', targetPath),
  onOptimizerStatus: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('bridge:optimizerStatus', handler);
    return () => ipcRenderer.removeListener('bridge:optimizerStatus', handler);
  },
  onOptimizerActionResult: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { action: string; ok: boolean; message: string }) => cb(data);
    ipcRenderer.on('bridge:optimizerActionResult', handler);
    return () => ipcRenderer.removeListener('bridge:optimizerActionResult', handler);
  },

  syncColorFilter: (config, flash) => ipcRenderer.send('color:sync', { config, flash }),
  getColorStatus: () => ipcRenderer.invoke('color:getStatus'),
  previewColorHud: () => ipcRenderer.send('color:previewHud'),
  unlockGammaRange: () => ipcRenderer.send('color:unlockGamma'),
  captureCleanScreen: () => ipcRenderer.invoke('color:captureScreen'),
  onColorStatus: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('bridge:colorStatus', handler);
    return () => ipcRenderer.removeListener('bridge:colorStatus', handler);
  },
  onColorConfigSync: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { config: unknown; status: unknown }) => cb(data);
    ipcRenderer.on('bridge:colorConfigSync', handler);
    return () => ipcRenderer.removeListener('bridge:colorConfigSync', handler);
  },
  onColorActionResult: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { action: string; ok: boolean; message: string }) => cb(data);
    ipcRenderer.on('bridge:colorActionResult', handler);
    return () => ipcRenderer.removeListener('bridge:colorActionResult', handler);
  },

  syncSystemTuner: (cfg) => ipcRenderer.send('tuner:sync', cfg),
  getSystemTunerStatus: () => ipcRenderer.invoke('tuner:getStatus'),
  applySystemUserTweaks: (cfg) => ipcRenderer.send('tuner:applyUser', cfg),
  applySystemKernelTweaks: (cfg) => ipcRenderer.send('tuner:applyKernel', cfg),
  restoreSystemDefaults: () => ipcRenderer.send('tuner:restoreDefaults'),
  purgeStandbyRam: () => ipcRenderer.send('tuner:purgeRam'),
  cleanShaderCache: () => ipcRenderer.send('tuner:cleanCache'),
  onSystemTunerStatus: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('bridge:systemTunerStatus', handler);
    return () => ipcRenderer.removeListener('bridge:systemTunerStatus', handler);
  },
  onSystemTunerActionResult: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { action: string; ok: boolean; message: string }) => cb(data);
    ipcRenderer.on('bridge:systemTunerActionResult', handler);
    return () => ipcRenderer.removeListener('bridge:systemTunerActionResult', handler);
  },
};

contextBridge.exposeInMainWorld('crosshairAPI', api);
