import React from 'react';
import {
  Award,
  Bookmark,
  Compass,
  Crosshair,
  Gamepad2,
  Monitor,
  ShieldCheck,
  Sliders,
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
    badge?: string;
    accent?: boolean;
  }> = [
    { id: 'designer', label: t.navDesigner, icon: <Sliders className="w-4 h-4" /> },
    { id: 'community', label: t.navCommunity, icon: <Compass className="w-4 h-4" />, badge: '45+' },
    { id: 'profiles', label: t.navProfiles, icon: <Bookmark className="w-4 h-4" />, badge: String(profiles.length) },
    { id: 'aim-trainer', label: t.navAimTrainer, icon: <Crosshair className="w-4 h-4" />, badge: '3D', accent: true },
    { id: 'monitors', label: t.navMonitors, icon: <Monitor className="w-4 h-4" /> },
    { id: 'keybinds', label: t.navKeybinds, icon: <Gamepad2 className="w-4 h-4" /> },
    {
      id: 'achievements',
      label: t.navAchievements,
      icon: <Award className="w-4 h-4" />,
      badge: `${achievements.unlockedIds.length}/${ACHIEVEMENTS.length}`,
    },
    {
      id: 'safety',
      label: t.navSafety,
      icon: <ShieldCheck className="w-4 h-4" />,
      badge: hasUpdate ? 'UPD' : undefined,
      accent: hasUpdate,
    },
  ];

  return (
    <aside className="w-56 shrink-0 bg-[#0a0e17] border-r border-slate-800/90 flex flex-col justify-between p-2.5 select-none">
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group relative overflow-hidden ${
                active
                  ? 'bg-gradient-to-r from-cyan-500/20 via-cyan-500/10 to-transparent text-cyan-200 border border-cyan-400/40 shadow-[inset_0_0_16px_rgba(0,240,255,0.08)]'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-cyan-400 shadow-[0_0_10px_#00f0ff]" />
              )}
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={active ? 'text-cyan-300' : item.accent ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                    item.accent
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : active
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Live Telemetry Pod */}
      <div className="rounded-xl bg-[#0e1422] border border-slate-800/90 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Live Telemetry</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              settings.strictStaticMode
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-cyan-500/15 text-cyan-300'
            }`}
          >
            {settings.strictStaticMode ? 'STATIC' : 'PASSIVE'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px]">
          <div
            className={`py-1 rounded border transition ${
              liveInput.lmb || liveInput.controller.fire
                ? 'bg-rose-500/25 border-rose-400/60 text-rose-200'
                : 'bg-slate-950/70 border-slate-800 text-slate-500'
            }`}
          >
            FIRE
          </div>
          <div
            className={`py-1 rounded border transition ${
              liveInput.rmb || liveInput.controller.ads
                ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                : 'bg-slate-950/70 border-slate-800 text-slate-500'
            }`}
          >
            ADS
          </div>
          <div
            className={`py-1 rounded border transition ${
              liveInput.moving
                ? 'bg-cyan-500/25 border-cyan-400/60 text-cyan-200'
                : 'bg-slate-950/70 border-slate-800 text-slate-500'
            }`}
          >
            MOVE
          </div>
        </div>

        <div className="text-[10px] text-slate-500 flex items-center justify-between pt-0.5 border-t border-slate-800/80">
          <span>Controller</span>
          <span className={liveInput.controller.connected ? 'text-emerald-400 font-mono' : 'text-slate-600 font-mono'}>
            {liveInput.controller.connected ? 'XINPUT READY' : 'NONE'}
          </span>
        </div>
      </div>
    </aside>
  );
};
