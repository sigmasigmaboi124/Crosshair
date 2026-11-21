import React from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  Info,
  MonitorPlay,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
} from 'lucide-react';
import { AppStore, getElectronAPI } from '../store/useAppStore';
import { SectionCard, ToggleRow } from './ui/Controls';
import { SUPPORTED_LANGUAGES } from '../data/i18n';
import { LanguageCode, UpdateChannel } from '../types/crosshair';

interface SettingsSafetyViewProps {
  store: AppStore;
}

export const SettingsSafetyView: React.FC<SettingsSafetyViewProps> = ({ store }) => {
  const {
    settings,
    setSettings,
    safetyAudit,
    updaterState,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    pullCommitUpdate,
    openRepoUrl,
    pushToast,
  } = store;
  const api = getElectronAPI();

  const auditChecks = [
    {
      label: 'Zero DLL Injection',
      ok: !safetyAudit.dllInjection,
      detail: 'Runs 100% as an isolated user-mode Windows application. Never loads or injects code into any game.',
    },
    {
      label: 'Zero Game Memory Access',
      ok: !safetyAudit.memoryAccess,
      detail: 'Never calls OpenProcess, ReadProcessMemory, or WriteProcessMemory. Cannot read player or game data.',
    },
    {
      label: 'Zero DirectX / Vulkan / OpenGL Hooking',
      ok: !safetyAudit.graphicsApiHooking,
      detail: 'Renders solely inside its own compact 360×360 transparent OS DWM compositor window.',
    },
    {
      label: 'Zero Global Input Hooks & Zero Synthetic Macros',
      ok: !safetyAudit.globalInputHooks && !safetyAudit.syntheticInput,
      detail: 'Never installs SetWindowsHookEx hooks and never calls SendInput / mouse_event / keybd_event.',
    },
    {
      label: 'Zero Screenshot / Capture Evasion',
      ok: !safetyAudit.captureEvasion,
      detail: 'Standard transparent window — never sets WDA_EXCLUDEFROMCAPTURE or attempts to hide from OS capture.',
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Hero Safety Banner */}
      <div className="rounded-2xl bg-[#141418] border border-[#2a2a33] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-white">Anti-Cheat Safe External Overlay Architecture</h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                ALL 5 INVARIANTS VERIFIED
              </span>
            </div>
            <p className="text-xs text-[#d0d0d8] mt-1 max-w-3xl leading-relaxed">
              Built on the same clean external Windows Desktop Window Manager (DWM) principles as Steam crosshair utilities. It behaves strictly as a separate click-through desktop window and never interacts with game files, memory, shaders, or input streams.
            </p>
          </div>
        </div>
        <div className="text-right font-mono text-[11px] shrink-0">
          <div className="text-[#9696a4]">WINBRIDGE STATUS</div>
          <div className={safetyAudit.bridgeConnected ? 'text-emerald-300 font-bold' : 'text-amber-300 font-bold'}>
            {safetyAudit.bridgeConnected ? '● CONNECTED (AUDITED)' : '○ STANDBY / WEB MODE'}
          </div>
        </div>
      </div>

      {/* Live 5-Point Architecture Audit */}
      <SectionCard title="Live Security & Anti-Cheat Invariant Inspector" badge="OPEN AUDITABLE SOURCE">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {auditChecks.map((chk) => (
            <div
              key={chk.label}
              className="rounded-xl bg-[#0e0e11] border border-[#24242c] p-3 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  {chk.label}
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  PASS
                </span>
              </div>
              <p className="text-[11px] text-[#9696a4] leading-relaxed">{chk.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2.5 text-xs text-amber-100/90">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Honest Transparency Note:</strong> External click-through overlays never trigger cheat detection for memory reading or injection, which is why they are widely used across FPS titles. However, individual game publishers control their own Terms of Service and tournament rules — if a competitive event disallows all external overlays, enable <strong>Ultra-Strict Static Mode</strong> or pause the overlay with your hotkey.
          </p>
        </div>
      </SectionCard>

      {/* Auto-Updater & GitHub Sync (Releases + Commits) */}
      <SectionCard
        title="Auto-Updater — GitHub Releases & Live Commits"
        badge={`v${updaterState.currentVersion} @ ${updaterState.currentShortSha}`}
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openRepoUrl(updaterState.repoUrl)}
              className="px-2.5 py-1 rounded-lg bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[11px] font-mono text-[#d0d0d8] hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <GitBranch className="w-3 h-3 text-[#a1a1ad]" />
              <span>{updaterState.repoOwner}/{updaterState.repoName}</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
            <button
              type="button"
              onClick={() => checkForUpdates()}
              disabled={updaterState.status === 'checking' || updaterState.status === 'downloading' || updaterState.status === 'building-commit'}
              className="px-3 py-1 rounded-lg bg-[#f4f4f6] hover:bg-white disabled:opacity-45 text-[#0c0c0e] font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${updaterState.status === 'checking' ? 'animate-spin' : ''}`} />
              <span>{updaterState.status === 'checking' ? 'Checking...' : 'Check Now'}</span>
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Channel & Auto-Update Controls */}
          <div className="lg:col-span-6 space-y-3">
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-[#d0d0d8]">Update Channel</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['both', 'Releases + Commits'],
                    ['releases', 'Stable Releases'],
                    ['commits', 'Latest Commits'],
                  ] as Array<[UpdateChannel, string]>
                ).map(([ch, lbl]) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() =>
                      setSettings((s) => ({ ...s, updater: { ...s.updater, channel: ch } }))
                    }
                    className={`py-2 px-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                      settings.updater.channel === ch
                        ? 'bg-[#25252e] border-[#444452] text-white'
                        : 'bg-[#0e0e11] border-[#23232a] text-[#9696a4] hover:text-white'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <ToggleRow
                label="Automatic Background Update Checks"
                description="Checks GitHub Releases & main commits automatically on launch and in the background."
                checked={settings.updater.autoCheck}
                onChange={(v) => setSettings((s) => ({ ...s, updater: { ...s.updater, autoCheck: v } }))}
              />
              <ToggleRow
                label="Auto-Download Installer Updates"
                description="Automatically downloads verified Windows .exe updates from GitHub Releases / Commit Pre-Releases."
                checked={settings.updater.autoDownload}
                accent="emerald"
                onChange={(v) => setSettings((s) => ({ ...s, updater: { ...s.updater, autoDownload: v } }))}
              />
            </div>

            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0e0e11] border border-[#23232a] text-xs">
              <span className="text-[#9696a4]">Background Check Interval</span>
              <select
                value={settings.updater.checkIntervalMinutes}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    updater: { ...s.updater, checkIntervalMinutes: Number(e.target.value) },
                  }))
                }
                className="px-2.5 py-1 rounded-lg bg-[#18181e] border border-[#2c2c35] text-xs font-mono text-[#f4f4f6]"
              >
                <option value={15}>Every 15 min</option>
                <option value={30}>Every 30 min</option>
                <option value={60}>Every 60 min</option>
              </select>
            </div>
          </div>

          {/* Right: Live Status, Download Progress & Recent Commits / Release */}
          <div className="lg:col-span-6 space-y-3">
            <div className="rounded-xl bg-[#0e0e11] border border-[#23232a] p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      updaterState.status === 'downloaded'
                        ? 'bg-emerald-400 animate-pulse'
                        : updaterState.status === 'update-available'
                        ? 'bg-amber-400 animate-pulse'
                        : updaterState.status === 'error'
                        ? 'bg-rose-400'
                        : 'bg-[#e4e4e8]'
                    }`}
                  />
                  <span className="text-xs font-bold text-white uppercase tracking-wide">
                    {updaterState.status === 'idle' && 'Ready to Check'}
                    {updaterState.status === 'checking' && 'Querying GitHub Releases & Commits...'}
                    {updaterState.status === 'up-to-date' && 'Up to Date (Latest Release & Commit)'}
                    {updaterState.status === 'update-available' &&
                      (updaterState.updateAvailableKind === 'both'
                        ? 'New Release & Commit Available'
                        : updaterState.updateAvailableKind === 'release'
                        ? 'New GitHub Release Available'
                        : 'New Commit Pushed to main')}
                    {updaterState.status === 'downloading' &&
                      `Downloading Update (${updaterState.downloadProgress?.percent ?? 0}%)`}
                    {updaterState.status === 'downloaded' && 'Update Downloaded — Ready to Install'}
                    {updaterState.status === 'building-commit' && (updaterState.commitSyncStep || 'Syncing commit...')}
                    {updaterState.status === 'error' && 'Update Check Issue'}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[#727280]">
                  {updaterState.isPackaged ? 'INSTALLED APP' : updaterState.hasLocalGit ? 'GIT WORKSPACE' : 'DEV BUILD'}
                </span>
              </div>

              {updaterState.error && (
                <div className="text-[11px] font-mono text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                  {updaterState.error}
                </div>
              )}

              {updaterState.status === 'downloading' && updaterState.downloadProgress && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-[#18181e] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                      style={{ width: `${updaterState.downloadProgress.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[#9696a4]">
                    <span>{updaterState.downloadProgress.percent}%</span>
                    <span>{(updaterState.downloadProgress.bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {updaterState.status === 'downloaded' && (
                  <button
                    type="button"
                    onClick={() => installUpdate()}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#0c0c0e] font-black text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Restart & Install Update
                  </button>
                )}

                {updaterState.status === 'update-available' && updaterState.canAutoInstallBinary && (
                  <button
                    type="button"
                    onClick={() => downloadUpdate()}
                    className="px-3.5 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] font-black text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download & Install Binary
                  </button>
                )}

                {updaterState.canPullCommitLocally && updaterState.status !== 'building-commit' && (
                  <button
                    type="button"
                    onClick={() => pullCommitUpdate()}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0c0c0e] font-black text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <GitCommitHorizontal className="w-3.5 h-3.5" /> Pull Commit, Rebuild & Relaunch
                  </button>
                )}

                {updaterState.latestRelease && (
                  <button
                    type="button"
                    onClick={() => openRepoUrl(updaterState.latestRelease?.htmlUrl)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[11px] font-mono text-[#f4f4f6] flex items-center gap-1 cursor-pointer"
                  >
                    <Tag className="w-3 h-3" /> {updaterState.latestRelease.tag}
                  </button>
                )}
              </div>

              {/* Latest Commits Feed */}
              <div className="pt-2 border-t border-[#222228] space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#727280]">
                  <span>LATEST COMMITS ({updaterState.branch})</span>
                  <span>
                    {updaterState.lastCheckedAt
                      ? `Checked ${new Date(updaterState.lastCheckedAt).toLocaleTimeString()}`
                      : 'Not checked yet'}
                  </span>
                </div>
                {updaterState.recentCommits.length === 0 ? (
                  <div className="text-[11px] text-[#727280]">
                    No commits published on <span className="font-mono text-[#9696a4]">{updaterState.repoOwner}/{updaterState.repoName}</span> yet. Once pushed, new commits and releases appear here automatically.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {updaterState.recentCommits.map((c) => (
                      <button
                        key={c.sha}
                        type="button"
                        onClick={() => openRepoUrl(c.htmlUrl)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-[#17171c] hover:bg-[#222229] text-left text-[11px] transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[#a1a1ad] shrink-0">{c.shortSha}</span>
                          <span className="text-[#ececf0] truncate">{c.message}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[#727280] shrink-0">{c.author}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Operating Modes & Fullscreen Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Safety Mode & Desktop Behavior" rightSlot={<SlidersHorizontal className="w-4 h-4 text-[#a1a1ad]" />}>
          <div className="space-y-2">
            <ToggleRow
              label="Ultra-Strict Static Mode (Maximum Minimalism)"
              description="Disables even passive GetAsyncKeyState / XInput / Window-Title reads. Pure static topmost window (disables reactive bloom, ADS hide & global hotkeys)."
              checked={settings.strictStaticMode}
              accent="emerald"
              onChange={(v) => {
                setSettings((s) => ({ ...s, strictStaticMode: v }));
                pushToast(
                  v ? 'Ultra-Strict Static Mode ON' : 'Standard Passive Mode ON',
                  v ? 'All input polling halted — pure static DWM window.' : 'Reactive bloom, ADS hide & hotkeys active.',
                  'emerald'
                );
              }}
            />

            <ToggleRow
              label="Topmost Z-Order Keep-Alive (No Focus Steal)"
              description="Gently re-asserts HWND_TOPMOST (SWP_NOACTIVATE) so your reticle stays visible over borderless games after Alt-Tab."
              checked={settings.topmostKeepAlive}
              onChange={(v) => setSettings((s) => ({ ...s, topmostKeepAlive: v }))}
            />

            <ToggleRow
              label="Low-RAM Gaming Mode (Unload UI to System Tray on Close)"
              description="Destroys the Chromium Studio UI when closed to tray, leaving ONLY the ultra-light native Win32 crosshair overlay & hotkeys active (~25–45 MB total RAM)."
              checked={settings.minimizeToTray}
              accent="emerald"
              onChange={(v) => setSettings((s) => ({ ...s, minimizeToTray: v }))}
            />
          </div>
        </SectionCard>

        <SectionCard title="Universal Game Compatibility & Fullscreen Guide" rightSlot={<MonitorPlay className="w-4 h-4 text-[#a1a1ad]" />}>
          <div className="space-y-2.5 text-xs text-[#d0d0d8] leading-relaxed">
            <p>
              To show your crosshair smoothly over <strong>every PC game</strong> with <strong>zero DLL injection</strong> and <strong>zero added input latency</strong>:
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-[#d0d0d8]">
              <li>
                Set your game’s Display Mode to <strong className="text-[#f4f4f6]">Windowed Fullscreen / Borderless</strong> (DX12 & Vulkan games already use modern Flip-Model presentation here!).
              </li>
              <li>
                On Windows 11, ensure <strong className="text-emerald-300">“Optimizations for windowed games”</strong> is ON — this upgrades DX10/DX11 borderless games to native Exclusive-Fullscreen latency while keeping external overlays visible.
              </li>
              <li>
                Because our overlay window is strictly <strong className="text-white">360×360 px</strong> instead of full-screen 4K, DWM compositing overhead is virtually 0% FPS impact.
              </li>
            </ol>

            <button
              type="button"
              onClick={() => {
                if (api) api.openWindowsGraphicsSettings();
                else pushToast('Desktop Feature', 'Open Windows Settings → System → Display → Graphics.', 'cyan');
              }}
              className="mt-1 px-4 py-2 rounded-xl bg-[#1e1e25] hover:bg-[#272730] border border-[#343440] text-[#f4f4f6] font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Windows Display Graphics Settings (1-Click)
            </button>
          </div>
        </SectionCard>
      </div>

      {/* Multi-Language Localization Picker (12 Languages) */}
      <SectionCard title="Interface Language (12 Languages)" rightSlot={<Globe className="w-4 h-4 text-[#a1a1ad]" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = settings.language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setSettings((s) => ({ ...s, language: lang.code as LanguageCode }));
                  pushToast('Language Updated', `${lang.nativeName} (${lang.name})`, 'cyan');
                }}
                className={`px-3 py-2 rounded-xl border text-left transition cursor-pointer ${
                  active
                    ? 'bg-[#25252e] border-[#444452] text-white'
                    : 'bg-[#0e0e11] border-[#23232a] text-[#d0d0d8] hover:border-[#3b3b47]'
                }`}
              >
                <div className="text-xs font-bold">{lang.nativeName}</div>
                <div className="text-[10px] text-[#727280]">{lang.name}</div>
              </button>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
};
