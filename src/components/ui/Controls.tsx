import React from 'react';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
  disabled?: boolean;
}

export const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
}) => {
  const formatted = Number.isInteger(step) ? Math.round(value) : Number(value).toFixed(step < 0.1 ? 2 : 1);
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300 font-medium tracking-wide">{label}</span>
        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-700/60 text-cyan-300 tabular-nums">
          {formatted}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="optics-slider w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
};

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  accent?: 'cyan' | 'emerald' | 'amber' | 'rose';
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  description,
  checked,
  onChange,
  accent = 'cyan',
}) => {
  const bg = {
    cyan: checked ? 'bg-cyan-500' : 'bg-slate-700/80',
    emerald: checked ? 'bg-emerald-500' : 'bg-slate-700/80',
    amber: checked ? 'bg-amber-500' : 'bg-slate-700/80',
    rose: checked ? 'bg-rose-500' : 'bg-slate-700/80',
  }[accent];

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-1.5 px-2.5 rounded-lg bg-slate-900/50 hover:bg-slate-800/60 border border-slate-800/80 transition text-left"
    >
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-200">{label}</div>
        {description && <div className="text-[11px] text-slate-400 leading-tight mt-0.5">{description}</div>}
      </div>
      <div className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${bg}`}>
        <div
          className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
    </button>
  );
};

const QUICK_SWATCHES = [
  '#00f5ff',
  '#00ff66',
  '#ffffff',
  '#ff2e4c',
  '#ffbe0b',
  '#ff00e5',
  '#38bdf8',
  '#fb923c',
  '#a855f7',
  '#000000',
];

interface ColorPickerRowProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

export const ColorPickerRow: React.FC<ColorPickerRowProps> = ({ label, value, onChange, disabled }) => (
  <div className={`space-y-1.5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={value.toUpperCase()}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
          }}
          className="w-20 px-1.5 py-0.5 text-[11px] font-mono rounded bg-slate-950 border border-slate-700/80 text-slate-200 focus:outline-none focus:border-cyan-400"
        />
      </div>
    </div>
    <div className="flex items-center gap-1.5 flex-wrap">
      {QUICK_SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          title={hex}
          className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 ${
            value.toLowerCase() === hex.toLowerCase() ? 'border-white ring-2 ring-cyan-400/50 scale-110' : 'border-slate-700'
          }`}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  </div>
);

interface SectionCardProps {
  title: string;
  badge?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, badge, rightSlot, children }) => (
  <div className="rounded-xl bg-[#0e131e]/90 border border-slate-800/80 p-3.5 space-y-3 shadow-lg shadow-black/20">
    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-4 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.65)]" />
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-200">{title}</h3>
        {badge && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            {badge}
          </span>
        )}
      </div>
      {rightSlot}
    </div>
    {children}
  </div>
);
