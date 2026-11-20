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

export type AimModeId = 'gridshot' | 'spidershot' | 'tracking' | 'microshot' | 'switchtrack' | 'range' | 'daily';

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
