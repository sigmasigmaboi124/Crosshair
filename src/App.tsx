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
    <div className="h-screen w-screen flex flex-col bg-[#0c0c0e] text-[#f4f4f6] overflow-hidden select-none">
      <TitleBar store={store} />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar store={store} />

        <main className="flex-1 min-w-0 min-h-0 bg-[#0c0c0e] overflow-hidden relative">
          {store.activeTab === 'designer' && <DesignerView store={store} />}
          {store.activeTab === 'community' && <CommunityView store={store} />}
          {store.activeTab === 'profiles' && <ProfilesView store={store} />}
          {store.activeTab === 'aim-trainer' && (
            <Suspense
              fallback={
                <div className="h-full w-full flex items-center justify-center text-xs text-[#8c8c9a]">
                  Loading 3D Range...
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

          {/* Minimal Floating Toast */}
          {store.toasts.length > 0 && (
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-1.5 pointer-events-none max-w-[270px]">
              {store.toasts.map((toast) => {
                const dotColor = {
                  cyan: 'bg-white',
                  emerald: 'bg-emerald-400',
                  amber: 'bg-amber-400',
                  rose: 'bg-rose-400',
                }[toast.tone];

                return (
                  <div
                    key={toast.id}
                    className="rounded-lg bg-[#18181d]/95 border border-[#2c2c34] px-3 py-2 shadow-xl shadow-black/50 flex items-start gap-2.5"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#f4f4f6] leading-tight">{toast.title}</div>
                      <div className="text-[11px] text-[#9898a6] mt-0.5 leading-snug">{toast.message}</div>
                    </div>
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
