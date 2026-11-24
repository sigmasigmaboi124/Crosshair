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
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-[#a1a1ad]" />
            <span>Hotkeys & input devices</span>
          </h2>
          <p className="text-xs text-[#8c8c9a] mt-0.5">
            Reads passive Windows input state via <code className="font-mono text-[#d0d0d8]">GetAsyncKeyState</code> and{' '}
            <code className="font-mono text-[#d0d0d8]">XInputGetState</code> with no global hooks.
          </p>
        </div>
        {settings.strictStaticMode && (
          <span className="text-xs font-mono text-amber-300">Static mode active</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Overlay toggle shortcut" subtitle={`Current: ${hk.label}`}>
          <p className="text-xs text-[#9696a4]">
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
                    ? 'bg-[#25252e] border-[#444452] text-white'
                    : 'bg-[#18181e] border-[#23232a] text-[#9696a4]'
                }`}
              >
                {lbl}
              </button>
            ))}

            <select
              value={hk.vk}
              onChange={(e) => updateHotkey({ vk: Number(e.target.value) })}
              className="px-3 py-1.5 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs font-mono text-[#f4f4f6]"
            >
              {KEY_OPTIONS.map((k) => (
                <option key={k.vk} value={k.vk}>
                  Key: {k.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3 border-t border-[#222228] space-y-1.5">
            <label className="text-[11px] text-[#9696a4]">Optional Custom ADS Keyboard Key (When ADS Trigger = Custom)</label>
            <select
              value={settings.adsCustomKey.vk}
              onChange={(e) => {
                const vk = Number(e.target.value);
                const lbl = ADS_CUSTOM_KEYS.find((k) => k.vk === vk)?.label ?? 'None';
                setSettings((s) => ({ ...s, adsCustomKey: { vk, label: lbl } }));
              }}
              className="w-full px-3 py-2 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs font-mono text-[#ececf0]"
            >
              {ADS_CUSTOM_KEYS.map((k) => (
                <option key={k.vk} value={k.vk}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        <SectionCard title="In-game shortcuts">
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
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0e0e11] border border-[#222228]"
              >
                <span className="text-[#d0d0d8]">{desc}</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#1e1e25] text-[#c4c4cf] border border-[#2f2f39]">
                  {keys}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Live Passive Input Telemetry Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Mouse Buttons (Live)" rightSlot={<Mouse className="w-4 h-4 text-[#a1a1ad]" />}>
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
                      : 'bg-white/15 border-white/40 text-white'
                    : 'bg-[#0e0e11] border-[#23232a] text-[#727280]'
                }`}
              >
                {lbl}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Movement Keys (Live)" rightSlot={<Keyboard className="w-4 h-4 text-[#a1a1ad]" />}>
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
                    ? 'bg-white/15 border-white/40 text-white'
                    : 'bg-[#0e0e11] border-[#23232a] text-[#727280]'
                }`}
              >
                {lbl}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Controller (XInput)"
          subtitle={liveInput.controller.connected ? 'Connected' : 'Not detected'}
        >
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between font-mono text-[11px] mb-1">
                <span className="text-[#9696a4]">Left Trigger (LT — ADS)</span>
                <span className="text-amber-300">{Math.round((liveInput.controller.lt / 255) * 100)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-[#0e0e11] border border-[#23232a] overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-75"
                  style={{ width: `${(liveInput.controller.lt / 255) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-mono text-[11px] mb-1">
                <span className="text-[#9696a4]">Right Trigger (RT — Fire)</span>
                <span className="text-rose-300">{Math.round((liveInput.controller.rt / 255) * 100)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-[#0e0e11] border border-[#23232a] overflow-hidden">
                <div
                  className="h-full bg-rose-400 transition-all duration-75"
                  style={{ width: `${(liveInput.controller.rt / 255) * 100}%` }}
                />
              </div>
            </div>

            <div className="text-[11px] text-[#727280]">
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
