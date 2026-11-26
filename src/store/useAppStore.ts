import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AchievementProgress,
  AimSessionRecord,
  AppSettings,
  AudioEndpointInfo,
  AudioLimiterConfig,
  AudioTelemetryState,
  ColorFilterConfig,
  ColorFilterStatus,
  CrosshairConfig,
  DEFAULT_INPUT_STATE,
  LiveInputState,
  MonitorInfo,
  RobRunOptimizerConfig,
  RobRunOptimizerStatus,
  SafetyAuditStatus,
  SavedProfile,
  SystemTunerConfig,
  SystemTunerStatus,
  UpdateChannel,
  UpdaterState,
  createDefaultAudioLimiterConfig,
  createDefaultColorFilterConfig,
  createDefaultCrosshair,
  createDefaultRobRunOptimizerConfig,
  createDefaultSystemTunerConfig,
} from '../types/crosshair';
import { COMMUNITY_PRESETS, CommunityPresetItem } from '../data/presets';
import { AchievementDefinition, createInitialAchievementProgress, evaluateAchievements } from '../data/achievements';

export type NavTab =
  | 'designer'
  | 'community'
  | 'profiles'
  | 'aim-trainer'
  | 'color-filters'
  | 'audio-limiter'
  | 'fps-optimizer'
  | 'monitors'
  | 'keybinds'
  | 'achievements'
  | 'safety';

export interface ToastNotice {
  id: string;
  title: string;
  message: string;
  tone: 'cyan' | 'emerald' | 'amber' | 'rose';
}

interface PersistedData {
  activeConfig: CrosshairConfig;
  activeProfileId: string | null;
  profiles: SavedProfile[];
  favoritePresetIds: string[];
  userPublishedPresets: CommunityPresetItem[];
  aimHistory: AimSessionRecord[];
  achievements: AchievementProgress;
  settings: AppSettings;
  audioLimiter: AudioLimiterConfig;
  robRunOptimizer: RobRunOptimizerConfig;
  colorFilter: ColorFilterConfig;
  systemTuner: SystemTunerConfig;
}

const DEFAULT_SETTINGS: AppSettings = {
  overlayEnabled: true,
  selectedMonitorIndex: 0,
  strictStaticMode: false,
  autoSwitchPerGame: false,
  topmostKeepAlive: true,
  minimizeToTray: true,
  launchWithOverlayOn: true,
  language: 'en',
  updater: {
    channel: 'both',
    autoCheck: true,
    autoDownload: true,
    checkIntervalMinutes: 30,
  },
  toggleHotkey: {
    vk: 0x58, // X
    label: 'Alt + X',
    alt: true,
    ctrl: false,
    shift: false,
  },
  adsCustomKey: {
    vk: 0,
    label: 'None',
  },
  aimSettings: {
    fov: 90,
    sensitivity: 1.0,
    gamePreset: 'valorant',
    inGameSens: 0.35,
    dpi: 800,
    soundEnabled: true,
    soundVolume: 0.45,
    targetColor: '#00f5ff',
    wallTheme: 'obsidian',
    durationSec: 45,
  },
};

function createStarterProfiles(): SavedProfile[] {
  const now = Date.now();
  const starterConfigs = [
    createDefaultCrosshair(),
    COMMUNITY_PRESETS[1].config, // T-Shape Headhunter
    COMMUNITY_PRESETS[10].config, // Apex Hipfire Halo
    COMMUNITY_PRESETS[23].config, // Pure Micro Dot 2px
    COMMUNITY_PRESETS[30].config, // Hit-Confirm Burst X
  ];
  const gameMatchers = [
    ['VALORANT', 'Counter-Strike 2'],
    ['Counter-Strike', 'CS2'],
    ['Apex Legends', 'Call of Duty', 'Warzone'],
    ['Rust', 'EscapeFromTarkov'],
    ['Overwatch', 'Fortnite'],
  ];

  return starterConfigs.map((cfg, idx) => ({
    id: `starter-${idx + 1}`,
    config: structuredClone(cfg),
    monitorIndex: 0,
    gameTitleMatchers: gameMatchers[idx] ?? [],
    quickSlot: idx,
    createdAt: now - (5 - idx) * 60000,
    updatedAt: now - (5 - idx) * 60000,
  }));
}

function normalizeCrosshairConfig(raw?: Partial<CrosshairConfig> | null): CrosshairConfig {
  const base = createDefaultCrosshair();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    lines: { ...base.lines, ...(raw.lines ?? {}) },
    outerLines: { ...base.outerLines, ...(raw.outerLines ?? {}) },
    dot: { ...base.dot, ...(raw.dot ?? {}) },
    ring: { ...base.ring, ...(raw.ring ?? {}) },
    outline: { ...base.outline, ...(raw.outline ?? {}) },
    image: { ...base.image, ...(raw.image ?? {}) },
    animation: { ...base.animation, ...(raw.animation ?? {}) },
    position: { ...base.position, ...(raw.position ?? {}) },
  };
}

function normalizeAchievements(raw?: Partial<AchievementProgress> | null): AchievementProgress {
  const base = createInitialAchievementProgress();
  if (!raw || typeof raw !== 'object') return base;
  return {
    unlockedIds: Array.isArray(raw.unlockedIds) ? raw.unlockedIds : base.unlockedIds,
    unlockedAt: raw.unlockedAt && typeof raw.unlockedAt === 'object' ? raw.unlockedAt : base.unlockedAt,
    stats: { ...base.stats, ...(raw.stats ?? {}) },
  };
}

const LS_KEY = 'zeropoint-state-v1';
const LEGACY_LS_KEY = 'crosshair-studio-x-v1';

interface ElectronAPI {
  isElectron: boolean;
  windowControl: (action: 'minimize' | 'maximize' | 'close' | 'quit') => void;
  getMonitors: () => Promise<MonitorInfo[]>;
  getSafetyAudit: () => Promise<SafetyAuditStatus>;
  syncOverlayState: (payload: {
    enabled: boolean;
    activeConfig: CrosshairConfig;
    secondaryAdsConfig: CrosshairConfig | null;
    monitorIndex: number;
  }) => void;
  updateBridgeConfig: (cfg: Record<string, unknown>) => void;
  updateTrayProfiles: (profiles: Array<{ id: string; name: string; active: boolean }>) => void;
  openWindowsGraphicsSettings: () => void;
  loadPersistedState: () => Promise<Partial<PersistedData> | null>;
  savePersistedState: (data: PersistedData) => void;
  getUpdaterState: () => Promise<UpdaterState | null>;
  checkForUpdates: () => Promise<UpdaterState | null>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => void;
  pullCommitUpdate: () => Promise<void>;
  updateUpdaterConfig: (cfg: {
    channel?: UpdateChannel;
    autoCheck?: boolean;
    autoDownload?: boolean;
    checkIntervalMinutes?: number;
  }) => void;
  openExternalUrl: (url?: string) => void;
  onUpdaterState: (cb: (state: UpdaterState) => void) => () => void;
  onInputState: (cb: (state: LiveInputState) => void) => () => void;
  onHotkeyEvent: (cb: (evt: { action: string; dx?: number; dy?: number; slot?: number }) => void) => () => void;
  onForegroundChange: (cb: (title: string) => void) => () => void;
  onMonitorsUpdate: (cb: (monitors: MonitorInfo[]) => void) => () => void;
  onSafetyAuditUpdate: (cb: (audit: SafetyAuditStatus) => void) => () => void;
  onTrayAction: (cb: (action: { type: string; profileId?: string }) => void) => () => void;

  syncAudioLimiter: (cfg: AudioLimiterConfig) => void;
  getAudioDevices: () => Promise<{ devices: AudioEndpointInfo[]; processes: string[] }>;
  onAudioTelemetry: (cb: (telemetry: AudioTelemetryState) => void) => () => void;
  onAudioDevicesUpdate: (cb: (payload: { devices: AudioEndpointInfo[]; processes: string[] }) => void) => () => void;

  syncOptimizerConfig: (cfg: RobRunOptimizerConfig) => void;
  getOptimizerStatus: () => Promise<RobRunOptimizerStatus | null>;
  applyOptimizerNow: (cfg: RobRunOptimizerConfig) => void;
  restoreOptimizerBackup: () => void;
  restoreDesktopNow: () => void;
  launchRobRunOptimized: (cfg: RobRunOptimizerConfig) => void;
  openLocalPath: (targetPath: string) => void;
  onOptimizerStatus: (cb: (status: RobRunOptimizerStatus) => void) => () => void;
  onOptimizerActionResult: (cb: (res: { action: string; ok: boolean; message: string }) => void) => () => void;

  syncColorFilter: (config: ColorFilterConfig, flash?: boolean) => void;
  getColorStatus: () => Promise<ColorFilterStatus | null>;
  previewColorHud: () => void;
  unlockGammaRange: () => void;
  captureCleanScreen: () => Promise<string | null>;
  onColorStatus: (cb: (status: ColorFilterStatus) => void) => () => void;
  onColorConfigSync: (cb: (payload: { config: ColorFilterConfig; status: ColorFilterStatus }) => void) => () => void;
  onColorActionResult: (cb: (res: { action: string; ok: boolean; message: string }) => void) => () => void;

  syncSystemTuner: (cfg: SystemTunerConfig) => void;
  getSystemTunerStatus: () => Promise<SystemTunerStatus | null>;
  applySystemUserTweaks: (cfg: SystemTunerConfig) => void;
  applySystemKernelTweaks: (cfg: SystemTunerConfig) => void;
  restoreSystemDefaults: () => void;
  purgeStandbyRam: () => void;
  cleanShaderCache: () => void;
  onSystemTunerStatus: (cb: (status: SystemTunerStatus) => void) => () => void;
  onSystemTunerActionResult: (cb: (res: { action: string; ok: boolean; message: string }) => void) => () => void;
}

export function getElectronAPI(): ElectronAPI | undefined {
  return (window as unknown as { crosshairAPI?: ElectronAPI }).crosshairAPI;
}

export function useAppStore() {
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('designer');
  const [activeConfig, setActiveConfig] = useState<CrosshairConfig>(createDefaultCrosshair);
  const [activeProfileId, setActiveProfileId] = useState<string | null>('starter-1');
  const [profiles, setProfiles] = useState<SavedProfile[]>(createStarterProfiles);
  const [favoritePresetIds, setFavoritePresetIds] = useState<string[]>(['tac-cyan-razor', 'br-hipfire-halo']);
  const [userPublishedPresets, setUserPublishedPresets] = useState<CommunityPresetItem[]>([]);
  const [aimHistory, setAimHistory] = useState<AimSessionRecord[]>([]);
  const [achievements, setAchievements] = useState<AchievementProgress>(createInitialAchievementProgress);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [audioLimiter, setAudioLimiter] = useState<AudioLimiterConfig>(createDefaultAudioLimiterConfig);
  const [audioEndpoints, setAudioEndpoints] = useState<AudioEndpointInfo[]>([]);
  const [runningProcesses, setRunningProcesses] = useState<string[]>([]);
  const [audioTelemetry, setAudioTelemetry] = useState<AudioTelemetryState>({
    status: 'waiting',
    processName: 'ROB RUN.exe',
    pid: 0,
    profileId: 'robrun',
    inputDb: -60,
    outputDb: -60,
    gainReductionDb: 0,
    footstepLiftDb: 0,
    peakProtectedCount: 0,
  });

  const [robRunOptimizer, setRobRunOptimizer] = useState<RobRunOptimizerConfig>(createDefaultRobRunOptimizerConfig);
  const [systemTuner, setSystemTuner] = useState<SystemTunerConfig>(createDefaultSystemTunerConfig);
  const [systemTunerStatus, setSystemTunerStatus] = useState<SystemTunerStatus>({
    cpuName: 'Multi-Core x64 Processor',
    cpuThreads: 16,
    gpuName: 'DirectX 12 GPU',
    totalRamGb: 32,
    usedRamGb: 11.4,
    availRamGb: 20.6,
    ramLoadPct: 36,
    timerResolutionMs: 0.5,
    timerLocked: true,
    activePowerPlanGuid: '',
    activePowerPlanName: 'Ultimate Performance',
    hasSystemBackup: false,
    optimizationScorePct: 82,
    liveStates: {
      rawMouseInput: true,
      disableGameDvr: true,
      enableGameMode: true,
      disableTransparency: false,
      disableBackgroundApps: true,
      fastKeyboardResponse: true,
      cpuForegroundBoost: false,
      win32PriorityValue: 2,
      mmcssGamesPriority: true,
      disablePowerThrottling: false,
      enableHags: true,
      disableMpo: false,
      tcpLowLatency: false,
    },
  });
  const [colorFilter, setColorFilter] = useState<ColorFilterConfig>(createDefaultColorFilterConfig);
  const [colorStatus, setColorStatus] = useState<ColorFilterStatus>({
    effectiveActive: false,
    effectiveName: 'Off',
    effectiveReason: 'Paused',
    foregroundProcess: '',
    filterReady: true,
    filterStatus: 'Screen filter ready',
    amdAvailable: false,
    amdStatus: 'Select AMD Radeon mode to link driver',
    lastPath: 'Off',
    gammaAchieved: 1,
    gammaLimited: false,
  });
  const [optimizerStatus, setOptimizerStatus] = useState<RobRunOptimizerStatus>({
    detectedInstallDir: '',
    detectedExePath: '',
    settingsFilePaths: [],
    hasBackup: false,
    gameRunning: false,
    gamePid: 0,
    displayStretchedActive: false,
    currentDesktopWidth: 1920,
    currentDesktopHeight: 1080,
    currentDesktopHz: 240,
    launchFlagsString: '-window-mode borderless -screen-width 1440 -screen-height 1080 -nolog',
    supportedModes: [
      { width: 1920, height: 1080, maxHz: 240, aspectLabel: '16:9 Native' },
      { width: 1440, height: 1080, maxHz: 240, aspectLabel: '4:3 Stretched' },
      { width: 1280, height: 1024, maxHz: 240, aspectLabel: '5:4 Stretched' },
      { width: 1280, height: 960, maxHz: 240, aspectLabel: '4:3 Stretched' },
    ],
    liveConfigSummary: null,
  });

  const [liveInput, setLiveInput] = useState<LiveInputState>(DEFAULT_INPUT_STATE);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([
    { index: 0, device: 'DISPLAY-1', primary: true, x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1 },
  ]);
  const [safetyAudit, setSafetyAudit] = useState<SafetyAuditStatus>({
    bridgeConnected: false,
    dllInjection: false,
    memoryAccess: false,
    globalInputHooks: false,
    syntheticInput: false,
    graphicsApiHooking: false,
    captureEvasion: false,
  });
  const [foregroundWindowTitle, setForegroundWindowTitle] = useState<string>('');
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [updaterState, setUpdaterState] = useState<UpdaterState>({
    status: 'idle',
    channel: 'both',
    autoCheck: true,
    autoDownload: true,
    checkIntervalMinutes: 30,
    isPackaged: false,
    hasLocalGit: false,
    repoOwner: 'sigmasigmaboi124',
    repoName: 'Crosshair',
    repoUrl: 'https://github.com/sigmasigmaboi124/Crosshair',
    branch: 'main',
    currentVersion: '1.0.0',
    currentCommitSha: 'local-dev',
    currentShortSha: 'local',
    builtAt: new Date().toISOString(),
    latestRelease: null,
    latestCommit: null,
    recentCommits: [],
    updateAvailableKind: 'none',
    canAutoInstallBinary: false,
    canPullCommitLocally: false,
    downloadProgress: null,
    commitSyncStep: null,
    lastCheckedAt: null,
    error: null,
  });

  const pushToast = useCallback((title: string, message: string, tone: ToastNotice['tone'] = 'cyan') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-1), { id, title, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const bumpStat = useCallback(
    (updater: (stats: AchievementProgress['stats']) => AchievementProgress['stats']) => {
      setAchievements((prev) => {
        const updated: AchievementProgress = {
          ...prev,
          stats: updater({ ...prev.stats }),
        };
        const { next, newlyUnlocked } = evaluateAchievements(updated);
        newlyUnlocked.forEach((def: AchievementDefinition) => {
          pushToast(`Achievement Unlocked (+${def.xp} XP)`, def.title, 'amber');
        });
        return next;
      });
    },
    [pushToast]
  );

  // Hydrate persisted state on boot
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const api = getElectronAPI();
      let raw: Partial<PersistedData> | null = null;
      if (api) {
        try {
          raw = await api.loadPersistedState();
        } catch {
          raw = null;
        }
      }
      if (!raw) {
        try {
          const str = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LEGACY_LS_KEY);
          if (str) raw = JSON.parse(str);
        } catch {
          raw = null;
        }
      }
      if (!cancelled && raw) {
        if (raw.activeConfig) setActiveConfig(normalizeCrosshairConfig(raw.activeConfig));
        if (raw.activeProfileId !== undefined) setActiveProfileId(raw.activeProfileId);
        if (Array.isArray(raw.profiles) && raw.profiles.length > 0) {
          setProfiles(
            raw.profiles.map((p) => ({
              ...p,
              config: normalizeCrosshairConfig(p.config),
              gameTitleMatchers: Array.isArray(p.gameTitleMatchers) ? p.gameTitleMatchers : [],
              monitorIndex: typeof p.monitorIndex === 'number' ? p.monitorIndex : 0,
              quickSlot: typeof p.quickSlot === 'number' ? p.quickSlot : null,
            }))
          );
        }
        if (Array.isArray(raw.favoritePresetIds)) setFavoritePresetIds(raw.favoritePresetIds);
        if (Array.isArray(raw.userPublishedPresets)) {
          setUserPublishedPresets(
            raw.userPublishedPresets.map((item) => ({
              ...item,
              config: normalizeCrosshairConfig(item.config),
            }))
          );
        }
        if (Array.isArray(raw.aimHistory)) setAimHistory(raw.aimHistory);
        if (raw.achievements) setAchievements(normalizeAchievements(raw.achievements));
        if (raw.settings) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...raw.settings,
            updater: { ...DEFAULT_SETTINGS.updater, ...(raw.settings.updater ?? {}) },
            toggleHotkey: { ...DEFAULT_SETTINGS.toggleHotkey, ...(raw.settings.toggleHotkey ?? {}) },
            adsCustomKey: { ...DEFAULT_SETTINGS.adsCustomKey, ...(raw.settings.adsCustomKey ?? {}) },
            aimSettings: { ...DEFAULT_SETTINGS.aimSettings, ...(raw.settings.aimSettings ?? {}) },
          });
        }
        if (raw.audioLimiter && typeof raw.audioLimiter === 'object') {
          const defAudio = createDefaultAudioLimiterConfig();
          setAudioLimiter({
            ...defAudio,
            ...raw.audioLimiter,
            profiles:
              Array.isArray(raw.audioLimiter.profiles) && raw.audioLimiter.profiles.length > 0
                ? raw.audioLimiter.profiles
                : defAudio.profiles,
          });
        }
        if (raw.robRunOptimizer && typeof raw.robRunOptimizer === 'object') {
          setRobRunOptimizer({
            ...createDefaultRobRunOptimizerConfig(),
            ...raw.robRunOptimizer,
          });
        }
        if (raw.colorFilter && typeof raw.colorFilter === 'object') {
          const defColor = createDefaultColorFilterConfig();
          setColorFilter({
            ...defColor,
            ...raw.colorFilter,
            working: { ...defColor.working, ...(raw.colorFilter.working ?? {}) },
            applied: { ...defColor.applied, ...(raw.colorFilter.applied ?? raw.colorFilter.working ?? {}) },
            customPresets: Array.isArray(raw.colorFilter.customPresets) ? raw.colorFilter.customPresets : [],
            rules: Array.isArray(raw.colorFilter.rules) ? raw.colorFilter.rules : [],
            hotkeys:
              Array.isArray(raw.colorFilter.hotkeys) && raw.colorFilter.hotkeys.length > 0
                ? raw.colorFilter.hotkeys
                : defColor.hotkeys,
          });
        }
        if (raw.systemTuner && typeof raw.systemTuner === 'object') {
          setSystemTuner({
            ...createDefaultSystemTunerConfig(),
            ...raw.systemTuner,
          });
        }
      }
      if (api) {
        try {
          const mons = await api.getMonitors();
          if (!cancelled && Array.isArray(mons) && mons.length > 0) setMonitors(mons);
          const audit = await api.getSafetyAudit();
          if (!cancelled && audit) setSafetyAudit(audit);
          const upd = await api.getUpdaterState();
          if (!cancelled && upd) setUpdaterState(upd);
          const audDev = await api.getAudioDevices();
          if (!cancelled && audDev) {
            if (Array.isArray(audDev.devices)) setAudioEndpoints(audDev.devices);
            if (Array.isArray(audDev.processes)) setRunningProcesses(audDev.processes);
          }
          const optSt = await api.getOptimizerStatus();
          if (!cancelled && optSt) setOptimizerStatus(optSt);
          const colSt = await api.getColorStatus();
          if (!cancelled && colSt) setColorStatus(colSt);
          const tunSt = await api.getSystemTunerStatus();
          if (!cancelled && tunSt) setSystemTunerStatus(tunSt);
        } catch {
          // Ignore
        }
      }
      if (!cancelled) setHydrated(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistNowRef = useRef<() => void>(() => {});
  persistNowRef.current = () => {
    if (!hydrated) return;
    const data: PersistedData = {
      activeConfig,
      activeProfileId,
      profiles,
      favoritePresetIds,
      userPublishedPresets,
      aimHistory,
      achievements,
      settings,
      audioLimiter,
      robRunOptimizer,
      colorFilter,
      systemTuner,
    };
    const api = getElectronAPI();
    if (api) api.savePersistedState(data);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota exceeded on huge custom images
    }
  };

  // Persist changes debounced + guarantee immediate flush before window close / update restart
  useEffect(() => {
    if (!hydrated) return;
    const handle = setTimeout(() => persistNowRef.current(), 250);
    return () => clearTimeout(handle);
  }, [
    hydrated,
    activeConfig,
    activeProfileId,
    profiles,
    favoritePresetIds,
    userPublishedPresets,
    aimHistory,
    achievements,
    settings,
    audioLimiter,
    robRunOptimizer,
    colorFilter,
    systemTuner,
  ]);

  useEffect(() => {
    const flush = () => persistNowRef.current();
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  // Sync live overlay window whenever active crosshair, ADS secondary profile, or monitor changes
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;
    const secondary = activeConfig.animation.adsSecondaryProfileId
      ? profiles.find((p) => p.id === activeConfig.animation.adsSecondaryProfileId)?.config ?? null
      : null;

    api.syncOverlayState({
      enabled: settings.overlayEnabled,
      activeConfig,
      secondaryAdsConfig: secondary,
      monitorIndex: settings.selectedMonitorIndex,
    });
  }, [activeConfig, profiles, settings.overlayEnabled, settings.selectedMonitorIndex]);

  // Sync WinBridge configuration
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;
    api.updateBridgeConfig({
      strictStaticMode: settings.strictStaticMode,
      foregroundWatch: settings.autoSwitchPerGame,
      topmostKeepAlive: settings.topmostKeepAlive,
      minimizeToTray: settings.minimizeToTray,
      toggleVk: settings.toggleHotkey.vk,
      toggleAlt: settings.toggleHotkey.alt,
      toggleCtrl: settings.toggleHotkey.ctrl,
      toggleShift: settings.toggleHotkey.shift,
      adsCustomVk: settings.adsCustomKey.vk,
    });
  }, [
    settings.strictStaticMode,
    settings.autoSwitchPerGame,
    settings.topmostKeepAlive,
    settings.minimizeToTray,
    settings.toggleHotkey,
    settings.adsCustomKey,
  ]);

  // Sync Auto-Updater config with Electron main
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;
    api.updateUpdaterConfig(settings.updater);
  }, [settings.updater]);

  // Sync System Tray profile menu
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;
    api.updateTrayProfiles(
      profiles.map((p) => ({
        id: p.id,
        name: p.config.name,
        active: p.id === activeProfileId,
      }))
    );
  }, [profiles, activeProfileId]);

  // Sync Process-Isolated Gunshot Limiter & Footstep EQ with WinBridge
  useEffect(() => {
    if (!hydrated) return;
    const api = getElectronAPI();
    if (!api) return;
    api.syncAudioLimiter(audioLimiter);
  }, [hydrated, audioLimiter]);

  // Sync ROB RUN Competitive Config & FPS Optimizer with WinBridge
  useEffect(() => {
    if (!hydrated) return;
    const api = getElectronAPI();
    if (!api) return;
    api.syncOptimizerConfig(robRunOptimizer);
  }, [hydrated, robRunOptimizer]);

  useEffect(() => {
    if (!hydrated) return;
    const api = getElectronAPI();
    if (!api) return;
    api.syncSystemTuner(systemTuner);
  }, [hydrated, systemTuner]);

  const colorFlashRef = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    const api = getElectronAPI();
    const shouldFlash = colorFlashRef.current;
    colorFlashRef.current = false;
    if (!api) {
      setColorStatus((prev) => ({
        ...prev,
        effectiveActive: colorFilter.enabled,
        effectiveName: colorFilter.enabled ? colorFilter.activePreset : 'Off',
        effectiveReason: colorFilter.enabled ? 'All apps & games' : 'Paused',
        lastPath: colorFilter.enabled ? 'Screen filter' : 'Off',
      }));
      return;
    }
    api.syncColorFilter(colorFilter, shouldFlash);
  }, [hydrated, colorFilter]);

  // Keep refs for event listeners
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const activeProfileIdRef = useRef(activeProfileId);
  activeProfileIdRef.current = activeProfileId;
  const autoSwitchRef = useRef(settings.autoSwitchPerGame);
  autoSwitchRef.current = settings.autoSwitchPerGame;

  const selectProfile = useCallback(
    (profileId: string, silent = false) => {
      const found = profilesRef.current.find((p) => p.id === profileId);
      if (!found) return;
      setActiveProfileId(found.id);
      setActiveConfig(structuredClone(found.config));
      setSettings((s) => ({ ...s, selectedMonitorIndex: found.monitorIndex }));
      if (!silent) {
        pushToast('Profile Loaded', found.config.name, 'cyan');
      }
    },
    [pushToast]
  );

  // Listen to Electron / WinBridge live events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsubs = [
      api.onInputState((inp) => setLiveInput(inp)),
      api.onMonitorsUpdate((mons) => setMonitors(mons)),
      api.onSafetyAuditUpdate((audit) => setSafetyAudit(audit)),
      api.onUpdaterState((upd) => {
        setUpdaterState((prev) => {
          if (prev.status !== 'downloaded' && upd.status === 'downloaded') {
            pushToast('Update Ready to Install', `Version ${upd.latestRelease?.version ?? ''} downloaded. Restart to apply.`, 'emerald');
          } else if (prev.status !== 'update-available' && upd.status === 'update-available') {
            const label =
              upd.updateAvailableKind === 'both'
                ? 'New Release & Commit detected'
                : upd.updateAvailableKind === 'release'
                ? `New Release ${upd.latestRelease?.tag ?? ''} available`
                : `New Commit ${upd.latestCommit?.shortSha ?? ''} on main`;
            pushToast('GitHub Update Found', label, 'cyan');
          }
          return upd;
        });
      }),
      api.onForegroundChange((title) => {
        setForegroundWindowTitle(title);
        if (!autoSwitchRef.current || !title) return;
        const lower = title.toLowerCase();
        const match = profilesRef.current.find((p) =>
          p.gameTitleMatchers.some((m) => m.trim() && lower.includes(m.trim().toLowerCase()))
        );
        if (match && match.id !== activeProfileIdRef.current) {
          selectProfile(match.id, false);
        }
      }),
      api.onHotkeyEvent((evt) => {
        if (evt.action === 'toggleOverlay') {
          setSettings((s) => {
            const nextOn = !s.overlayEnabled;
            pushToast(nextOn ? 'Overlay Activated' : 'Overlay Paused', s.toggleHotkey.label, nextOn ? 'emerald' : 'amber');
            return { ...s, overlayEnabled: nextOn };
          });
        } else if (evt.action === 'nextProfile' || evt.action === 'prevProfile') {
          const list = profilesRef.current;
          if (list.length === 0) return;
          const idx = list.findIndex((p) => p.id === activeProfileIdRef.current);
          const nextIdx =
            evt.action === 'nextProfile'
              ? (idx + 1) % list.length
              : (idx - 1 + list.length) % list.length;
          selectProfile(list[nextIdx].id);
        } else if (evt.action === 'quickSlot' && typeof evt.slot === 'number') {
          const match = profilesRef.current.find((p) => p.quickSlot === evt.slot);
          if (match) selectProfile(match.id);
        } else if (evt.action === 'nudge') {
          const dx = evt.dx ?? 0;
          const dy = evt.dy ?? 0;
          setActiveConfig((prev) => ({
            ...prev,
            position: {
              ...prev.position,
              offsetX: Math.max(-500, Math.min(500, prev.position.offsetX + dx)),
              offsetY: Math.max(-500, Math.min(500, prev.position.offsetY + dy)),
            },
          }));
        }
      }),
      api.onTrayAction((action) => {
        if (action.type === 'toggleOverlay') {
          setSettings((s) => ({ ...s, overlayEnabled: !s.overlayEnabled }));
        } else if (action.type === 'selectProfile' && action.profileId) {
          selectProfile(action.profileId);
        } else if (action.type === 'openAimTrainer') {
          setActiveTab('aim-trainer');
        } else if (action.type === 'openAudioLimiter') {
          setActiveTab('audio-limiter');
        } else if (action.type === 'openFpsOptimizer') {
          setActiveTab('fps-optimizer');
        } else if (action.type === 'openColorFilters') {
          setActiveTab('color-filters');
        } else if (action.type === 'openUpdates') {
          setActiveTab('safety');
        }
      }),
      api.onAudioTelemetry((tel) => setAudioTelemetry(tel)),
      api.onAudioDevicesUpdate((payload) => {
        if (Array.isArray(payload.devices)) setAudioEndpoints(payload.devices);
        if (Array.isArray(payload.processes)) setRunningProcesses(payload.processes);
      }),
      api.onOptimizerStatus((st) => setOptimizerStatus(st)),
      api.onOptimizerActionResult((res) => {
        pushToast(
          res.ok ? 'ROB RUN Optimizer' : 'Optimizer Notice',
          res.message,
          res.ok ? 'emerald' : 'rose'
        );
      }),
      api.onColorStatus((st) => setColorStatus(st)),
      api.onColorConfigSync((payload) => {
        if (payload.config) setColorFilter(payload.config);
        if (payload.status) setColorStatus(payload.status);
      }),
      api.onColorActionResult((res) => {
        pushToast(
          res.ok ? 'Color Filter' : 'Color Filter Notice',
          res.message,
          res.ok ? 'emerald' : 'amber'
        );
      }),
      api.onSystemTunerStatus((st) => setSystemTunerStatus(st)),
      api.onSystemTunerActionResult((res) => {
        pushToast(
          res.ok ? 'PC & FPS Optimizer' : 'Optimizer Notice',
          res.message,
          res.ok ? 'emerald' : 'amber'
        );
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [pushToast, selectProfile]);

  const updateActiveConfig = useCallback(
    (updater: (prev: CrosshairConfig) => CrosshairConfig, trackCreation = true) => {
      setActiveConfig((prev) => updater(prev));
      if (trackCreation) {
        bumpStat((s) => ({ ...s, crosshairsCreated: Math.max(1, s.crosshairsCreated) }));
      }
    },
    [bumpStat]
  );

  const saveCurrentAsProfile = useCallback(
    (nameOverride?: string, overwriteActive = false) => {
      const now = Date.now();
      const cfgCopy = structuredClone(activeConfig);
      if (nameOverride && nameOverride.trim()) cfgCopy.name = nameOverride.trim();

      if (overwriteActive && activeProfileId) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === activeProfileId
              ? { ...p, config: cfgCopy, monitorIndex: settings.selectedMonitorIndex, updatedAt: now }
              : p
          )
        );
        pushToast('Profile Updated', cfgCopy.name, 'emerald');
        return;
      }

      const newId = `profile-${now}`;
      cfgCopy.id = newId;
      const newProfile: SavedProfile = {
        id: newId,
        config: cfgCopy,
        monitorIndex: settings.selectedMonitorIndex,
        gameTitleMatchers: [],
        quickSlot: null,
        createdAt: now,
        updatedAt: now,
      };
      setProfiles((prev) => {
        const next = [newProfile, ...prev];
        bumpStat((s) => ({ ...s, profilesSaved: next.length, crosshairsCreated: s.crosshairsCreated + 1 }));
        return next;
      });
      setActiveProfileId(newId);
      pushToast('Profile Saved', cfgCopy.name, 'emerald');
    },
    [activeConfig, activeProfileId, settings.selectedMonitorIndex, bumpStat, pushToast]
  );

  const deleteProfile = useCallback(
    (id: string) => {
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (activeProfileId === id) setActiveProfileId(null);
      pushToast('Profile Removed', 'Deleted from your saved armory.', 'rose');
    },
    [activeProfileId, pushToast]
  );

  const updateProfileMeta = useCallback(
    (id: string, patch: Partial<Pick<SavedProfile, 'monitorIndex' | 'gameTitleMatchers' | 'quickSlot'>>) => {
      setProfiles((prev) =>
        prev.map((p) => {
          // Ensure quickSlot uniqueness
          if (patch.quickSlot !== undefined && patch.quickSlot !== null && p.id !== id && p.quickSlot === patch.quickSlot) {
            return { ...p, quickSlot: null };
          }
          if (p.id === id) {
            return { ...p, ...patch, updatedAt: Date.now() };
          }
          return p;
        })
      );
    },
    []
  );

  const applyCommunityPreset = useCallback(
    (config: CrosshairConfig, cloneToDesigner = false) => {
      const cloned = structuredClone(config);
      setActiveConfig(cloned);
      setActiveProfileId(null);
      bumpStat((s) => ({ ...s, communityApplied: s.communityApplied + 1 }));
      if (cloneToDesigner) {
        setActiveTab('designer');
        pushToast('Cloned to Designer', `${config.name} is ready for editing.`, 'cyan');
      } else {
        pushToast('Crosshair Applied Live', config.name, 'emerald');
      }
    },
    [bumpStat, pushToast]
  );

  const toggleFavoritePreset = useCallback((id: string) => {
    setFavoritePresetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const publishToCommunity = useCallback(
    (title: string, author: string, category: CrosshairConfig['category'], tags: string[], description: string) => {
      const cfg = structuredClone(activeConfig);
      cfg.id = `community-user-${Date.now()}`;
      cfg.name = title.trim() || cfg.name;
      cfg.author = author.trim() || 'Operator';
      cfg.category = category;
      cfg.tags = tags;
      cfg.description = description.trim() || 'Custom community reticle design.';
      const item: CommunityPresetItem = {
        config: cfg,
        downloads: 1,
        likes: 1,
        isUserPublished: true,
      };
      setUserPublishedPresets((prev) => [item, ...prev]);
      bumpStat((s) => ({ ...s, crosshairsCreated: s.crosshairsCreated + 1 }));
      pushToast('Published to Workshop Hub', cfg.name, 'emerald');
    },
    [activeConfig, bumpStat, pushToast]
  );

  const recordAimSession = useCallback(
    (session: AimSessionRecord) => {
      setAimHistory((prev) => [session, ...prev].slice(0, 200));
      bumpStat((s) => ({
        ...s,
        aimRunsCompleted: s.aimRunsCompleted + 1,
        aimTargetsHit: s.aimTargetsHit + session.hits,
        bestAccuracy: Math.max(s.bestAccuracy, session.accuracy),
        bestGridshotScore: session.mode === 'gridshot' ? Math.max(s.bestGridshotScore, session.score) : s.bestGridshotScore,
        dailyChallengesDone: session.mode === 'daily' ? s.dailyChallengesDone + 1 : s.dailyChallengesDone,
      }));
    },
    [bumpStat]
  );

  return {
    activeTab,
    setActiveTab,
    activeConfig,
    updateActiveConfig,
    setActiveConfig,
    activeProfileId,
    profiles,
    setProfiles,
    selectProfile,
    saveCurrentAsProfile,
    deleteProfile,
    updateProfileMeta,
    favoritePresetIds,
    toggleFavoritePreset,
    userPublishedPresets,
    publishToCommunity,
    applyCommunityPreset,
    aimHistory,
    recordAimSession,
    achievements,
    bumpStat,
    settings,
    setSettings,
    audioLimiter,
    setAudioLimiter,
    audioEndpoints,
    runningProcesses,
    audioTelemetry,
    refreshAudioDevices: async () => {
      const api = getElectronAPI();
      if (!api) return;
      const res = await api.getAudioDevices();
      if (res) {
        if (Array.isArray(res.devices)) setAudioEndpoints(res.devices);
        if (Array.isArray(res.processes)) setRunningProcesses(res.processes);
      }
    },
    robRunOptimizer,
    setRobRunOptimizer,
    optimizerStatus,
    refreshOptimizerStatus: async () => {
      const api = getElectronAPI();
      if (!api) return;
      const st = await api.getOptimizerStatus();
      if (st) setOptimizerStatus(st);
    },
    applyRobRunOptimizerNow: (cfgOverride?: RobRunOptimizerConfig) => {
      const target = cfgOverride ?? robRunOptimizer;
      const api = getElectronAPI();
      if (api) {
        api.applyOptimizerNow(target);
      } else {
        pushToast('Applied Preview', `Saved ${target.resWidth}×${target.resHeight} @ ${target.refreshRateHz}Hz preset.`, 'emerald');
      }
    },
    restoreRobRunOriginal: () => {
      const api = getElectronAPI();
      if (api) api.restoreOptimizerBackup();
      else pushToast('Desktop Feature', 'Run in ZeroPoint Desktop to restore game files.', 'cyan');
    },
    restoreDesktopDisplayNow: () => {
      const api = getElectronAPI();
      if (api) api.restoreDesktopNow();
      else pushToast('Desktop Restored', 'Returned display to normal desktop resolution.', 'emerald');
    },
    launchRobRunOptimized: () => {
      const api = getElectronAPI();
      if (api) api.launchRobRunOptimized(robRunOptimizer);
      else pushToast('Desktop Feature', 'Launch via ZeroPoint Desktop to start Steam with flags.', 'cyan');
    },
    openLocalPath: (targetPath: string) => {
      const api = getElectronAPI();
      if (api) api.openLocalPath(targetPath);
    },
    colorFilter,
    setColorFilter,
    updateColorFilter: (updater: (prev: ColorFilterConfig) => ColorFilterConfig, flash = false) => {
      colorFlashRef.current = flash;
      setColorFilter((prev) => updater(prev));
    },
    colorStatus,
    previewColorHud: () => {
      const api = getElectronAPI();
      if (api) api.previewColorHud();
      else pushToast('Color HUD Preview', `${colorFilter.activePreset} (${colorFilter.hudCorner})`, 'cyan');
    },
    unlockGammaRange: () => {
      const api = getElectronAPI();
      if (api) api.unlockGammaRange();
      else pushToast('Desktop Feature', 'Run in ZeroPoint Desktop to unlock Windows gamma range.', 'cyan');
    },
    captureCleanScreen: async (): Promise<string | null> => {
      const api = getElectronAPI();
      if (!api) return null;
      return api.captureCleanScreen();
    },
    systemTuner,
    setSystemTuner,
    systemTunerStatus,
    refreshSystemTunerStatus: async () => {
      const api = getElectronAPI();
      if (!api) return;
      const st = await api.getSystemTunerStatus();
      if (st) setSystemTunerStatus(st);
    },
    applySystemUserTweaksNow: (nextCfg?: SystemTunerConfig) => {
      const target = nextCfg ?? systemTuner;
      const api = getElectronAPI();
      if (api) api.applySystemUserTweaks(target);
      else {
        setSystemTunerStatus((prev) => ({
          ...prev,
          timerLocked: target.lockTimerResolution,
          timerResolutionMs: target.lockTimerResolution ? 0.5 : 15.62,
          activePowerPlanName: target.activateUltimatePower ? 'Ultimate Performance' : 'Balanced',
          hasSystemBackup: true,
          liveStates: {
            ...prev.liveStates,
            rawMouseInput: target.rawMouseInput,
            disableGameDvr: target.disableGameDvr,
            enableGameMode: target.enableGameMode,
            disableTransparency: target.disableTransparency,
            disableBackgroundApps: target.disableBackgroundApps,
            fastKeyboardResponse: target.fastKeyboardResponse,
          },
        }));
        pushToast('PC Tweaks Applied', 'Updated mouse, GameDVR, Game Mode, power plan, and 0.5ms timer.', 'emerald');
      }
    },
    applySystemKernelTweaksNow: (nextCfg?: SystemTunerConfig) => {
      const target = nextCfg ?? systemTuner;
      const api = getElectronAPI();
      if (api) api.applySystemKernelTweaks(target);
      else {
        setSystemTunerStatus((prev) => ({
          ...prev,
          hasSystemBackup: true,
          optimizationScorePct: 100,
          liveStates: {
            ...prev.liveStates,
            cpuForegroundBoost: target.cpuForegroundBoost,
            win32PriorityValue: target.cpuForegroundBoost ? 38 : 2,
            mmcssGamesPriority: target.mmcssGamesPriority,
            disablePowerThrottling: target.disablePowerThrottling,
            enableHags: target.enableHags,
            disableMpo: target.disableMpo,
            tcpLowLatency: target.tcpLowLatency,
          },
        }));
        pushToast('Kernel & Network Applied', 'Applied CPU scheduler, MMCSS, GPU HAGS, and TCP No-Delay.', 'emerald');
      }
    },
    rollbackAllOptimizations: () => {
      const api = getElectronAPI();
      if (api) {
        api.restoreSystemDefaults();
        api.restoreOptimizerBackup();
        api.restoreDesktopNow();
      } else {
        setSystemTunerStatus((prev) => ({
          ...prev,
          timerLocked: false,
          timerResolutionMs: 15.62,
          activePowerPlanName: 'Balanced',
          optimizationScorePct: 36,
        }));
        pushToast('Rolled Back All Tweaks', 'Restored original Windows, display, and game settings.', 'emerald');
      }
    },
    purgeStandbyRamNow: () => {
      const api = getElectronAPI();
      if (api) api.purgeStandbyRam();
      else pushToast('RAM Trimmed', 'Trimmed idle background working sets.', 'emerald');
    },
    cleanShaderCacheNow: () => {
      const api = getElectronAPI();
      if (api) api.cleanShaderCache();
      else pushToast('Cache Cleaned', 'Cleared stale temp and shader cache files.', 'emerald');
    },
    liveInput,
    monitors,
    safetyAudit,
    foregroundWindowTitle,
    updaterState,
    checkForUpdates: async () => {
      const api = getElectronAPI();
      if (api) {
        const res = await api.checkForUpdates();
        if (res) setUpdaterState(res);
        return;
      }
      // Web preview fallback check directly against public GitHub API
      setUpdaterState((s) => ({ ...s, status: 'checking', error: null }));
      try {
        const [relRes, comRes] = await Promise.all([
          fetch('https://api.github.com/repos/sigmasigmaboi124/Crosshair/releases?per_page=5'),
          fetch('https://api.github.com/repos/sigmasigmaboi124/Crosshair/commits?sha=main&per_page=5'),
        ]);
        const rels = relRes.ok ? await relRes.json() : [];
        const coms = comRes.ok ? await comRes.json() : [];
        const topRel = Array.isArray(rels) && rels[0] ? rels[0] : null;
        const mappedComs = Array.isArray(coms)
          ? coms.map((c: { sha: string; html_url: string; commit?: { message?: string; author?: { name?: string; date?: string } }; author?: { login?: string } }) => ({
              sha: c.sha,
              shortSha: c.sha.slice(0, 7),
              message: (c.commit?.message || '').split('\n')[0],
              author: c.author?.login || c.commit?.author?.name || 'unknown',
              date: c.commit?.author?.date || '',
              htmlUrl: c.html_url,
            }))
          : [];
        setUpdaterState((s) => ({
          ...s,
          status: topRel || mappedComs.length > 0 ? 'update-available' : 'up-to-date',
          latestRelease: topRel
            ? {
                tag: topRel.tag_name,
                name: topRel.name || topRel.tag_name,
                version: String(topRel.tag_name).replace(/^v/i, ''),
                body: topRel.body || '',
                publishedAt: topRel.published_at,
                htmlUrl: topRel.html_url,
                prerelease: !!topRel.prerelease,
                assetsCount: topRel.assets?.length ?? 0,
              }
            : null,
          latestCommit: mappedComs[0] ?? null,
          recentCommits: mappedComs,
          updateAvailableKind: topRel && mappedComs.length ? 'both' : topRel ? 'release' : mappedComs.length ? 'commit' : 'none',
          lastCheckedAt: Date.now(),
        }));
      } catch {
        setUpdaterState((s) => ({ ...s, status: 'error', error: 'Unable to query GitHub API.', lastCheckedAt: Date.now() }));
      }
    },
    downloadUpdate: async () => {
      const api = getElectronAPI();
      if (api) await api.downloadUpdate();
    },
    installUpdate: () => {
      persistNowRef.current();
      const api = getElectronAPI();
      if (api) api.installUpdate();
    },
    pullCommitUpdate: async () => {
      persistNowRef.current();
      const api = getElectronAPI();
      if (api) await api.pullCommitUpdate();
    },
    openRepoUrl: (url?: string) => {
      const api = getElectronAPI();
      if (api) api.openExternalUrl(url);
      else window.open(url || 'https://github.com/sigmasigmaboi124/Crosshair', '_blank');
    },
    toasts,
    pushToast,
  };
}

export type AppStore = ReturnType<typeof useAppStore>;
