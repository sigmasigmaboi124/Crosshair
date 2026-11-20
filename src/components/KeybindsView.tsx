import React from 'react';
import { Gamepad2, Keyboard, Mouse } from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { SectionCard } from './ui/Controls';

interface KeybindsViewProps {
  store: AppStore;
}

const KEY_OPTIONS: Array<{ vk: number; label: string }> = [
  { vk: 0x58, label: 'X' },
  { vk: 0x43, label: 'C' },
  { vk: 0x56, label: 'V' },
  { vk: 0x5a, label: 'Z' },
  { vk: 0x4b, label: 'K' },
  { vk: 0x4f, label: 'O' },
  { vk: 0x70, label: 'F1' },
  { vk: 0x71, label: 'F2' },
  { vk: 0x72, label: 'F3' },
  { vk: 0x73, label: 'F4' },
  { vk: 0x74, label: 'F5' },
  { vk: 0x75, label: 'F6' },
  { vk: 0x76, label: 'F7' },
  { vk: 0x77, label: 'F8' },
  { vk: 0x78, label: 'F9' },
  { vk: 0x79, label: 'F10' },
  { vk: 0x2d, label: 'Insert' },
  { vk: 0x24, label: 'Home' },
];

const ADS_CUSTOM_KEYS: Array<{ vk: number; label: string }> = [
  { vk: 0, label: 'Disabled' },
  { vk: 0x51, label: 'Q' },
  { vk: 0x45, label: 'E' },
  { vk: 0x46, label: 'F' },
  { vk: 0x56, label: 'V' },
  { vk: 0x10, label: 'Shift' },
  { vk: 0x11, label: 'Ctrl' },
  { vk: 0x12, label: 'Alt' },
];

export const KeybindsView: React.FC<KeybindsViewProps> = ({ store }) => {
  const { settings, setSettings, liveInput } = store;
  const hk = settings.toggleHotkey;

  const updateHotkey = (patch: Partial<typeof hk>) => {
    setSettings((s) => {
      const next = { ...s.toggleHotkey, ...patch };
      const keyName = KEY_OPTIONS.find((k) => k.vk === next.vk)?.label ?? 'X';
      const parts = [
        next.ctrl ? 'Ctrl' : null,
        next.alt ? 'Alt' : null,
        next.shift ? 'Shift' : null,
        keyName,
      ].filter(Boolean);
      return { ...s, toggleHotkey: { ...next, label: parts.join(' + ') } };
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="rounded-2xl bg-[#0d121d] border border-slate-800/90 p-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-cyan-400" />
            <span>Global Hotkeys, Mouse, Keyboard & XInput Controller</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            All inputs are monitored passively via read-only Windows APIs (<span className="font-mono text-emerald-300">GetAsyncKeyState</span> &{' '}
            <span className="font-mono text-emerald-300">XInputGetState</span>) with zero global hooks and 0.0ms added input latency.
          </p>
        </div>
        {settings.strictStaticMode && (
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
            STRICT STATIC MODE ACTIVE (INPUT POLLING OFF)
          </span>
        )}
      </div>

      {/* Global Hotkey Customization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Master Overlay Toggle Shortcut" badge={hk.label}>
          <p className="text-xs text-slate-400">
            Instantly show or hide your crosshair overlay inside any game without Alt-Tabbing.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                ['alt', 'Alt'],
                ['ctrl', 'Ctrl'],
                ['shift', 'Shift'],
              ] as const
            ).map(([mod, lbl]) => (
              <button
                key={mod}
                type="button"
                onClick={() => updateHotkey({ [mod]: !hk[mod] })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  hk[mod]
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {lbl}
              </button>
            ))}

            <select
              value={hk.vk}
              onChange={(e) => updateHotkey({ vk: Number(e.target.value) })}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-300"
            >
              {KEY_OPTIONS.map((k) => (
                <option key={k.vk} value={k.vk}>
                  Key: {k.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3 border-t border-slate-800/80 space-y-1.5">
            <label className="text-[11px] text-slate-400">Optional Custom ADS Keyboard Key (When ADS Trigger = Custom)</label>
            <select
              value={settings.adsCustomKey.vk}
              onChange={(e) => {
                const vk = Number(e.target.value);
                const lbl = ADS_CUSTOM_KEYS.find((k) => k.vk === vk)?.label ?? 'None';
                setSettings((s) => ({ ...s, adsCustomKey: { vk, label: lbl } }));
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
            >
              {ADS_CUSTOM_KEYS.map((k) => (
                <option key={k.vk} value={k.vk}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        <SectionCard title="Built-in In-Game Shortcuts" badge="ALWAYS READY">
          <div className="space-y-2 text-xs">
            {[
              [hk.label, 'Toggle Crosshair Overlay On / Off'],
              ['Alt + Shift + X', 'Show / Hide Studio Designer Window'],
              ['Alt + [  /  Alt + ]', 'Cycle Previous / Next Saved Profile'],
              ['Alt + 1  ..  Alt + 9', 'Instant Load Quick-Slot Profile 1–9'],
              ['Alt + Arrow Keys', 'Nudge Crosshair Offset ±1px Live In-Game'],
            ].map(([keys, desc]) => (
              <div
                key={desc}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/75 border border-slate-800/80"
              >
                <span className="text-slate-300">{desc}</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {keys}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Live Passive Input Telemetry Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Mouse Buttons (Live)" rightSlot={<Mouse className="w-4 h-4 text-cyan-400" />}>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            {[
              ['LMB (Fire)', liveInput.lmb, 'rose'],
              ['RMB (ADS)', liveInput.rmb, 'amber'],
              ['MMB (Wheel)', liveInput.mmb, 'cyan'],
              ['Mouse 4 (X1)', liveInput.x1, 'cyan'],
              ['Mouse 5 (X2)', liveInput.x2, 'cyan'],
            ].map(([lbl, active, col]) => (
              <div
                key={String(lbl)}
                className={`px-3 py-2 rounded-xl border text-center transition ${
                  active
                    ? col === 'rose'
                      ? 'bg-rose-500/25 border-rose-400 text-rose-100'
                      : col === 'amber'
                      ? 'bg-amber-500/25 border-amber-400 text-amber-100'
                      : 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                    : 'bg-slate-950/70 border-slate-800 text-slate-500'
                }`}
              >
                {lbl}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Movement Keys (Live)" rightSlot={<Keyboard className="w-4 h-4 text-cyan-400" />}>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            {[
              ['WASD Move', liveInput.moving],
              ['Shift Sprint', liveInput.sprint],
              ['Ctrl Crouch', liveInput.crouch],
              ['Space Jump', liveInput.jump],
            ].map(([lbl, active]) => (
              <div
                key={String(lbl)}
                className={`px-3 py-2 rounded-xl border text-center transition ${
                  active
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                    : 'bg-slate-950/70 border-slate-800 text-slate-500'
                }`}
              >
                {lbl}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="XInput Controller (Live)"
          badge={liveInput.controller.connected ? 'CONNECTED' : 'STANDBY'}
        >
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between font-mono text-[11px] mb-1">
                <span className="text-slate-400">Left Trigger (LT — ADS)</span>
                <span className="text-amber-300">{Math.round((liveInput.controller.lt / 255) * 100)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-75"
                  style={{ width: `${(liveInput.controller.lt / 255) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-mono text-[11px] mb-1">
                <span className="text-slate-400">Right Trigger (RT — Fire)</span>
                <span className="text-rose-300">{Math.round((liveInput.controller.rt / 255) * 100)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-rose-400 transition-all duration-75"
                  style={{ width: `${(liveInput.controller.rt / 255) * 100}%` }}
                />
              </div>
            </div>

            <div className="text-[11px] text-slate-500">
              {liveInput.controller.connected
                ? 'Xbox / XInput gamepad detected automatically — LT ADS and RT Firing animations are live.'
                : 'Plug in any Xbox / XInput PC controller to enable automatic trigger & stick bloom.'}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
