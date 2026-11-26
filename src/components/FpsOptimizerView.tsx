import React, { useMemo } from 'react';
import { Check, Copy, FolderOpen, Gauge, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { SectionCard, SliderRow, ToggleRow } from './ui/Controls';
import { RobRunOptimizerConfig, RobRunPresetId } from '../types/crosshair';

interface FpsOptimizerViewProps {
  store: AppStore;
}

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
    monitors,
    refreshOptimizerStatus,
    applyRobRunOptimizerNow,
    restoreRobRunOriginal,
    restoreDesktopDisplayNow,
    launchRobRunOptimized,
    openLocalPath,
    pushToast,
  } = store;

  const updateCfg = (patch: Partial<RobRunOptimizerConfig>, markCustom = false) => {
    setRobRunOptimizer((prev) => ({
      ...prev,
      ...patch,
      preset: markCustom ? 'custom' : patch.preset ?? prev.preset,
    }));
  };

  const applyPreset = (id: Exclude<RobRunPresetId, 'custom'>) => {
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
  }, [optimizerStatus.supportedModes, optimizerStatus.currentDesktopHz, robRunOptimizer.resWidth, robRunOptimizer.resHeight, robRunOptimizer.refreshRateHz]);

  const settingsFileFound = optimizerStatus.settingsFilePaths[0] || '';

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header & One-Click Actions */}
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1c1c22] border border-[#2b2b34] flex items-center justify-center shrink-0">
            <Gauge className="w-4 h-4 text-[#f4f4f6]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">ROB RUN competitive config & FPS optimizer</h2>
            <p className="text-xs text-[#8c8c9a] mt-0.5 max-w-2xl leading-relaxed">
              Applies competitive graphics, launch flags, stretched resolution, and refresh rate only when{' '}
              <span className="font-mono text-[#e4e4e8]">{robRunOptimizer.targetProcessName}</span> launches, and restores your normal desktop on exit.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {optimizerStatus.displayStretchedActive && (
            <button
              type="button"
              onClick={() => restoreDesktopDisplayNow()}
              className="px-3 py-1.5 rounded-lg bg-[#1c1c22] hover:bg-[#26262f] border border-[#343440] text-xs font-medium text-[#e4e4e8] flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore desktop</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => restoreRobRunOriginal()}
            disabled={!optimizerStatus.hasBackup}
            className="px-3 py-1.5 rounded-lg bg-[#18181e] hover:bg-[#22222a] disabled:opacity-40 border border-[#2c2c35] text-xs font-medium text-[#d0d0d8] flex items-center gap-1.5 cursor-pointer"
            title="Restore ROB RUN's original graphics config and GPU settings"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#9898a6]" />
            <span>Restore original</span>
          </button>

          <button
            type="button"
            onClick={() => applyRobRunOptimizerNow()}
            className="px-3.5 py-1.5 rounded-lg bg-[#22222a] hover:bg-[#2c2c36] border border-[#3a3a46] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Save to ROB RUN</span>
          </button>

          <button
            type="button"
            onClick={() => launchRobRunOptimized()}
            className="px-4 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Launch ROB RUN</span>
          </button>
        </div>
      </div>

      {/* Process Scope & Detected Paths */}
      <SectionCard
        title="Process & game files"
        subtitle="External config & display automation"
        rightSlot={
          <button
            type="button"
            onClick={() => refreshOptimizerStatus()}
            className="p-1.5 rounded-md bg-[#18181e] hover:bg-[#222229] border border-[#2a2a33] text-[#a1a1ad] hover:text-white cursor-pointer"
            title="Rescan ROB RUN files & display"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
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
              Desktop mode: {optimizerStatus.currentDesktopWidth}×{optimizerStatus.currentDesktopHeight} @{' '}
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
                onChange={(e) => updateCfg({ customInstallDir: e.target.value })}
                placeholder="D:\SteamLibrary\steamapps\common\Rob Run"
                className="w-full px-2 py-1 rounded bg-[#0e0e11] border border-[#27272f] text-[11px] font-mono text-white"
              />
            )}
          </div>

          <div className="space-y-1 min-w-0">
            <div className="text-[#787886]">User graphics config</div>
            <div className="font-mono text-[11px] text-[#d0d0d8] truncate">
              {settingsFileFound ? settingsFileFound.split('\\').slice(-2).join('\\') : 'AppData\\LocalLow\\Kefir\\ROB RUN\\settings'}
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
                {optimizerStatus.hasBackup ? 'Original backup saved' : 'Auto-backs up on first apply'}
              </span>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Automation, Stretched Res + Refresh Rate & Launch Flags */}
        <div className="lg:col-span-5 space-y-4">
          <SectionCard
            title="Automatic launch & exit rules"
            subtitle={`Applies strictly to ${robRunOptimizer.targetProcessName}`}
          >
            <ToggleRow
              label="Auto-apply config when ROB RUN starts"
              description="Writes your competitive graphics settings automatically whenever ROB RUN launches."
              checked={robRunOptimizer.autoOptimizeOnLaunch}
              accent="emerald"
              onChange={(v) => updateCfg({ autoOptimizeOnLaunch: v })}
            />
            <ToggleRow
              label="Auto-switch stretched resolution & restore desktop on exit"
              description="Switches your display to your stretched resolution only while ROB RUN is open, and restores your desktop the moment it closes."
              checked={robRunOptimizer.autoRestoreDesktopOnExit && robRunOptimizer.applyStretchedDisplayOnLaunch}
              accent="emerald"
              onChange={(v) =>
                updateCfg({
                  applyStretchedDisplayOnLaunch: v,
                  autoRestoreDesktopOnExit: v ? true : robRunOptimizer.autoRestoreDesktopOnExit,
                })
              }
            />
            <ToggleRow
              label="High-performance GPU & flip-model priority"
              description="Assigns dedicated GPU priority and low-latency borderless flip presentation for ROB RUN.exe only."
              checked={robRunOptimizer.gpuHighPerformance}
              onChange={(v) => updateCfg({ gpuHighPerformance: v })}
            />

            <div className="pt-2.5 border-t border-[#1f1f26] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8c8c9a]">
              <span>Companion ROB RUN tools</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => store.setActiveTab('color-filters')}
                  className="px-2 py-1 rounded bg-[#18181e] hover:bg-[#22222a] border border-[#2c2c35] text-[#d4d4dc] cursor-pointer"
                >
                  Color filters ({store.colorFilter.enabled ? store.colorFilter.activePreset : 'Off'})
                </button>
                <button
                  type="button"
                  onClick={() => store.setActiveTab('audio-limiter')}
                  className="px-2 py-1 rounded bg-[#18181e] hover:bg-[#22222a] border border-[#2c2c35] text-[#d4d4dc] cursor-pointer"
                >
                  Audio limiter ({store.audioLimiter.masterEnabled ? 'On' : 'Off'})
                </button>
              </div>
            </div>
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
                      updateCfg(
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
                  onChange={(e) => updateCfg({ resWidth: Math.max(800, Number(e.target.value) || 1440) }, true)}
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
                  onChange={(e) => updateCfg({ resHeight: Math.max(600, Number(e.target.value) || 1080) }, true)}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs font-mono tabular-nums text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[#8c8c9a] block">Refresh rate</label>
                <select
                  value={robRunOptimizer.refreshRateHz}
                  onChange={(e) => updateCfg({ refreshRateHz: Number(e.target.value) })}
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
                  onChange={(e) => updateCfg({ targetMonitorIndex: Number(e.target.value) })}
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
                    updateCfg({
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
              description="Stops Unity stack-trace file spam during combat to prevent micro-stutters."
              checked={robRunOptimizer.flagNoLog}
              onChange={(v) => updateCfg({ flagNoLog: v })}
            />
            <ToggleRow
              label="Borderless flip-model flag (-window-mode borderless)"
              description="Fast Alt-Tab and full compatibility with external crosshair overlays."
              checked={robRunOptimizer.flagBorderless}
              onChange={(v) => updateCfg({ flagBorderless: v })}
            />
            <ToggleRow
              label="Force Direct3D 11 (-force-d3d11)"
              description="Locks ROB RUN to its native D3D11 render path."
              checked={robRunOptimizer.flagForceD3d11}
              onChange={(v) => updateCfg({ flagForceD3d11: v })}
            />

            <div className="pt-2 border-t border-[#1f1f26] space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#8c8c9a]">
                <span>Generated Steam launch options</span>
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

        {/* Right Column: One-Click Presets & Granular ROB RUN Graphics Settings */}
        <div className="lg:col-span-7 space-y-4">
          <SectionCard
            title="One-click presets"
            subtitle="Apply a ready-to-play ROB RUN profile"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ROBRUN_PRESETS.map((p) => {
                const selected = robRunOptimizer.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
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
                    updateCfg({ grassQuality: e.target.value as RobRunOptimizerConfig['grassQuality'] }, true)
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
                    updateCfg({ grassDistance: e.target.value as RobRunOptimizerConfig['grassDistance'] }, true)
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
                    updateCfg({ shadows: e.target.value as RobRunOptimizerConfig['shadows'] }, true)
                  }
                  className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                >
                  <option value="disabled">Disabled (+15–25% FPS & brighter interiors)</option>
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
                    updateCfg({ cullingDistance: e.target.value as RobRunOptimizerConfig['cullingDistance'] }, true)
                  }
                  className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                >
                  <option value="low">Low (Max FPS)</option>
                  <option value="medium">Medium (Balanced)</option>
                  <option value="high">High (Long-range cover visibility)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#a1a1ad] block">Texture quality</label>
                <select
                  value={robRunOptimizer.textureMipmapLimit}
                  onChange={(e) => updateCfg({ textureMipmapLimit: Number(e.target.value) }, true)}
                  className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                >
                  <option value={2}>Quarter resolution (Fastest frame times)</option>
                  <option value={1}>Half resolution</option>
                  <option value={0}>Full resolution</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#a1a1ad] block">Anti-aliasing</label>
                <select
                  value={robRunOptimizer.antiAliasing}
                  onChange={(e) =>
                    updateCfg({ antiAliasing: e.target.value as RobRunOptimizerConfig['antiAliasing'] }, true)
                  }
                  className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
                >
                  <option value="disabled">Disabled (Zero motion blur)</option>
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
                onChange={(v) => updateCfg({ lodBias: v }, true)}
              />
              <SliderRow
                label="3D render scale"
                value={Math.round(robRunOptimizer.renderScale * 100)}
                min={50}
                max={100}
                step={5}
                unit="%"
                onChange={(v) => updateCfg({ renderScale: v / 100 }, true)}
              />
            </div>

            <div className="pt-3 border-t border-[#1f1f26] space-y-1.5">
              <ToggleRow
                label="HBAO ambient occlusion"
                description="Keep off for brighter dark corners and ~10% higher GPU FPS."
                checked={robRunOptimizer.hbao}
                onChange={(v) => updateCfg({ hbao: v }, true)}
              />
              <ToggleRow
                label="Screen-space reflections"
                description="Keep off to remove distracting floor/water glare and frame dips."
                checked={robRunOptimizer.reflections}
                onChange={(v) => updateCfg({ reflections: v }, true)}
              />
              <ToggleRow
                label="Depth of field blur"
                description="Keep off so distant targets stay sharp when aiming down sights."
                checked={robRunOptimizer.depthOfField}
                onChange={(v) => updateCfg({ depthOfField: v }, true)}
              />
              <ToggleRow
                label="Auto-exposure lighting shifts"
                description="Keep off to avoid sudden screen dimming or blinding window glare."
                checked={robRunOptimizer.autoExposure}
                onChange={(v) => updateCfg({ autoExposure: v }, true)}
              />
              <ToggleRow
                label="In-game FPS, ping & packet loss counter"
                description="Enables ROB RUN's built-in network and frame-rate readout."
                checked={robRunOptimizer.showFpsCounter}
                accent="emerald"
                onChange={(v) => updateCfg({ showFpsCounter: v })}
              />
            </div>

            {optimizerStatus.liveConfigSummary && (
              <div className="pt-3 border-t border-[#1f1f26] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#787886]">
                <span>Currently saved in ROB RUN file:</span>
                <span className="font-mono tabular-nums text-[#b4b4c0]">
                  {optimizerStatus.liveConfigSummary.resolution} · Grass {optimizerStatus.liveConfigSummary.grass} · Shadows{' '}
                  {optimizerStatus.liveConfigSummary.shadows} · HBAO {optimizerStatus.liveConfigSummary.hbao ? 'on' : 'off'} ·
                  Reflections {optimizerStatus.liveConfigSummary.reflections ? 'on' : 'off'}
                </span>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
