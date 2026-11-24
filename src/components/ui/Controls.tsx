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
  const pct = Math.max(0, Math.min(100, ((value - min) / Math.max(0.0001, max - min)) * 100));

  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-35 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#a1a1ad] font-medium">{label}</span>
        <span className="font-mono text-[11px] text-[#e4e4e8] tabular-nums">
          {formatted}
          {unit && <span className="text-[#6f6f7b] ml-0.5">{unit}</span>}
        </span>
      </div>
      <input
        type="range"
        className="studio-slider w-full block"
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
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

interface SwitchPillProps {
  checked: boolean;
  accent?: 'cyan' | 'emerald' | 'amber' | 'rose';
}

const SwitchPill: React.FC<SwitchPillProps> = ({ checked, accent }) => {
  const activeBg =
    accent === 'emerald'
      ? 'bg-emerald-500'
      : accent === 'amber'
      ? 'bg-amber-500'
      : accent === 'rose'
      ? 'bg-rose-500'
      : 'bg-[#f4f4f6]';
  const knobColor = !checked ? 'bg-[#8f8f9b]' : accent ? 'bg-white' : 'bg-[#0c0c0e]';

  return (
    <div
      className={`w-8 h-[18px] rounded-full p-[2px] transition-colors shrink-0 ${
        checked ? activeBg : 'bg-[#27272f]'
      }`}
    >
      <div
        className={`w-[14px] h-[14px] rounded-full transition-transform ${knobColor} ${
          checked ? 'translate-x-[14px]' : 'translate-x-0'
        }`}
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
  accent,
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="w-full flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 rounded-md hover:bg-[#1b1b21] transition-colors text-left cursor-pointer"
  >
    <div className="min-w-0">
      <div className="text-xs font-medium text-[#e4e4e8]">{label}</div>
      {description && <div className="text-[11px] text-[#787886] leading-snug mt-0.5">{description}</div>}
    </div>
    <SwitchPill checked={checked} accent={accent} />
  </button>
);

const QUICK_SWATCHES = [
  '#00ff66',
  '#00f5ff',
  '#ffffff',
  '#ff3b30',
  '#ffcc00',
  '#ff2d95',
  '#3b82f6',
  '#ff6b2c',
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
  <div className={`space-y-2 ${disabled ? 'opacity-35 pointer-events-none' : ''}`}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-[#a1a1ad]">{label}</span>
      <div className="flex items-center gap-1.5">
        <label className="w-5 h-5 rounded border border-white/15 overflow-hidden cursor-pointer relative shrink-0">
          <span className="absolute inset-0" style={{ backgroundColor: value }} />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="opacity-0 w-full h-full cursor-pointer"
          />
        </label>
        <input
          type="text"
          value={value.toUpperCase()}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
          }}
          className="w-[74px] px-2 py-0.5 text-[11px] font-mono rounded-md bg-[#0e0e11] border border-[#27272e] text-[#e4e4e8] focus:outline-none focus:border-[#52525e]"
        />
      </div>
    </div>
    <div className="flex items-center gap-1.5 flex-wrap">
      {QUICK_SWATCHES.map((hex) => {
        const selected = value.toLowerCase() === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            title={hex}
            className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
              selected
                ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141418] scale-105'
                : 'border border-white/15 hover:scale-110'
            }`}
            style={{ backgroundColor: hex }}
          />
        );
      })}
    </div>
  </div>
);

interface SectionCardProps {
  title: string;
  subtitle?: string;
  enabled?: boolean;
  onToggleEnabled?: (next: boolean) => void;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  subtitle,
  enabled,
  onToggleEnabled,
  rightSlot,
  children,
}) => (
  <section className="rounded-lg bg-[#141418] border border-[#222229] p-4 space-y-3.5">
    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#1f1f26]">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-[#f1f1f4] tracking-[-0.01em] truncate">{title}</h3>
        {subtitle && <p className="text-[11px] text-[#787886] mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {rightSlot}
        {typeof enabled === 'boolean' && onToggleEnabled && (
          <button
            type="button"
            onClick={() => onToggleEnabled(!enabled)}
            className="cursor-pointer p-0.5 rounded-full"
            title={enabled ? 'Disable section' : 'Enable section'}
          >
            <SwitchPill checked={enabled} />
          </button>
        )}
      </div>
    </div>
    {children}
  </section>
);
