import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Gamepad,
  Monitor,
  Plus,
  Sliders,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { MiniCrosshairCanvas } from './CrosshairPreview';
import { ToggleRow } from './ui/Controls';
import { downloadTextFile, encodeShareCode } from '../engine/shareCodec';
import { SavedProfile } from '../types/crosshair';

interface ProfilesViewProps {
  store: AppStore;
}

export const ProfilesView: React.FC<ProfilesViewProps> = ({ store }) => {
  const {
    profiles,
    setProfiles,
    activeProfileId,
    selectProfile,
    saveCurrentAsProfile,
    deleteProfile,
    updateProfileMeta,
    monitors,
    settings,
    setSettings,
    foregroundWindowTitle,
    pushToast,
    bumpStat,
  } = store;

  const [newName, setNewName] = useState('');

  const handleExportPack = () => {
    downloadTextFile(
      `zeropoint-armory-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(profiles, null, 2),
      'application/json'
    );
    pushToast('Armory Exported', `${profiles.length} saved profiles backed up to JSON.`, 'emerald');
  };

  const handleImportPack = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as SavedProfile[];
        if (!Array.isArray(parsed)) throw new Error('Invalid JSON pack.');
        const stamped = parsed.map((p, i) => ({
          ...p,
          id: `pack-${Date.now()}-${i}`,
          quickSlot: null,
        }));
        setProfiles((prev) => [...stamped, ...prev]);
        pushToast('Armory Imported', `Added ${stamped.length} crosshair profiles.`, 'emerald');
      } catch {
        pushToast('Import Error', 'Selected file is not a valid ZeroPoint JSON pack.', 'rose');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden gap-3.5">
      {/* Header */}
      <div className="rounded-2xl bg-[#0d121d] border border-slate-800/90 p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <span>Saved Armory & Per-Game Profiles</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              UNLIMITED SLOTS
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Switch profiles instantly with <span className="font-mono text-cyan-300">Alt+1..9</span> or cycle using{' '}
            <span className="font-mono text-cyan-300">Alt+[ / Alt+]</span>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New profile name..."
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-cyan-400 w-44"
            />
            <button
              type="button"
              onClick={() => {
                saveCurrentAsProfile(newName || undefined, false);
                setNewName('');
              }}
              className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Save Current
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPack}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" /> Backup JSON
          </button>

          <label className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-cyan-400" /> Import Pack
            <input type="file" accept=".json" className="hidden" onChange={handleImportPack} />
          </label>
        </div>
      </div>

      {/* Optional Per-Game Auto-Switch Banner */}
      <div className="rounded-xl bg-[#0e1422] border border-slate-800/90 p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1">
          <ToggleRow
            label="Opt-In Per-Game Auto-Profile Switcher (Passive Window Title Match)"
            description="Passively checks the active window title (never opens or hooks game processes) and switches to matching profiles automatically."
            checked={settings.autoSwitchPerGame}
            accent="emerald"
            onChange={(v) => setSettings((s) => ({ ...s, autoSwitchPerGame: v }))}
          />
        </div>
        {settings.autoSwitchPerGame && (
          <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 shrink-0 max-w-xs truncate">
            Active Window: <span className="text-emerald-300">{foregroundWindowTitle || 'Monitoring...'}</span>
          </div>
        )}
      </div>

      {/* Saved Profiles List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 pb-4">
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfileId;
          return (
            <div
              key={profile.id}
              className={`rounded-2xl bg-[#0d131f] border p-3.5 flex flex-col xl:flex-row xl:items-center gap-4 transition ${
                isActive
                  ? 'border-cyan-400/65 shadow-[0_0_20px_rgba(0,240,255,0.1)]'
                  : 'border-slate-800/90 hover:border-slate-700'
              }`}
            >
              {/* Miniature Stage */}
              <div className="w-24 h-20 rounded-xl bg-[radial-gradient(circle_at_50%_50%,#1b2334_0%,#090c14_80%)] border border-slate-800 flex items-center justify-center shrink-0">
                <MiniCrosshairCanvas config={profile.config} size={78} zoom={1.25} />
              </div>

              {/* Info & Rules */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">{profile.config.name}</h3>
                  {isActive && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/45 flex items-center gap-1">
                      <Check className="w-3 h-3" /> ACTIVE OVERLAY
                    </span>
                  )}
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    ADS: {profile.config.animation.adsAction.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    Offset ({profile.config.position.offsetX}, {profile.config.position.offsetY})
                  </span>
                </div>

                {/* Quick Slot + Monitor + Game Matchers */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 shrink-0">Quick Slot:</span>
                    <select
                      value={profile.quickSlot === null ? '' : String(profile.quickSlot)}
                      onChange={(e) =>
                        updateProfileMeta(profile.id, {
                          quickSlot: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="flex-1 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-300"
                    >
                      <option value="">None</option>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((slot) => (
                        <option key={slot} value={slot}>
                          Alt + {slot + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <select
                      value={profile.monitorIndex}
                      onChange={(e) =>
                        updateProfileMeta(profile.id, { monitorIndex: Number(e.target.value) })
                      }
                      className="flex-1 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300"
                    >
                      {monitors.map((m) => (
                        <option key={m.index} value={m.index}>
                          Display {m.index + 1} ({m.width}×{m.height})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Gamepad className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <input
                      type="text"
                      value={profile.gameTitleMatchers.join(', ')}
                      onChange={(e) =>
                        updateProfileMeta(profile.id, {
                          gameTitleMatchers: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Game titles: VALORANT, Apex..."
                      className="flex-1 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => selectProfile(profile.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-200'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  }`}
                >
                  {isActive ? 'Loaded' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectProfile(profile.id, true);
                    store.setActiveTab('designer');
                  }}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 cursor-pointer"
                  title="Edit in Precision Designer"
                >
                  <Sliders className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(encodeShareCode(profile.config)).catch(() => {});
                    bumpStat((s) => ({ ...s, codesExported: s.codesExported + 1 }));
                    pushToast('Share Code Copied', profile.config.name, 'cyan');
                  }}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 cursor-pointer"
                  title="Copy CX1 Share Code"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteProfile(profile.id)}
                  disabled={profiles.length <= 1}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 disabled:opacity-30 cursor-pointer"
                  title="Delete Profile"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
