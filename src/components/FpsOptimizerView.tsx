import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FolderOpen,
  Gauge,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { SectionCard, SliderRow, ToggleRow } from './ui/Controls';
import { RobRunOptimizerConfig, RobRunPresetId, SystemTunerConfig } from '../types/crosshair';

interface FpsOptimizerViewProps {
  store: AppStore;
}

type OptimizerTab = 'pc-latency' | 'kernel-net' | 'robrun';

const ROBRUN_PRESETS: Array<{
  id: Exclude<RobRunPresetId, 'custom'>;
  label: string;
  summary: string;
  patch: Partial<RobRunOptimizerConfig>;
}> = [
  {
    id: 'competitive',
    label: 'Competitive',
    summary: '1440×1080 · Shadows & HBAO off',
    patch: {
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
      resWidth: 1440,
      resHeight: 1080,
      applyStretchedDisplayOnLaunch: true,
    },
  },
  {
    id: 'max-fps',
    label: 'Max FPS',
    summary: '1280×960 · Lowest GPU load',
    patch: {
      grassQuality: 'low',
      grassDistance: 'low',
      shadows: 'disabled',
      hbao: false,
      reflections: false,
      depthOfField: false,
      autoExposure: false,
      waterQuality: 'minimum',
      antiAliasing: 'disabled',
      lodBias: 0.6,
      cullingDistance: 'low',
      renderScale: 0.9,
      textureMipmapLimit: 2,
      anisotropicFiltering: 0,
      resWidth: 1280,
      resHeight: 960,
      applyStretchedDisplayOnLaunch: true,
    },
  },
  {
    id: 'visibility',
    label: 'Long-range clarity',
    summary: '1440×1080 · High sightlines',
    patch: {
      grassQuality: 'low',
      grassDistance: 'low',
      shadows: 'disabled',
      hbao: false,
      reflections: false,
      depthOfField: false,
      autoExposure: false,
      waterQuality: 'minimum',
      antiAliasing: 'smaa',
      lodBias: 1.35,
      cullingDistance: 'high',
      renderScale: 1.0,
      textureMipmapLimit: 1,
      anisotropicFiltering: 4,
      resWidth: 1440,
      resHeight: 1080,
      applyStretchedDisplayOnLaunch: true,
    },
  },
  {
    id: 'native-clean',
    label: 'Native 16:9',
    summary: '1920×1080 · No blur or HBAO',
    patch: {
      grassQuality: 'low',
      grassDistance: 'low',
      shadows: 'disabled',
      hbao: false,
      reflections: false,
      depthOfField: false,
      autoExposure: false,
      waterQuality: 'minimum',
      antiAliasing: 'disabled',
      lodBias: 1.0,
      cullingDistance: 'medium',
      renderScale: 1.0,
      textureMipmapLimit: 1,
      anisotropicFiltering: 2,
      resWidth: 1920,
      resHeight: 1080,
      applyStretchedDisplayOnLaunch: false,
    },
  },
];

const QUICK_STRETCHED_RES: Array<{ w: number; h: number; tag: string }> = [
  { w: 1440, h: 1080, tag: '4:3 Pro' },
  { w: 1280, h: 960, tag: '4:3 Wide' },
  { w: 1280, h: 1024, tag: '5:4 Extra Wide' },
  { w: 1680, h: 1050, tag: '16:10' },
  { w: 1920, h: 1080, tag: '16:9 Native' },
];

export const FpsOptimizerView: React.FC<FpsOptimizerViewProps> = ({ store }) => {
  const {
    robRunOptimizer,
    setRobRunOptimizer,
    optimizerStatus,
    systemTuner,
    setSystemTuner,
    systemTunerStatus,
    monitors,
    refreshOptimizerStatus,
    refreshSystemTunerStatus,
    applyRobRunOptimizerNow,
    restoreRobRunOriginal,
    restoreDesktopDisplayNow,
    launchRobRunOptimized,
    applySystemUserTweaksNow,
    applySystemKernelTweaksNow,
    rollbackAllOptimizations,
    purgeStandbyRamNow,
    cleanShaderCacheNow,
    openLocalPath,
    pushToast,
  } = store;

  const [tab, setTab] = useState<OptimizerTab>('pc-latency');

  // Instant toggle for user-space PC tweaks: flipping any switch applies or rolls back immediately
  const toggleInstantPcTweak = <K extends keyof SystemTunerConfig>(key: K, value: SystemTunerConfig[K]) => {
    const next: SystemTunerConfig = { ...systemTuner, [key]: value };
    setSystemTuner(next);
    applySystemUserTweaksNow(next);
  };

  const updateKernelTweak = <K extends keyof SystemTunerConfig>(key: K, value: SystemTunerConfig[K]) => {
    setSystemTuner((prev) => ({ ...prev, [key]: value }));
  };

  const updateGameCfg = (patch: Partial<RobRunOptimizerConfig>, markCustom = false) => {
    setRobRunOptimizer((prev) => ({
      ...prev,
      ...patch,
      preset: markCustom ? 'custom' : patch.preset ?? prev.preset,
    }));
  };

  const applyGamePreset = (id: Exclude<RobRunPresetId, 'custom'>) => {
    const def = ROBRUN_PRESETS.find((p) => p.id === id);
    if (!def) return;
    const next: RobRunOptimizerConfig = {
      ...robRunOptimizer,
      ...def.patch,
      preset: id,
    };
    setRobRunOptimizer(next);
    applyRobRunOptimizerNow(next);
  };

  const computedLaunchFlags = useMemo(() => {
    const parts: string[] = [];
    if (robRunOptimizer.flagBorderless) parts.push('-window-mode borderless');
    parts.push(`-screen-width ${robRunOptimizer.resWidth}`);
    parts.push(`-screen-height ${robRunOptimizer.resHeight}`);
    if (robRunOptimizer.flagNoLog) parts.push('-nolog');
    if (robRunOptimizer.flagForceD3d11) parts.push('-force-d3d11');
    if (robRunOptimizer.extraLaunchFlags.trim()) parts.push(robRunOptimizer.extraLaunchFlags.trim());
    return parts.join(' ');
  }, [robRunOptimizer]);

  const availableHzOptions = useMemo(() => {
    const matching = optimizerStatus.supportedModes.find(
      (m) => m.width === robRunOptimizer.resWidth && m.height === robRunOptimizer.resHeight
    );
    const maxDetected =
      matching?.maxHz ??
      Math.max(240, optimizerStatus.currentDesktopHz, ...optimizerStatus.supportedModes.map((m) => m.maxHz));
    const standard = [60, 120, 144, 165, 180, 240, 360];
    const filtered = standard.filter((hz) => hz <= maxDetected);
    if (!filtered.includes(maxDetected)) filtered.push(maxDetected);
    if (!filtered.includes(robRunOptimizer.refreshRateHz)) filtered.push(robRunOptimizer.refreshRateHz);
    return filtered.sort((a, b) => b - a);
  }, [
    optimizerStatus.supportedModes,
    optimizerStatus.currentDesktopHz,
    robRunOptimizer.resWidth,
    robRunOptimizer.resHeight,
    robRunOptimizer.refreshRateHz,
  ]);

  const settingsFileFound = optimizerStatus.settingsFilePaths[0] || '';
  const anyBackupAvailable = systemTunerStatus.hasSystemBackup || optimizerStatus.hasBackup || systemTunerStatus.timerLocked;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Top Header & Sub-Tab Switcher */}
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1c1c22] border border-[#2b2b34] flex items-center justify-center shrink-0">
            <Gauge className="w-4 h-4 text-[#f4f4f6]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">PC & game FPS optimizer</h2>
            <p className="text-xs text-[#8c8c9a] mt-0.5 max-w-2xl leading-relaxed">
              Real Windows kernel timer, power plan, mouse 1:1, CPU/GPU scheduler, TCP low-latency, and ROB RUN config tuning.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <div className="flex flex-wrap rounded-lg bg-[#0e0e11] border border-[#24242c] p-0.5 gap-0.5">
            {(
              [
                ['pc-latency', 'PC & latency'],
                ['kernel-net', 'CPU, GPU & network'],
                ['robrun', 'ROB RUN config'],
              ] as Array<[OptimizerTab, string]>
            ).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  tab === id ? 'bg-[#22222b] text-white' : 'text-[#8c8c9a] hover:text-[#e4e4e8]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {tab === 'pc-latency' && (
            <button
              type="button"
              onClick={() => applySystemUserTweaksNow()}
              className="px-3.5 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Optimize PC now</span>
            </button>
          )}

          {tab === 'kernel-net' && (
            <button
              type="button"
              onClick={() => applySystemKernelTweaksNow()}
              className="px-3.5 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Apply pro tweaks</span>
            </button>
          )}

          {tab === 'robrun' && (
            <button
              type="button"
              onClick={() => launchRobRunOptimized()}
              className="px-3.5 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch ROB RUN</span>
            </button>
          )}
        </div>
      </div>

      {/* Anti-Cheat Trusted + Nothing Is Permanent (1-Click Rollback) Assurance Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card 1: Anti-Cheat Trusted */}
        <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex items-center gap-4">
          <div className="w-16 h-12 rounded-lg bg-[#0e0e11] border border-[#26262f] flex items-center justify-center shrink-0">
            <svg viewBox="0 0 36 36" className="w-7 h-7" fill="none">
              <path
                d="M18 4L6.5 8.5V17.2C6.5 24.4 11.4 30.8 18 32.5C24.6 30.8 29.5 24.4 29.5 17.2V8.5L18 4Z"
                stroke="#34d399"
                strokeWidth="1.8"
                fill="rgba(52, 211, 153, 0.08)"
              />
              <circle cx="18" cy="16" r="2.3" fill="#34d399" />
              <path d="M16.8 17.8L16.2 22.5H19.8L19.2 17.8H16.8Z" fill="#34d399" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[#ececf0] leading-snug">
              <strong className="font-semibold text-white">Anti-cheat trusted</strong>{' '}
              <span className="text-[#9696a4]">by Riot, EAC, BattlEye, Valve, and more.</span>
            </div>
            <p className="text-[11px] text-[#727280] mt-1 leading-relaxed">
              Uses documented Windows OS, power, scheduler, and user-config settings only. Zero kernel drivers or game injection.
            </p>
          </div>
        </div>

        {/* Card 2: Nothing Is Permanent — Tactile Rocker Switch + 1-Click Rollback */}
        <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-wrap xl:flex-nowrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => rollbackAllOptimizations()}
              title="Click to roll back all tweaks in one click"
              className="w-20 h-12 rounded-lg bg-[#0e0e11] border border-[#2c2c36] hover:border-[#454554] p-1 flex items-center justify-between transition cursor-pointer shrink-0 group"
            >
              <span className="w-7 h-full rounded flex items-center justify-center text-[11px] font-mono text-[#686876] group-hover:text-[#a1a1ad]">
                |
              </span>
              <span className="w-9 h-full rounded bg-[#1d1d24] border border-emerald-500/45 flex items-center justify-center">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-emerald-400" />
              </span>
            </button>

            <div className="min-w-0">
              <div className="text-xs text-[#ececf0] leading-snug">
                <strong className="font-semibold text-white">Nothing is permanent.</strong>{' '}
                <span className="text-[#9696a4]">Roll back any or all tweaks in one click.</span>
              </div>
              <p className="text-[11px] text-[#727280] mt-1 leading-relaxed">
                Original Windows & game settings are backed up before any tweak runs. Flip any toggle off or roll back everything.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => rollbackAllOptimizations()}
            disabled={!anyBackupAvailable}
            className="px-3 py-1.5 rounded-lg bg-[#1c1c22] hover:bg-[#262630] disabled:opacity-40 border border-[#30303b] text-xs font-medium text-[#e4e4e8] whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#a1a1ad]" />
            <span>Roll back all</span>
          </button>
        </div>
      </div>

      {/* Live Hardware, Memory & Timer Telemetry Bar */}
      <SectionCard
        title="Live hardware & system latency"
        subtitle="Real-time Windows kernel timer, memory headroom, and power profile"
        rightSlot={
          <button
            type="button"
            onClick={() => {
              refreshSystemTunerStatus();
              refreshOptimizerStatus();
            }}
            className="p-1.5 rounded-md bg-[#18181e] hover:bg-[#222229] border border-[#2a2a33] text-[#a1a1ad] hover:text-white cursor-pointer"
            title="Refresh live hardware telemetry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="space-y-0.5 min-w-0">
            <div className="text-[#787886]">Processor</div>
            <div className="font-medium text-white truncate" title={systemTunerStatus.cpuName}>
              {systemTunerStatus.cpuName}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[#787886]">
              {systemTunerStatus.cpuThreads} logical threads
            </div>
          </div>

          <div className="space-y-0.5 min-w-0">
            <div className="text-[#787886]">Graphics adapter</div>
            <div className="font-medium text-white truncate" title={systemTunerStatus.gpuName}>
              {systemTunerStatus.gpuName}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[#787886]">
              HAGS: {systemTunerStatus.liveStates.enableHags ? 'Enabled' : 'Off'}
            </div>
          </div>

          <div className="space-y-0.5 min-w-0">
            <div className="text-[#787886]">System memory</div>
            <div className="font-mono tabular-nums font-medium text-white">
              {systemTunerStatus.usedRamGb.toFixed(1)} / {systemTunerStatus.totalRamGb.toFixed(1)} GB ({systemTunerStatus.ramLoadPct}%)
            </div>
            <div className="text-[11px] font-mono tabular-nums text-emerald-400">
              {systemTunerStatus.availRamGb.toFixed(1)} GB free
            </div>
          </div>

          <div className="space-y-0.5 min-w-0">
            <div className="text-[#787886]">Kernel timer & power</div>
            <div className="font-mono tabular-nums font-medium text-white">
              {systemTunerStatus.timerResolutionMs.toFixed(2)} ms · {systemTunerStatus.activePowerPlanName}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[#787886]">
              Score: {systemTunerStatus.optimizationScorePct}% tuned
            </div>
          </div>
        </div>
      </SectionCard>

      {/* SUB-TAB 1: PC & LATENCY (Instant User-Space Tweaks + RAM & Cache Cleaners) */}
      {tab === 'pc-latency' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 space-y-4">
            <SectionCard
              title="Real-time session boosters"
              subtitle="Instant zero-reboot latency & power controls"
            >
              <ToggleRow
                label="0.5ms kernel timer lock"
                description="Overrides Windows' default 15.6ms timer tick to tighten frame pacing and sleep accuracy."
                checked={systemTuner.lockTimerResolution}
                accent="emerald"
                onChange={(v) => toggleInstantPcTweak('lockTimerResolution', v)}
              />
              <ToggleRow
                label="Ultimate Performance power plan"
                description="Switches Windows power management out of power-saving states so CPU clocks stay boosted."
                checked={systemTuner.activateUltimatePower}
                accent="emerald"
                onChange={(v) => toggleInstantPcTweak('activateUltimatePower', v)}
              />
              <ToggleRow
                label="Auto-trim idle apps when game launches"
                description="Reclaims working-set RAM from SearchHost, Widgets, and OneDrive when your game starts."
                checked={systemTuner.autoTrimRamOnGameLaunch}
                onChange={(v) => toggleInstantPcTweak('autoTrimRamOnGameLaunch', v)}
              />

              <div className="pt-3 border-t border-[#1f1f26] grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => purgeStandbyRamNow()}
                  className="px-3 py-2 rounded-lg bg-[#1c1c22] hover:bg-[#262630] border border-[#2f2f3a] text-xs font-medium text-[#f4f4f6] whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Free idle RAM now</span>
                </button>
                <button
                  type="button"
                  onClick={() => cleanShaderCacheNow()}
                  className="px-3 py-2 rounded-lg bg-[#18181e] hover:bg-[#22222b] border border-[#2c2c35] text-xs font-medium text-[#d4d4dc] whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#9898a6] shrink-0" />
                  <span>Clean shader cache</span>
                </button>
              </div>
            </SectionCard>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <SectionCard
              title="Windows input & background overhead"
              subtitle="Flipping any switch applies or rolls back that Windows setting immediately"
            >
              <ToggleRow
                label={`Raw 1:1 mouse response (${systemTunerStatus.liveStates.rawMouseInput ? 'Active' : 'Default'})`}
                description="Disables Windows Enhance Pointer Precision acceleration curve immediately without signing out."
                checked={systemTuner.rawMouseInput}
                accent="emerald"
                onChange={(v) => toggleInstantPcTweak('rawMouseInput', v)}
              />
              <ToggleRow
                label={`Disable Xbox GameDVR recording (${systemTunerStatus.liveStates.disableGameDvr ? 'Active' : 'Default'})`}
                description="Stops background H.264 game-clip shadow encoding to free GPU encoder bandwidth."
                checked={systemTuner.disableGameDvr}
                accent="emerald"
                onChange={(v) => toggleInstantPcTweak('disableGameDvr', v)}
              />
              <ToggleRow
                label={`Windows Game Mode thread priority (${systemTunerStatus.liveStates.enableGameMode ? 'Active' : 'Off'})`}
                description="Suspends background Windows Update & search indexing threads while a game is running."
                checked={systemTuner.enableGameMode}
                accent="emerald"
                onChange={(v) => toggleInstantPcTweak('enableGameMode', v)}
              />
              <ToggleRow
                label={`Suspend background UWP apps (${systemTunerStatus.liveStates.disableBackgroundApps ? 'Active' : 'Default'})`}
                description="Stops store apps from waking in the background and causing frame-time spikes."
                checked={systemTuner.disableBackgroundApps}
                accent="emerald"
                onChange={(v) => toggleInstantPcTweak('disableBackgroundApps', v)}
              />
              <ToggleRow
                label={`Disable desktop DWM transparency (${systemTunerStatus.liveStates.disableTransparency ? 'Active' : 'Default'})`}
                description="Turns off acrylic blur surfaces across Windows taskbars and menus."
                checked={systemTuner.disableTransparency}
                onChange={(v) => toggleInstantPcTweak('disableTransparency', v)}
              />
              <ToggleRow
                label={`Instant keyboard repeat response (${systemTunerStatus.liveStates.fastKeyboardResponse ? 'Active' : 'Default'})`}
                description="Minimizes key repeat delay for crisp movement and counter-strafing."
                checked={systemTuner.fastKeyboardResponse}
                onChange={(v) => toggleInstantPcTweak('fastKeyboardResponse', v)}
              />
            </SectionCard>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CPU, GPU & NETWORK (Deep HKLM Scheduler & Nagle TCP Tweaks) */}
      {tab === 'kernel-net' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 space-y-4">
            <SectionCard
              title="CPU scheduler & power throttling"
              subtitle="Tightens 1% low frame rates by prioritizing foreground game threads"
            >
              <ToggleRow
                label={`Foreground CPU quantum boost · 0x26 (${systemTunerStatus.liveStates.cpuForegroundBoost ? 'Active' : `Current: ${systemTunerStatus.liveStates.win32PriorityValue}`})`}
                description="Sets Win32PrioritySeparation = 38 (short, variable, 3:1 foreground boost) for steadier 1% lows."
                checked={systemTuner.cpuForegroundBoost}
                accent="emerald"
                onChange={(v) => updateKernelTweak('cpuForegroundBoost', v)}
              />
              <ToggleRow
                label={`MMCSS maximum game priority (${systemTunerStatus.liveStates.mmcssGamesPriority ? 'Active' : 'Default'})`}
                description="Sets SystemResponsiveness = 0%, NetworkThrottlingIndex = Off, and Games GPU Priority = 8."
                checked={systemTuner.mmcssGamesPriority}
                accent="emerald"
                onChange={(v) => updateKernelTweak('mmcssGamesPriority', v)}
              />
              <ToggleRow
                label={`Disable CPU power throttling (${systemTunerStatus.liveStates.disablePowerThrottling ? 'Active' : 'Default'})`}
                description="Prevents Windows PowerThrottling from down-clocking worker game threads."
                checked={systemTuner.disablePowerThrottling}
                accent="emerald"
                onChange={(v) => updateKernelTweak('disablePowerThrottling', v)}
              />
            </SectionCard>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <SectionCard
              title="GPU presentation & low-ping TCP network"
              subtitle="Applies in one elevated batch and rolls back cleanly anytime"
            >
              <ToggleRow
                label={`Hardware-accelerated GPU scheduling (${systemTunerStatus.liveStates.enableHags ? 'Active' : 'Off'})`}
                description="Enables HwSchMode = 2 so your GPU manages its own VRAM scheduling queue."
                checked={systemTuner.enableHags}
                accent="emerald"
                onChange={(v) => updateKernelTweak('enableHags', v)}
              />
              <ToggleRow
                label={`Disable DWM Multiplane Overlay stutter (${systemTunerStatus.liveStates.disableMpo ? 'Active' : 'Default'})`}
                description="Sets OverlayTestMode = 5 if you experience borderless flicker or micro-stutter."
                checked={systemTuner.disableMpo}
                onChange={(v) => updateKernelTweak('disableMpo', v)}
              />
              <ToggleRow
                label={`TCP No-Delay / Disable Nagle batching (${systemTunerStatus.liveStates.tcpLowLatency ? 'Active' : 'Default'})`}
                description="Sets TcpAckFrequency = 1 & TCPNoDelay = 1 on active network interfaces to reduce packet delay."
                checked={systemTuner.tcpLowLatency}
                accent="emerald"
                onChange={(v) => updateKernelTweak('tcpLowLatency', v)}
              />

              <div className="pt-3 border-t border-[#1f1f26] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-[#787886]">
                  Prompts once for Windows Admin permission. Some scheduler changes finish applying after sign-out.
                </span>
                <button
                  type="button"
                  onClick={() => applySystemKernelTweaksNow()}
                  className="px-3.5 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Apply CPU, GPU & network tweaks
                </button>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: ROB RUN COMPETITIVE CONFIG & STRETCHED RES */}
      {tab === 'robrun' && (
        <div className="space-y-4">
          {/* Process Scope & Detected Paths */}
          <SectionCard
            title="ROB RUN process & config files"
            subtitle="External config & stretched display automation"
            rightSlot={
              <div className="flex items-center gap-2">
                {optimizerStatus.displayStretchedActive && (
                  <button
                    type="button"
                    onClick={() => restoreDesktopDisplayNow()}
                    className="px-2.5 py-1 rounded-md bg-[#1c1c22] hover:bg-[#26262f] border border-[#343440] text-[11px] font-medium text-[#e4e4e8] cursor-pointer"
                  >
                    Restore desktop
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => restoreRobRunOriginal()}
                  disabled={!optimizerStatus.hasBackup}
                  className="px-2.5 py-1 rounded-md bg-[#18181e] hover:bg-[#22222a] disabled:opacity-40 border border-[#2c2c35] text-[11px] font-medium text-[#d0d0d8] cursor-pointer"
                >
                  Restore ROB RUN default
                </button>
                <button
                  type="button"
                  onClick={() => applyRobRunOptimizerNow()}
                  className="px-3 py-1 rounded-md bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3 h-3" /> Save to ROB RUN
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <div className="text-[#787886]">Watched process</div>
                <div className="flex items-center gap-2 font-mono tabular-nums text-[#f4f4f6]">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      optimizerStatus.gameRunning ? 'bg-emerald-400' : 'bg-[#5c5c68]'
                    }`}
                  />
                  <span>
                    {optimizerStatus.gameRunning
                      ? `${robRunOptimizer.targetProcessName} running (PID ${optimizerStatus.gamePid})`
                      : `${robRunOptimizer.targetProcessName} · Standby`}
                  </span>
                </div>
                <div className="text-[11px] text-[#727280]">
                  Desktop: {optimizerStatus.currentDesktopWidth}×{optimizerStatus.currentDesktopHeight} @{' '}
                  {optimizerStatus.currentDesktopHz}Hz
                </div>
              </div>

              <div className="space-y-1 min-w-0">
                <div className="text-[#787886]">Steam install folder</div>
                <div className="font-mono text-[11px] text-[#d0d0d8] truncate">
                  {optimizerStatus.detectedInstallDir || 'Not auto-detected — enter folder below'}
                </div>
                {optimizerStatus.detectedInstallDir ? (
                  <button
                    type="button"
                    onClick={() => openLocalPath(optimizerStatus.detectedInstallDir)}
                    className="text-[11px] text-[#a1a1ad] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                  >
                    <FolderOpen className="w-3 h-3" /> Open game folder
                  </button>
                ) : (
                  <input
                    type="text"
                    value={robRunOptimizer.customInstallDir}
                    onChange={(e) => updateGameCfg({ customInstallDir: e.target.value })}
                    placeholder="D:\SteamLibrary\steamapps\common\Rob Run"
                    className="w-full px-2 py-1 rounded bg-[#0e0e11] border border-[#27272f] text-[11px] font-mono text-white"
                  />
                )}
              </div>

              <div className="space-y-1 min-w-0">
                <div className="text-[#787886]">User graphics config</div>
                <div className="font-mono text-[11px] text-[#d0d0d8] truncate">
                  {settingsFileFound
                    ? settingsFileFound.split('\\').slice(-2).join('\\')
                    : 'AppData\\LocalLow\\Kefir\\ROB RUN\\settings'}
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  {settingsFileFound && (
                    <button
                      type="button"
                      onClick={() => openLocalPath(settingsFileFound)}
                      className="text-[#a1a1ad] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                    >
                      <FolderOpen className="w-3 h-3" /> Show file
                    </button>
                  )}
                  <span className="text-[#727280]">
                    {robRunOptimizer.lockConfigReadOnly ? 'Read-only lock active' : 'Writable'}
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-4">
              <SectionCard
                title="Automatic launch & config lock"
                subtitle={`Applies strictly to ${robRunOptimizer.targetProcessName}`}
              >
                <ToggleRow
                  label="Lock config file as Read-only"
                  description="Prevents Steam Cloud or Unity from resetting your competitive graphics settings."
                  checked={robRunOptimizer.lockConfigReadOnly}
                  accent="emerald"
                  onChange={(v) => updateGameCfg({ lockConfigReadOnly: v })}
                />
                <ToggleRow
                  label="Auto-apply config & PC boost when ROB RUN starts"
                  description="Applies your config, 0.5ms timer, and power plan automatically on launch."
                  checked={robRunOptimizer.autoOptimizeOnLaunch}
                  accent="emerald"
                  onChange={(v) => updateGameCfg({ autoOptimizeOnLaunch: v })}
                />
                <ToggleRow
                  label="Auto-switch stretched res & restore desktop on exit"
                  description="Applies stretched resolution only while ROB RUN is open, then restores your desktop."
                  checked={robRunOptimizer.autoRestoreDesktopOnExit && robRunOptimizer.applyStretchedDisplayOnLaunch}
                  accent="emerald"
                  onChange={(v) =>
                    updateGameCfg({
                      applyStretchedDisplayOnLaunch: v,
                      autoRestoreDesktopOnExit: v ? true : robRunOptimizer.autoRestoreDesktopOnExit,
                    })
                  }
                />
                <ToggleRow
                  label="High-performance GPU & flip-model priority"
                  description="Sets DirectX high-performance GPU and low-latency borderless presentation for ROB RUN.exe."
                  checked={robRunOptimizer.gpuHighPerformance}
                  onChange={(v) => updateGameCfg({ gpuHighPerformance: v })}
                />
              </SectionCard>

              <SectionCard
                title="Stretched resolution & refresh rate"
                subtitle="Aspect ratio and maximum Hz"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {QUICK_STRETCHED_RES.map((r) => {
                    const selected = robRunOptimizer.resWidth === r.w && robRunOptimizer.resHeight === r.h;
                    return (
                      <button
                        key={`${r.w}x${r.h}`}
                        type="button"
                        onClick={() =>
                          updateGameCfg(
                            {
                              resWidth: r.w,
                              resHeight: r.h,
                              applyStretchedDisplayOnLaunch: !(r.w === 1920 && r.h === 1080),
                            },
                            true
                          )
                        }
                        className={`px-2.5 py-2 rounded-lg border text-left transition cursor-pointer ${
                          selected
                            ? 'bg-[#202028] border-[#484857] text-white'
                            : 'bg-[#101013] border-[#222229] text-[#b4b4c0] hover:border-[#343440]'
                        }`}
                      >
                        <div className="text-xs font-mono tabular-nums font-semibold">
                          {r.w}×{r.h}
                        </div>
                        <div className="text-[10px] text-[#7c7c8a]">{r.tag}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#1f1f26]">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#8c8c9a] block">Width</label>
                    <input
                      type="number"
                      min={800}
                      max={3840}
                      value={robRunOptimizer.resWidth}
                      onChange={(e) => updateGameCfg({ resWidth: Math.max(800, Number(e.target.value) || 1440) }, true)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#8c8c9a] block">Height</label>
                    <input
                      type="number"
                      min={600}
                      max={2160}
                      value={robRunOptimizer.resHeight}
                      onChange={(e) => updateGameCfg({ resHeight: Math.max(600, Number(e.target.value) || 1080) }, true)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#8c8c9a] block">Refresh rate</label>
                    <select
                      value={robRunOptimizer.refreshRateHz}
                      onChange={(e) => updateGameCfg({ refreshRateHz: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs font-mono tabular-nums text-white"
                    >
                      {availableHzOptions.map((hz) => (
                        <option key={hz} value={hz}>
                          {hz}Hz
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#8c8c9a] block">Target display</label>
                    <select
                      value={robRunOptimizer.targetMonitorIndex}
                      onChange={(e) => updateGameCfg({ targetMonitorIndex: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#e4e4e8]"
                    >
                      {monitors.map((m) => (
                        <option key={m.index} value={m.index}>
                          Display {m.index + 1} ({m.width}×{m.height})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#8c8c9a] block">Fullscreen mode</label>
                    <select
                      value={robRunOptimizer.fullscreenMode}
                      onChange={(e) =>
                        updateGameCfg({
                          fullscreenMode: Number(e.target.value),
                          flagBorderless: Number(e.target.value) === 1,
                        })
                      }
                      className="w-full px-2 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#e4e4e8]"
                    >
                      <option value={1}>Borderless fullscreen</option>
                      <option value={0}>Exclusive fullscreen</option>
                    </select>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Unity launch flags"
                subtitle="Passed on launch or copyable into Steam"
              >
                <ToggleRow
                  label="Disable debug log writes (-nolog)"
                  description="Stops Unity stack-trace file spam during combat."
                  checked={robRunOptimizer.flagNoLog}
                  onChange={(v) => updateGameCfg({ flagNoLog: v })}
                />
                <ToggleRow
                  label="Borderless flip-model flag (-window-mode borderless)"
                  description="Fast Alt-Tab and full compatibility with external crosshair overlays."
                  checked={robRunOptimizer.flagBorderless}
                  onChange={(v) => updateGameCfg({ flagBorderless: v })}
                />
                <ToggleRow
                  label="Force Direct3D 11 (-force-d3d11)"
                  description="Locks ROB RUN to its native D3D11 render path."
                  checked={robRunOptimizer.flagForceD3d11}
                  onChange={(v) => updateGameCfg({ flagForceD3d11: v })}
                />

                <div className="pt-2 border-t border-[#1f1f26] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#8c8c9a]">
                    <span>Steam launch options</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(computedLaunchFlags).catch(() => {});
                        pushToast('Launch flags copied', 'Paste into Steam → ROB RUN → Properties.', 'cyan');
                      }}
                      className="text-[#e4e4e8] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <div className="px-2.5 py-2 rounded-md bg-[#0e0e11] border border-[#23232b] font-mono text-[11px] text-[#c4c4d0] break-all">
                    {computedLaunchFlags}
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="lg:col-span-7 space-y-4">
              <SectionCard
                title="One-click ROB RUN presets"
                subtitle="Apply and lock a ready-to-play profile (close ROB RUN first if running)"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ROBRUN_PRESETS.map((p) => {
                    const selected = robRunOptimizer.preset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyGamePreset(p.id)}
                        className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                          selected
                            ? 'bg-[#202028] border-[#484857] text-white'
                            : 'bg-[#101013] border-[#222229] text-[#b4b4c0] hover:border-[#343440]'
                        }`}
                      >
                        <div className="text-xs font-semibold">{p.label}</div>
                        <div className="text-[10px] font-mono tabular-nums text-[#7c7c8a] mt-0.5 leading-snug">
                          {p.summary}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard
                title="ROB RUN graphics"
                subtitle="Keybinds, sensitivity, and voice settings stay untouched"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#a1a1ad] block">Grass density</label>
                    <select
                      value={robRunOptimizer.grassQuality}
                      onChange={(e) =>
                        updateGameCfg({ grassQuality: e.target.value as RobRunOptimizerConfig['grassQuality'] }, true)
                      }
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                    >
                      <option value="low">Low (Clear ground visibility)</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#a1a1ad] block">Grass render distance</label>
                    <select
                      value={robRunOptimizer.grassDistance}
                      onChange={(e) =>
                        updateGameCfg({ grassDistance: e.target.value as RobRunOptimizerConfig['grassDistance'] }, true)
                      }
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                    >
                      <option value="low">Low (Max FPS & spotting)</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#a1a1ad] block">Dynamic shadows</label>
                    <select
                      value={robRunOptimizer.shadows}
                      onChange={(e) =>
                        updateGameCfg({ shadows: e.target.value as RobRunOptimizerConfig['shadows'] }, true)
                      }
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                    >
                      <option value="disabled">Disabled (+15–25% FPS)</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#a1a1ad] block">World culling distance</label>
                    <select
                      value={robRunOptimizer.cullingDistance}
                      onChange={(e) =>
                        updateGameCfg(
                          { cullingDistance: e.target.value as RobRunOptimizerConfig['cullingDistance'] },
                          true
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                    >
                      <option value="low">Low (Max FPS)</option>
                      <option value="medium">Medium (Balanced)</option>
                      <option value="high">High (Far sightlines)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#a1a1ad] block">Texture quality</label>
                    <select
                      value={robRunOptimizer.textureMipmapLimit}
                      onChange={(e) => updateGameCfg({ textureMipmapLimit: Number(e.target.value) }, true)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                    >
                      <option value={2}>Quarter resolution (Fastest)</option>
                      <option value={1}>Half resolution</option>
                      <option value={0}>Full resolution</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#a1a1ad] block">Anti-aliasing</label>
                    <select
                      value={robRunOptimizer.antiAliasing}
                      onChange={(e) =>
                        updateGameCfg({ antiAliasing: e.target.value as RobRunOptimizerConfig['antiAliasing'] }, true)
                      }
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                    >
                      <option value="disabled">Disabled (Zero blur)</option>
                      <option value="fxaa">FXAA</option>
                      <option value="smaa">SMAA</option>
                      <option value="taa">TAA</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-3 border-t border-[#1f1f26]">
                  <SliderRow
                    label="Render distance (LOD)"
                    value={robRunOptimizer.lodBias}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    unit="×"
                    onChange={(v) => updateGameCfg({ lodBias: v }, true)}
                  />
                  <SliderRow
                    label="3D render scale"
                    value={Math.round(robRunOptimizer.renderScale * 100)}
                    min={50}
                    max={100}
                    step={5}
                    unit="%"
                    onChange={(v) => updateGameCfg({ renderScale: v / 100 }, true)}
                  />
                </div>

                <div className="pt-3 border-t border-[#1f1f26] space-y-1.5">
                  <ToggleRow
                    label="HBAO ambient occlusion"
                    description="Keep off for brighter dark corners and ~10% higher GPU FPS."
                    checked={robRunOptimizer.hbao}
                    onChange={(v) => updateGameCfg({ hbao: v }, true)}
                  />
                  <ToggleRow
                    label="Screen-space reflections"
                    description="Keep off to remove floor/water glare and frame dips."
                    checked={robRunOptimizer.reflections}
                    onChange={(v) => updateGameCfg({ reflections: v }, true)}
                  />
                  <ToggleRow
                    label="Depth of field blur"
                    description="Keep off so distant targets stay sharp when aiming."
                    checked={robRunOptimizer.depthOfField}
                    onChange={(v) => updateGameCfg({ depthOfField: v }, true)}
                  />
                  <ToggleRow
                    label="Auto-exposure lighting shifts"
                    description="Keep off to avoid sudden dimming or blinding window glare."
                    checked={robRunOptimizer.autoExposure}
                    onChange={(v) => updateGameCfg({ autoExposure: v }, true)}
                  />
                  <ToggleRow
                    label="In-game FPS, ping & packet loss counter"
                    description="Enables ROB RUN's built-in network and frame-rate readout."
                    checked={robRunOptimizer.showFpsCounter}
                    accent="emerald"
                    onChange={(v) => updateGameCfg({ showFpsCounter: v })}
                  />
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
