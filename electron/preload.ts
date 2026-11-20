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
};

contextBridge.exposeInMainWorld('crosshairAPI', api);
