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
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Saved profiles</h2>
          <p className="text-xs text-[#8c8c9a] mt-0.5">
            Switch profiles with <code className="font-mono text-[#d0d0d8]">Alt+1..9</code> or cycle with{' '}
            <code className="font-mono text-[#d0d0d8]">Alt+[ / Alt+]</code>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New profile name..."
              className="px-3 py-1.5 rounded-xl bg-[#0e0e11] border border-[#2a2a33] text-xs text-white focus:outline-none focus:border-[#525260] w-44"
            />
            <button
              type="button"
              onClick={() => {
                saveCurrentAsProfile(newName || undefined, false);
                setNewName('');
              }}
              className="px-3 py-1.5 rounded-xl bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Save Current
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPack}
            className="px-3 py-1.5 rounded-xl bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-xs font-semibold text-[#ececf0] flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" /> Backup JSON
          </button>

          <label className="px-3 py-1.5 rounded-xl bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-xs font-semibold text-[#ececf0] flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-[#a1a1ad]" /> Import Pack
            <input type="file" accept=".json" className="hidden" onChange={handleImportPack} />
          </label>
        </div>
      </div>

      {/* Optional Per-Game Auto-Switch Banner */}
      <div className="rounded-xl bg-[#141418] border border-[#23232a] p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
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
          <div className="px-3 py-2 rounded-lg bg-[#0e0e11] border border-[#23232a] text-[11px] font-mono text-[#9696a4] shrink-0 max-w-xs truncate">
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
              className={`rounded-lg bg-[#141418] border p-3.5 flex flex-col xl:flex-row xl:items-center gap-4 transition ${
                isActive
                  ? 'border-white/35'
                  : 'border-[#23232a] hover:border-[#2c2c35]'
              }`}
            >
              {/* Miniature Stage */}
              <div className="w-24 h-20 rounded-xl bg-[#101014] border border-[#23232a] flex items-center justify-center shrink-0">
                <MiniCrosshairCanvas config={profile.config} size={78} zoom={1.25} />
              </div>

              {/* Info & Rules */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">{profile.config.name}</h3>
                  {isActive && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#25252e] text-white border border-[#3e3e4b] flex items-center gap-1">
                      <Check className="w-3 h-3" /> ACTIVE OVERLAY
                    </span>
                  )}
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#18181e] border border-[#23232a] text-[#9696a4]">
                    ADS: {profile.config.animation.adsAction.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#18181e] border border-[#23232a] text-[#9696a4]">
                    Offset ({profile.config.position.offsetX}, {profile.config.position.offsetY})
                  </span>
                </div>

                {/* Quick Slot + Monitor + Game Matchers */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#9696a4] shrink-0">Quick Slot:</span>
                    <select
                      value={profile.quickSlot === null ? '' : String(profile.quickSlot)}
                      onChange={(e) =>
                        updateProfileMeta(profile.id, {
                          quickSlot: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="flex-1 px-2 py-1 rounded-lg bg-[#0e0e11] border border-[#23232a] text-[11px] font-mono text-[#f4f4f6]"
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
                    <Monitor className="w-3.5 h-3.5 text-[#727280] shrink-0" />
                    <select
                      value={profile.monitorIndex}
                      onChange={(e) =>
                        updateProfileMeta(profile.id, { monitorIndex: Number(e.target.value) })
                      }
                      className="flex-1 px-2 py-1 rounded-lg bg-[#0e0e11] border border-[#23232a] text-[11px] text-[#d0d0d8]"
                    >
                      {monitors.map((m) => (
                        <option key={m.index} value={m.index}>
                          Display {m.index + 1} ({m.width}×{m.height})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Gamepad className="w-3.5 h-3.5 text-[#727280] shrink-0" />
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
                      className="flex-1 px-2 py-1 rounded-lg bg-[#0e0e11] border border-[#23232a] text-[11px] text-[#ececf0] placeholder:text-slate-600 focus:outline-none focus:border-[#525260]"
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
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
                      : 'bg-[#f4f4f6] hover:bg-white text-[#0c0c0e]'
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
                  className="p-2 rounded-xl bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[#d0d0d8] hover:text-white cursor-pointer"
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
                  className="p-2 rounded-xl bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[#d0d0d8] hover:text-white cursor-pointer"
                  title="Copy CX1 Share Code"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteProfile(profile.id)}
                  disabled={profiles.length <= 1}
                  className="p-2 rounded-xl bg-[#18181e] hover:bg-rose-500/20 border border-[#2c2c35] hover:border-rose-500/40 text-[#9696a4] hover:text-rose-300 disabled:opacity-30 cursor-pointer"
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
