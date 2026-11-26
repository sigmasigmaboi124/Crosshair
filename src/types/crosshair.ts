export type DotShape = 'circle' | 'square' | 'diamond' | 'plus';
export type RingStyle = 'solid' | 'dashed' | 'brackets' | 'arcs' | 'chevron' | 'scope';
export type FireAnimType = 'none' | 'bloom' | 'recoil' | 'pulse' | 'spin' | 'flash' | 'hitmarker';
export type IdleAnimType = 'none' | 'breathe' | 'spin' | 'rainbow' | 'radar';
export type AdsAction = 'none' | 'hide' | 'dim' | 'shrink' | 'switch';
export type AdsTrigger = 'rmb' | 'lt' | 'rmb_or_lt' | 'mmb' | 'x1' | 'x2' | 'custom';
export type AdsMode = 'hold' | 'toggle';

export interface CrosshairLines {
  enabled: boolean;
  tShape: boolean;
  showTop: boolean;
  showBottom: boolean;
  showLeft: boolean;
  showRight: boolean;
  length: number;
  lengthVertical: number;
  splitAxes: boolean;
  thickness: number;
  gap: number;
  gapVertical: number;
  rotation: number; // 0..360 deg (e.g. 45 for X)
  roundedCaps: boolean;
  color: string;
  opacity: number; // 0..1
}

export interface CrosshairOuterLines {
  enabled: boolean;
  length: number;
  thickness: number;
  gap: number;
  opacity: number;
  color: string;
  usePrimaryColor: boolean;
  bloomMultiplier: number;
}

export interface CrosshairCenterDot {
  enabled: boolean;
  shape: DotShape;
  size: number;
  color: string;
  usePrimaryColor: boolean;
  opacity: number;
  outline: boolean;
  outlineThickness: number;
  outlineColor: string;
}

export interface CrosshairRing {
  enabled: boolean;
  style: RingStyle;
  radius: number;
  thickness: number;
  dashGapDeg: number;
  rotation: number;
  color: string;
  usePrimaryColor: boolean;
  opacity: number;
}

export interface CrosshairOutline {
  enabled: boolean;
  thickness: number;
  color: string;
  opacity: number;
  glowEnabled: boolean;
  glowBlur: number;
  glowColor: string;
  glowOpacity: number;
}

export interface CrosshairImageLayer {
  enabled: boolean;
  dataUrl: string | null;
  fileName: string | null;
  scale: number; // 0.1..4
  opacity: number; // 0..1
  rotation: number; // 0..360
  hideVectorLayers: boolean;
}

export interface CrosshairAnimation {
  // Firing / Left-click / Controller RT
  firingEnabled: boolean;
  firingType: FireAnimType;
  bloomAmount: number; // max px expansion
  bloomSpeed: number; // 1..30
  recoverySpeed: number; // 1..30
  fireColor: string;
  recoilKickPx: number;
  hitmarkerSize: number;

  // Movement (WASD / Left Stick)
  movementBloomEnabled: boolean;
  movementSpreadPx: number;
  sprintMultiplier: number;
  crouchTightenPx: number;

  // ADS / Right-click / Controller LT
  adsTrigger: AdsTrigger;
  adsMode: AdsMode;
  adsAction: AdsAction;
  adsDimOpacity: number; // 0..1
  adsShrinkGapPx: number;
  adsFadeMs: number;
  adsSecondaryProfileId: string | null;

  // Idle / Continuous (EZCrosshair)
  idleType: IdleAnimType;
  idleSpeed: number; // 0.2..5
  idleIntensity: number; // 0.1..1
}

export interface CrosshairPosition {
  offsetX: number; // -500..500 px
  offsetY: number; // -500..500 px
  scale: number; // 0.25..4
  evenPixelSnap: boolean;
}

export interface CrosshairConfig {
  id: string;
  name: string;
  author: string;
  category: 'Tactical' | 'Battle Royale' | 'Sci-Fi' | 'Minimal' | 'Reactive' | 'Accessibility' | 'Custom';
  tags: string[];
  description?: string;
  lines: CrosshairLines;
  outerLines: CrosshairOuterLines;
  dot: CrosshairCenterDot;
  ring: CrosshairRing;
  outline: CrosshairOutline;
  image: CrosshairImageLayer;
  animation: CrosshairAnimation;
  position: CrosshairPosition;
}

export interface SavedProfile {
  id: string;
  config: CrosshairConfig;
  monitorIndex: number;
  gameTitleMatchers: string[]; // e.g., ["VALORANT", "Counter-Strike 2"]
  quickSlot: number | null; // 0..8 -> Alt+1..Alt+9
  createdAt: number;
  updatedAt: number;
}

export interface LiveInputState {
  lmb: boolean;
  rmb: boolean;
  mmb: boolean;
  x1: boolean;
  x2: boolean;
  moving: boolean;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  adsCustom: boolean;
  controller: {
    connected: boolean;
    fire: boolean;
    ads: boolean;
    moving: boolean;
    lt: number;
    rt: number;
  };
}

export interface MonitorInfo {
  index: number;
  device: string;
  primary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export type AimModeId =
  | 'gridshot'
  | 'spidershot'
  | 'tracking'
  | 'microshot'
  | 'switchtrack'
  | 'recoil'
  | 'reaction'
  | 'range'
  | 'daily';

export interface AimSessionRecord {
  id: string;
  mode: AimModeId;
  date: string; // YYYY-MM-DD
  timestamp: number;
  score: number;
  accuracy: number; // 0..100
  hits: number;
  misses: number;
  avgReactionMs: number;
  durationSec: number;
  bestStreak: number;
  crosshairName: string;
  rank: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master' | 'Grandmaster';
}

export interface AchievementProgress {
  unlockedIds: string[];
  unlockedAt: Record<string, number>;
  stats: {
    crosshairsCreated: number;
    codesExported: number;
    imagesExported: number;
    profilesSaved: number;
    aimRunsCompleted: number;
    aimTargetsHit: number;
    bestAccuracy: number;
    bestGridshotScore: number;
    dailyChallengesDone: number;
    monitorsSwitched: number;
    communityApplied: number;
    adsToggledCount: number;
  };
}

export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'ko' | 'zh' | 'ru' | 'tr' | 'pl' | 'it';
export type UpdateChannel = 'both' | 'releases' | 'commits';

export interface RemoteReleaseInfo {
  tag: string;
  name: string;
  version: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  prerelease: boolean;
  assetsCount: number;
}

export interface RemoteCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

export interface UpdaterState {
  status:
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'update-available'
    | 'downloading'
    | 'downloaded'
    | 'building-commit'
    | 'error';
  channel: UpdateChannel;
  autoCheck: boolean;
  autoDownload: boolean;
  checkIntervalMinutes: number;
  isPackaged: boolean;
  hasLocalGit: boolean;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  branch: string;
  currentVersion: string;
  currentCommitSha: string;
  currentShortSha: string;
  builtAt: string;
  latestRelease: RemoteReleaseInfo | null;
  latestCommit: RemoteCommitInfo | null;
  recentCommits: RemoteCommitInfo[];
  updateAvailableKind: 'none' | 'release' | 'commit' | 'both';
  canAutoInstallBinary: boolean;
  canPullCommitLocally: boolean;
  downloadProgress: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  } | null;
  commitSyncStep: string | null;
  lastCheckedAt: number | null;
  error: string | null;
}

export interface AppSettings {
  overlayEnabled: boolean;
  selectedMonitorIndex: number;
  strictStaticMode: boolean; // Ultra-Strict Static Mode: zero key/controller polling
  autoSwitchPerGame: boolean; // Opt-in passive foreground title matching
  topmostKeepAlive: boolean;
  minimizeToTray: boolean;
  launchWithOverlayOn: boolean;
  language: LanguageCode;
  updater: {
    channel: UpdateChannel;
    autoCheck: boolean;
    autoDownload: boolean;
    checkIntervalMinutes: number;
  };
  toggleHotkey: {
    vk: number;
    label: string;
    alt: boolean;
    ctrl: boolean;
    shift: boolean;
  };
  adsCustomKey: {
    vk: number;
    label: string;
  };
  aimSettings: {
    fov: number;
    sensitivity: number; // normalized 0.1..5
    gamePreset: 'valorant' | 'cs2' | 'apex' | 'overwatch' | 'fortnite' | 'custom';
    inGameSens: number;
    dpi: number;
    soundEnabled: boolean;
    soundVolume: number;
    targetColor: string;
    wallTheme: 'obsidian' | 'grid' | 'sand' | 'cyber';
    durationSec: number;
  };
}

export interface SafetyAuditStatus {
  bridgeConnected: boolean;
  dllInjection: boolean;
  memoryAccess: boolean;
  globalInputHooks: boolean;
  syntheticInput: boolean;
  graphicsApiHooking: boolean;
  captureEvasion: boolean;
}

export type AudioPresetId = 'balanced' | 'max-footsteps' | 'hearing-shield' | 'night' | 'custom';
export type AudioRoutingMode = 'direct-session' | 'loopback-eq';

export interface AudioGameProfile {
  id: string;
  name: string;
  processNames: string[];
  enabled: boolean;
  preset: AudioPresetId;
  ceilingDb: number;
  thresholdDb: number;
  ratio: number;
  footstepLiftDb: number;
  releaseMs: number;
  subBassCutDb: number;
  lowMidGainDb: number;
  footstepMidGainDb: number;
  presenceGainDb: number;
  trebleTameDb: number;
}

export interface AudioLimiterConfig {
  masterEnabled: boolean;
  lockToSelectedProcess: boolean;
  selectedProfileId: string;
  routingMode: AudioRoutingMode;
  outputDeviceId: string;
  profiles: AudioGameProfile[];
}

export interface AudioEndpointInfo {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface AudioTelemetryState {
  status: 'disabled' | 'waiting' | 'active' | 'active-silent';
  processName: string;
  pid: number;
  profileId: string;
  inputDb: number;
  outputDb: number;
  gainReductionDb: number;
  footstepLiftDb: number;
  peakProtectedCount: number;
}

export type RobRunPresetId = 'competitive' | 'max-fps' | 'visibility' | 'native-clean' | 'custom';

export interface RobRunOptimizerConfig {
  autoOptimizeOnLaunch: boolean;
  autoRestoreDesktopOnExit: boolean;
  targetProcessName: string;
  steamAppId: string;
  customInstallDir: string;
  targetMonitorIndex: number;
  preset: RobRunPresetId;
  grassQuality: 'low' | 'medium' | 'high';
  grassDistance: 'low' | 'medium' | 'high';
  shadows: 'disabled' | 'low' | 'medium' | 'high';
  hbao: boolean;
  reflections: boolean;
  depthOfField: boolean;
  autoExposure: boolean;
  waterQuality: 'minimum' | 'low' | 'medium';
  antiAliasing: 'disabled' | 'fxaa' | 'smaa' | 'taa';
  lodBias: number;
  cullingDistance: 'low' | 'medium' | 'high';
  renderScale: number;
  textureMipmapLimit: number;
  anisotropicFiltering: number;
  vramBudgetMb: number;
  showFpsCounter: boolean;
  applyStretchedDisplayOnLaunch: boolean;
  resWidth: number;
  resHeight: number;
  refreshRateHz: number;
  fullscreenMode: number;
  gpuHighPerformance: boolean;
  flagNoLog: boolean;
  flagBorderless: boolean;
  flagForceD3d11: boolean;
  extraLaunchFlags: string;
}

export interface DisplayModeOption {
  width: number;
  height: number;
  maxHz: number;
  aspectLabel: string;
}

export interface RobRunOptimizerStatus {
  detectedInstallDir: string;
  detectedExePath: string;
  settingsFilePaths: string[];
  hasBackup: boolean;
  gameRunning: boolean;
  gamePid: number;
  displayStretchedActive: boolean;
  currentDesktopWidth: number;
  currentDesktopHeight: number;
  currentDesktopHz: number;
  launchFlagsString: string;
  supportedModes: DisplayModeOption[];
  liveConfigSummary: {
    resolution: string;
    grass: string;
    shadows: string;
    hbao: boolean;
    reflections: boolean;
    depthOfField: boolean;
    lodBias: number;
    culling: string;
  } | null;
}

export interface ColorLook {
  name: string;
  builtIn: boolean;
  brightness: number; // -0.5 .. 0.5
  contrast: number; // 0.5 .. 2.0
  temperature: number; // -1.0 .. 1.0
  saturation: number; // 0.0 .. 4.0
  hue: number; // -180 .. 180
  shadowBoost: number; // 1.0 .. 3.0
}

export interface ColorAppRule {
  process: string;
  preset: string; // Preset name or "Off"
}

export interface ColorHotkeyBinding {
  action: 'toggle' | 'next' | 'prev' | 'hud';
  modifiers: number;
  vk: number;
}

export type ColorHudCorner = 'TopLeft' | 'TopRight' | 'BottomLeft' | 'BottomRight';

export interface ColorFilterConfig {
  enabled: boolean;
  activePreset: string;
  working: ColorLook;
  applied: ColorLook;
  autoApply: boolean;
  customPresets: ColorLook[];
  engineMode: 'screen' | 'amd';
  shadowBoostEnabled: boolean;
  rules: ColorAppRule[];
  rulesOnly: boolean;
  hudToasts: boolean;
  hudPinned: boolean;
  hudCorner: ColorHudCorner;
  hotkeys: ColorHotkeyBinding[];
}

export interface ColorFilterStatus {
  effectiveActive: boolean;
  effectiveName: string;
  effectiveReason: string;
  foregroundProcess: string;
  filterReady: boolean;
  filterStatus: string;
  amdAvailable: boolean;
  amdStatus: string;
  lastPath: string;
  gammaAchieved: number;
  gammaLimited: boolean;
}

export const BUILTIN_COLOR_LOOKS: ColorLook[] = [
  { name: 'Stock', builtIn: true, brightness: 0, contrast: 1, temperature: 0, saturation: 1, hue: 0, shadowBoost: 1 },
  { name: 'Vivid', builtIn: true, brightness: 0, contrast: 1.05, temperature: 0, saturation: 1.4, hue: 0, shadowBoost: 1 },
  { name: 'Hyper', builtIn: true, brightness: 0, contrast: 1.08, temperature: -0.15, saturation: 2.0, hue: 0, shadowBoost: 1 },
  { name: 'Overclock', builtIn: true, brightness: 0.02, contrast: 1.15, temperature: -0.25, saturation: 2.6, hue: 0, shadowBoost: 1 },
  { name: 'Night Vision', builtIn: true, brightness: 0.04, contrast: 1.05, temperature: 0, saturation: 1.3, hue: 0, shadowBoost: 2.2 },
  { name: 'Spotter', builtIn: true, brightness: 0, contrast: 1.1, temperature: -0.05, saturation: 1.6, hue: 0, shadowBoost: 1.5 },
  { name: 'Golden', builtIn: true, brightness: 0, contrast: 1.1, temperature: 0.35, saturation: 1.25, hue: 0, shadowBoost: 1 },
];

export function createDefaultColorFilterConfig(): ColorFilterConfig {
  const hyper = structuredClone(BUILTIN_COLOR_LOOKS[2]);
  hyper.builtIn = false;
  return {
    enabled: false,
    activePreset: 'Hyper',
    working: hyper,
    applied: structuredClone(hyper),
    autoApply: true,
    customPresets: [],
    engineMode: 'screen',
    shadowBoostEnabled: true,
    rules: [],
    rulesOnly: false,
    hudToasts: true,
    hudPinned: false,
    hudCorner: 'TopRight',
    hotkeys: [
      { action: 'toggle', modifiers: 2, vk: 0x78 }, // Ctrl+F9
      { action: 'next', modifiers: 2, vk: 0x79 },   // Ctrl+F10
      { action: 'prev', modifiers: 6, vk: 0x79 },   // Ctrl+Shift+F10
      { action: 'hud', modifiers: 2, vk: 0x7a },    // Ctrl+F11
    ],
  };
}

export function createDefaultAudioLimiterConfig(): AudioLimiterConfig {
  return {
    masterEnabled: true,
    lockToSelectedProcess: true,
    selectedProfileId: 'robrun',
    routingMode: 'direct-session',
    outputDeviceId: '',
    profiles: [
      {
        id: 'robrun',
        name: 'ROB RUN',
        processNames: ['ROB RUN.exe'],
        enabled: true,
        preset: 'balanced',
        ceilingDb: -12,
        thresholdDb: -20,
        ratio: 8,
        footstepLiftDb: 6.5,
        releaseMs: 80,
        subBassCutDb: -6.5,
        lowMidGainDb: -2.5,
        footstepMidGainDb: 6.5,
        presenceGainDb: 4,
        trebleTameDb: -3.5,
      },
      {
        id: 'cs2',
        name: 'Counter-Strike 2',
        processNames: ['cs2.exe'],
        enabled: true,
        preset: 'balanced',
        ceilingDb: -13,
        thresholdDb: -21,
        ratio: 9,
        footstepLiftDb: 6,
        releaseMs: 75,
        subBassCutDb: -5.5,
        lowMidGainDb: -2,
        footstepMidGainDb: 6,
        presenceGainDb: 3.5,
        trebleTameDb: -4,
      },
      {
        id: 'valorant',
        name: 'VALORANT',
        processNames: ['VALORANT-Win64-Shipping.exe'],
        enabled: true,
        preset: 'balanced',
        ceilingDb: -12,
        thresholdDb: -19,
        ratio: 7,
        footstepLiftDb: 5.5,
        releaseMs: 85,
        subBassCutDb: -4.5,
        lowMidGainDb: -2,
        footstepMidGainDb: 5.5,
        presenceGainDb: 3.5,
        trebleTameDb: -3,
      },
      {
        id: 'tarkov',
        name: 'Escape from Tarkov',
        processNames: ['EscapeFromTarkov.exe'],
        enabled: true,
        preset: 'hearing-shield',
        ceilingDb: -15,
        thresholdDb: -24,
        ratio: 12,
        footstepLiftDb: 8,
        releaseMs: 90,
        subBassCutDb: -8,
        lowMidGainDb: -3,
        footstepMidGainDb: 7.5,
        presenceGainDb: 4.5,
        trebleTameDb: -5,
      },
      {
        id: 'rust',
        name: 'Rust',
        processNames: ['RustClient.exe'],
        enabled: true,
        preset: 'balanced',
        ceilingDb: -13.5,
        thresholdDb: -22,
        ratio: 10,
        footstepLiftDb: 7,
        releaseMs: 85,
        subBassCutDb: -7,
        lowMidGainDb: -2.5,
        footstepMidGainDb: 6.5,
        presenceGainDb: 4,
        trebleTameDb: -4,
      },
    ],
  };
}

export function createDefaultRobRunOptimizerConfig(): RobRunOptimizerConfig {
  return {
    autoOptimizeOnLaunch: true,
    autoRestoreDesktopOnExit: true,
    targetProcessName: 'ROB RUN.exe',
    steamAppId: '4262460',
    customInstallDir: '',
    targetMonitorIndex: 0,
    preset: 'competitive',
    grassQuality: 'low',
    grassDistance: 'low',
    shadows: 'disabled',
    hbao: false,
    reflections: false,
    depthOfField: false,
    autoExposure: false,
    waterQuality: 'minimum',
    antiAliasing: 'disabled',
    lodBias: 0.8,
    cullingDistance: 'low',
    renderScale: 1.0,
    textureMipmapLimit: 2,
    anisotropicFiltering: 0,
    vramBudgetMb: 2048,
    showFpsCounter: true,
    applyStretchedDisplayOnLaunch: true,
    resWidth: 1440,
    resHeight: 1080,
    refreshRateHz: 240,
    fullscreenMode: 1,
    gpuHighPerformance: true,
    flagNoLog: true,
    flagBorderless: true,
    flagForceD3d11: false,
    extraLaunchFlags: '',
  };
}

export const DEFAULT_INPUT_STATE: LiveInputState = {
  lmb: false,
  rmb: false,
  mmb: false,
  x1: false,
  x2: false,
  moving: false,
  sprint: false,
  crouch: false,
  jump: false,
  adsCustom: false,
  controller: {
    connected: false,
    fire: false,
    ads: false,
    moving: false,
    lt: 0,
    rt: 0,
  },
};

export function createDefaultCrosshair(): CrosshairConfig {
  return {
    id: 'default-pro-cyan',
    name: 'ZeroPoint Cyan',
    author: 'ZeroPoint',
    category: 'Tactical',
    tags: ['tactical', 'valorant', 'cs2', 'pro', 'cyan'],
    description: 'Crisp tournament-grade cyan cross with razor-thin outline and subtle firing bloom.',
    lines: {
      enabled: true,
      tShape: false,
      showTop: true,
      showBottom: true,
      showLeft: true,
      showRight: true,
      length: 7,
      lengthVertical: 7,
      splitAxes: false,
      thickness: 2,
      gap: 4,
      gapVertical: 4,
      rotation: 0,
      roundedCaps: false,
      color: '#00f5ff',
      opacity: 1,
    },
    outerLines: {
      enabled: false,
      length: 4,
      thickness: 2,
      gap: 14,
      opacity: 0.45,
      color: '#00f5ff',
      usePrimaryColor: true,
      bloomMultiplier: 1.8,
    },
    dot: {
      enabled: true,
      shape: 'circle',
      size: 2,
      color: '#ffffff',
      usePrimaryColor: false,
      opacity: 0.95,
      outline: true,
      outlineThickness: 1,
      outlineColor: '#000000',
    },
    ring: {
      enabled: false,
      style: 'solid',
      radius: 18,
      thickness: 1.5,
      dashGapDeg: 35,
      rotation: 0,
      color: '#00f5ff',
      usePrimaryColor: true,
      opacity: 0.7,
    },
    outline: {
      enabled: true,
      thickness: 1,
      color: '#000000',
      opacity: 0.9,
      glowEnabled: false,
      glowBlur: 6,
      glowColor: '#00f5ff',
      glowOpacity: 0.55,
    },
    image: {
      enabled: false,
      dataUrl: null,
      fileName: null,
      scale: 1,
      opacity: 1,
      rotation: 0,
      hideVectorLayers: true,
    },
    animation: {
      firingEnabled: true,
      firingType: 'bloom',
      bloomAmount: 8,
      bloomSpeed: 18,
      recoverySpeed: 10,
      fireColor: '#ff3b5c',
      recoilKickPx: 6,
      hitmarkerSize: 12,
      movementBloomEnabled: false,
      movementSpreadPx: 5,
      sprintMultiplier: 1.6,
      crouchTightenPx: 2,
      adsTrigger: 'rmb_or_lt',
      adsMode: 'hold',
      adsAction: 'hide',
      adsDimOpacity: 0.2,
      adsShrinkGapPx: 3,
      adsFadeMs: 90,
      adsSecondaryProfileId: null,
      idleType: 'none',
      idleSpeed: 1,
      idleIntensity: 0.5,
    },
    position: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      evenPixelSnap: true,
    },
  };
}
