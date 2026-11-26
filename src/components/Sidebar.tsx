import React from 'react';
import {
  Award,
  Bookmark,
  Compass,
  Crosshair,
  Gamepad2,
  Gauge,
  Monitor,
  Palette,
  ShieldCheck,
  Sliders,
  Volume2,
} from 'lucide-react';
import { AppStore, NavTab } from '../store/useAppStore';
import { useT } from '../data/i18n';
import { ACHIEVEMENTS } from '../data/achievements';

interface SidebarProps {
  store: AppStore;
}

export const Sidebar: React.FC<SidebarProps> = ({ store }) => {
  const { activeTab, setActiveTab, settings, profiles, achievements, liveInput, updaterState } = store;
  const t = useT(settings.language);
  const hasUpdate = updaterState.status === 'update-available' || updaterState.status === 'downloaded';

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    meta?: string;
    highlight?: boolean;
  }> = [
    { id: 'designer', label: t.navDesigner, icon: <Sliders className="w-4 h-4" /> },
    { id: 'community', label: t.navCommunity, icon: <Compass className="w-4 h-4" />, meta: '48' },
    { id: 'profiles', label: t.navProfiles, icon: <Bookmark className="w-4 h-4" />, meta: String(profiles.length) },
    { id: 'aim-trainer', label: t.navAimTrainer, icon: <Crosshair className="w-4 h-4" /> },
    {
      id: 'color-filters',
      label: t.navColorFilters,
      icon: <Palette className="w-4 h-4" />,
      meta: store.colorFilter.enabled ? 'On' : undefined,
    },
    {
      id: 'audio-limiter',
      label: t.navAudioLimiter,
      icon: <Volume2 className="w-4 h-4" />,
      meta: store.audioLimiter.masterEnabled ? 'On' : undefined,
    },
    {
      id: 'fps-optimizer',
      label: t.navFpsOptimizer,
      icon: <Gauge className="w-4 h-4" />,
      meta: store.optimizerStatus.gameRunning ? 'Run' : undefined,
    },
    { id: 'monitors', label: t.navMonitors, icon: <Monitor className="w-4 h-4" /> },
    { id: 'keybinds', label: t.navKeybinds, icon: <Gamepad2 className="w-4 h-4" /> },
    {
      id: 'achievements',
      label: t.navAchievements,
      icon: <Award className="w-4 h-4" />,
      meta: `${achievements.unlockedIds.length}/${ACHIEVEMENTS.length}`,
    },
    {
      id: 'safety',
      label: t.navSafety,
      icon: <ShieldCheck className="w-4 h-4" />,
      meta: hasUpdate ? 'Update' : undefined,
      highlight: hasUpdate,
    },
  ];

  return (
    <aside className="w-52 shrink-0 bg-[#101013] border-r border-[#222228] flex flex-col justify-between p-2.5 select-none">
      <nav className="space-y-0.5">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer relative ${
                active
                  ? 'bg-[#1d1d23] text-[#f4f4f6]'
                  : 'text-[#8c8c9a] hover:text-[#e4e4e8] hover:bg-[#17171c]'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[#ff5526]" />
              )}
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={active ? 'text-[#f4f4f6]' : 'text-[#6c6c7a]'}>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </div>
              {item.meta && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    item.highlight
                      ? 'bg-[#ff5526]/20 text-[#ff8e6e]'
                      : active
                      ? 'text-[#b4b4c0] bg-[#26262e]'
                      : 'text-[#686875]'
                  }`}
                >
                  {item.meta}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quiet Hardware Input Footer */}
      <div className="pt-3 border-t border-[#1e1e24] px-1.5 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[#787886]">
          <span>Input monitor</span>
          <span className="font-mono text-[10px] text-[#a1a1ad]">
            {settings.strictStaticMode ? 'Static' : 'Passive'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 text-center font-mono text-[10px]">
          <div
            className={`py-1 rounded border transition-colors ${
              liveInput.lmb || liveInput.controller.fire
                ? 'bg-[#ff5526]/20 border-[#ff5526]/50 text-[#ff9375]'
                : 'bg-[#141418] border-[#222228] text-[#666674]'
            }`}
          >
            LMB
          </div>
          <div
            className={`py-1 rounded border transition-colors ${
              liveInput.rmb || liveInput.controller.ads
                ? 'bg-amber-500/20 border-amber-500/45 text-amber-200'
                : 'bg-[#141418] border-[#222228] text-[#666674]'
            }`}
          >
            ADS
          </div>
          <div
            className={`py-1 rounded border transition-colors ${
              liveInput.moving
                ? 'bg-white/10 border-white/25 text-white'
                : 'bg-[#141418] border-[#222228] text-[#666674]'
            }`}
          >
            MOVE
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-[#666674]">
          <span>Gamepad</span>
          <span className={liveInput.controller.connected ? 'text-emerald-400 font-mono' : 'font-mono'}>
            {liveInput.controller.connected ? 'Connected' : 'None'}
          </span>
        </div>
      </div>
    </aside>
  );
};
