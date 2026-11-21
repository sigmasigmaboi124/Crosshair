import React from 'react';
import { ArrowDownToLine, Minus, Square, X } from 'lucide-react';
import { AppStore, getElectronAPI } from '../store/useAppStore';
import { useT } from '../data/i18n';

interface TitleBarProps {
  store: AppStore;
}

export const TitleBar: React.FC<TitleBarProps> = ({ store }) => {
  const { settings, setSettings, activeConfig, monitors, updaterState } = store;
  const t = useT(settings.language);
  const api = getElectronAPI();
  const activeMonitor = monitors[settings.selectedMonitorIndex] ?? monitors[0];
  const hasUpdate =
    updaterState.status === 'update-available' ||
    updaterState.status === 'downloaded' ||
    updaterState.status === 'downloading';

  return (
    <header className="drag-region h-11 shrink-0 bg-[#101013] border-b border-[#222228] px-3.5 flex items-center justify-between select-none">
      {/* Left: Brand & quiet breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 20 20" className="w-4 h-4 text-[#f4f4f6] shrink-0" fill="none">
            <rect x="9.1" y="2" width="1.8" height="4.8" rx="0.6" fill="currentColor" />
            <rect x="9.1" y="13.2" width="1.8" height="4.8" rx="0.6" fill="currentColor" />
            <rect x="2" y="9.1" width="4.8" height="1.8" rx="0.6" fill="currentColor" />
            <rect x="13.2" y="9.1" width="4.8" height="1.8" rx="0.6" fill="currentColor" />
            <circle cx="10" cy="10" r="1.5" fill="#ff5526" />
          </svg>
          <span className="text-[13px] font-semibold tracking-tight text-[#f4f4f6]">ZeroPoint</span>
        </div>

        <span className="text-[#2f2f38]">/</span>

        <div className="text-xs text-[#8c8c9a] truncate flex items-center gap-2">
          <span className="text-[#d4d4dc] font-medium truncate max-w-[180px]">{activeConfig.name}</span>
          <span className="hidden md:inline font-mono text-[11px] text-[#666674]">
            Display {(activeMonitor?.index ?? 0) + 1} · {activeMonitor?.width ?? 1920}×{activeMonitor?.height ?? 1080}
          </span>
        </div>
      </div>

      {/* Center/Right: Update pill + Clean Overlay Switch + Window Controls */}
      <div className="no-drag flex items-center gap-2">
        {hasUpdate && (
          <button
            type="button"
            onClick={() => store.setActiveTab('safety')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#ff5526]/15 border border-[#ff5526]/40 hover:bg-[#ff5526]/25 transition text-[11px] font-medium text-[#ff9375] cursor-pointer"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>
              {updaterState.status === 'downloaded'
                ? 'Restart to update'
                : updaterState.status === 'downloading'
                ? `Updating ${updaterState.downloadProgress?.percent ?? 0}%`
                : 'Update available'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setSettings((s) => ({ ...s, overlayEnabled: !s.overlayEnabled }))}
          className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium border transition cursor-pointer ${
            settings.overlayEnabled
              ? 'bg-[#1b1b20] border-[#34343e] text-[#f4f4f6] hover:bg-[#222229]'
              : 'bg-[#121216] border-[#23232a] text-[#787886] hover:text-[#c4c4cf]'
          }`}
          title={`Toggle overlay (${settings.toggleHotkey.label})`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              settings.overlayEnabled ? 'bg-emerald-400' : 'bg-[#52525e]'
            }`}
          />
          <span>{settings.overlayEnabled ? 'Overlay on' : 'Overlay off'}</span>
          <span className="text-[10px] font-mono text-[#6e6e7c]">{settings.toggleHotkey.label}</span>
        </button>

        {api ? (
          <div className="flex items-center ml-1 pl-2 border-l border-[#222228]">
            <button
              type="button"
              onClick={() => api.windowControl('minimize')}
              className="w-8 h-7 rounded flex items-center justify-center text-[#858594] hover:text-white hover:bg-[#1e1e24] transition cursor-pointer"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => api.windowControl('maximize')}
              className="w-8 h-7 rounded flex items-center justify-center text-[#858594] hover:text-white hover:bg-[#1e1e24] transition cursor-pointer"
              title="Maximize"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => api.windowControl('close')}
              className="w-8 h-7 rounded flex items-center justify-center text-[#858594] hover:text-white hover:bg-[#c83232] transition cursor-pointer"
              title={settings.minimizeToTray ? 'Close to Gaming Mode (Tray)' : 'Quit'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-[#666674] ml-2">{t.overlayLive}</span>
        )}
      </div>
    </header>
  );
};
