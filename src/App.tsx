import React, { Suspense, lazy } from 'react';
import { useAppStore } from './store/useAppStore';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { DesignerView } from './components/DesignerView';
import { CommunityView } from './components/CommunityView';
import { ProfilesView } from './components/ProfilesView';
import { MonitorsView } from './components/MonitorsView';
import { KeybindsView } from './components/KeybindsView';
import { AchievementsView } from './components/AchievementsView';
import { SettingsSafetyView } from './components/SettingsSafetyView';

// Lazy-load Three.js 3D Aim Trainer so WebGL & Three.js consume 0 MB RAM until opened
const AimTrainerView = lazy(() => import('./components/AimTrainerView'));

export const App: React.FC = () => {
  const store = useAppStore();

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07090e] text-slate-100 overflow-hidden select-none">
      <TitleBar store={store} />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar store={store} />

        <main className="flex-1 min-w-0 min-h-0 bg-[#080b12] bg-optics-grid overflow-hidden relative">
          {store.activeTab === 'designer' && <DesignerView store={store} />}
          {store.activeTab === 'community' && <CommunityView store={store} />}
          {store.activeTab === 'profiles' && <ProfilesView store={store} />}
          {store.activeTab === 'aim-trainer' && (
            <Suspense
              fallback={
                <div className="h-full w-full flex items-center justify-center text-xs font-mono text-cyan-300">
                  Initializing 3D WebGL Range Engine...
                </div>
              }
            >
              <AimTrainerView store={store} />
            </Suspense>
          )}
          {store.activeTab === 'monitors' && <MonitorsView store={store} />}
          {store.activeTab === 'keybinds' && <KeybindsView store={store} />}
          {store.activeTab === 'achievements' && <AchievementsView store={store} />}
          {store.activeTab === 'safety' && <SettingsSafetyView store={store} />}

          {/* Floating Telemetry Toast Stack */}
          {store.toasts.length > 0 && (
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-xs">
              {store.toasts.map((toast) => {
                const borderColor = {
                  cyan: 'border-cyan-400/60 bg-[#09121f]/95 text-cyan-200',
                  emerald: 'border-emerald-400/60 bg-[#081915]/95 text-emerald-200',
                  amber: 'border-amber-400/60 bg-[#1a1409]/95 text-amber-200',
                  rose: 'border-rose-400/60 bg-[#1c0b11]/95 text-rose-200',
                }[toast.tone];

                return (
                  <div
                    key={toast.id}
                    className={`rounded-xl border px-3.5 py-2.5 backdrop-blur-md shadow-xl shadow-black/50 ${borderColor}`}
                  >
                    <div className="text-[11px] font-black uppercase tracking-wider">{toast.title}</div>
                    <div className="text-xs text-slate-200 mt-0.5">{toast.message}</div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
