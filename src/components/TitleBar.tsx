import React from 'react';
import { ArrowDownToLine, Crosshair, Minus, Power, ShieldCheck, Square, X } from 'lucide-react';
import { AppStore, getElectronAPI } from '../store/useAppStore';
import { useT } from '../data/i18n';

interface TitleBarProps {
  store: AppStore;
}

export const TitleBar: React.FC<TitleBarProps> = ({ store }) => {
  const { settings, setSettings, activeConfig, monitors, safetyAudit, updaterState } = store;
  const t = useT(settings.language);
  const api = getElectronAPI();
  const activeMonitor = monitors[settings.selectedMonitorIndex] ?? monitors[0];
  const hasUpdate = updaterState.status === 'update-available' || updaterState.status === 'downloaded' || updaterState.status === 'downloading';

  return (
    <header className="drag-region h-12 shrink-0 bg-[#070a10] border-b border-slate-800/90 px-3.5 flex items-center justify-between select-none">
      {/* Brand Telemetry */}
      <div className="flex items-center gap-3">
        <div className="relative w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400/20 to-emerald-400/10 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_16px_rgba(0,240,255,0.2)]">
          <Crosshair className="w-4 h-4 text-cyan-300" />
        </div>
        <div className="leading-none">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black tracking-wider text-white">
              ZERO<span className="text-cyan-400">POINT</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-slate-400">
              OPTICS + RANGE 3D
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-2">
            <span className="text-slate-300">{activeConfig.name}</span>
            <span>•</span>
            <span>
              M{(activeMonitor?.index ?? 0) + 1} ({activeMonitor?.width ?? 1920}×{activeMonitor?.height ?? 1080})
            </span>
            <span>•</span>
            <span>
              XY ({activeConfig.position.offsetX >= 0 ? `+${activeConfig.position.offsetX}` : activeConfig.position.offsetX},{' '}
              {activeConfig.position.offsetY >= 0 ? `+${activeConfig.position.offsetY}` : activeConfig.position.offsetY})
            </span>
          </div>
        </div>
      </div>

      {/* Center Live Status & Master Overlay Toggle */}
      <div className="no-drag flex items-center gap-2.5">
        {hasUpdate && (
          <button
            type="button"
            onClick={() => store.setActiveTab('safety')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/50 hover:bg-amber-500/25 transition text-[11px] font-bold text-amber-200 cursor-pointer animate-pulse"
            title="New GitHub Release or Commit available — click to update"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>
              {updaterState.status === 'downloaded'
                ? 'Restart to Update'
                : updaterState.status === 'downloading'
                ? `Downloading ${updaterState.downloadProgress?.percent ?? 0}%`
                : 'Update Available'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => store.setActiveTab('safety')}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition text-[11px] font-medium text-emerald-300"
          title="Zero-Injection External DWM Architecture"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{settings.strictStaticMode ? t.strictMode : t.safeVerified}</span>
          {safetyAudit.bridgeConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </button>

        <button
          type="button"
          onClick={() => setSettings((s) => ({ ...s, overlayEnabled: !s.overlayEnabled }))}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs tracking-wider border transition-all cursor-pointer ${
            settings.overlayEnabled
              ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-200 shadow-[0_0_18px_rgba(0,240,255,0.22)] hover:bg-cyan-500/25'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              settings.overlayEnabled ? 'bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-pulse' : 'bg-slate-600'
            }`}
          />
          <Power className="w-3.5 h-3.5" />
          <span>{settings.overlayEnabled ? t.overlayLive : t.overlayPaused}</span>
          <span className="text-[10px] font-mono opacity-65 ml-1">[{settings.toggleHotkey.label}]</span>
        </button>
      </div>

      {/* Window Controls */}
      <div className="no-drag flex items-center gap-1">
        {api ? (
          <>
            <button
              type="button"
              onClick={() => api.windowControl('minimize')}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
              title="Minimize"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => api.windowControl('maximize')}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
              title="Maximize / Restore"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => api.windowControl('close')}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/80 transition"
              title={settings.minimizeToTray ? 'Minimize to System Tray' : 'Quit'}
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400">
            WEB PREVIEW
          </span>
        )}
      </div>
    </header>
  );
};
