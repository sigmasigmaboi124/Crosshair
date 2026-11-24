import React from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Monitor, RotateCcw } from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { SectionCard, SliderRow } from './ui/Controls';

interface MonitorsViewProps {
  store: AppStore;
}

export const MonitorsView: React.FC<MonitorsViewProps> = ({ store }) => {
  const { monitors, settings, setSettings, activeConfig, updateActiveConfig, bumpStat, pushToast } = store;

  // Normalize physical monitor bounds into a visual 2D layout map
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));
  const maxX = Math.max(...monitors.map((m) => m.x + m.width));
  const maxY = Math.max(...monitors.map((m) => m.y + m.height));
  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxY - minY);

  const selectMonitor = (idx: number) => {
    setSettings((s) => ({ ...s, selectedMonitorIndex: idx }));
    bumpStat((s) => ({ ...s, monitorsSwitched: s.monitorsSwitched + 1 }));
    pushToast('Overlay Display Changed', `Moved crosshair to Display ${idx + 1}.`, 'cyan');
  };

  const nudge = (dx: number, dy: number) => {
    updateActiveConfig((c) => ({
      ...c,
      position: {
        ...c.position,
        offsetX: Math.max(-500, Math.min(500, c.position.offsetX + dx)),
        offsetY: Math.max(-500, Math.min(500, c.position.offsetY + dy)),
      },
    }));
    bumpStat((s) => ({ ...s, monitorsSwitched: Math.max(1, s.monitorsSwitched) }));
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#a1a1ad]" />
            <span>Displays & position offset</span>
          </h2>
          <p className="text-xs text-[#8c8c9a] mt-0.5">
            Choose which monitor shows the overlay. Mixed Windows DPI scaling is handled automatically.
          </p>
        </div>
        <span className="text-xs font-mono text-[#8c8c9a] self-start md:self-center">
          {monitors.length} {monitors.length === 1 ? 'display' : 'displays'}
        </span>
      </div>

      <SectionCard title="Display layout" subtitle="Click a monitor to move the overlay">
        <div className="relative h-72 w-full rounded-xl bg-[#0e0e11] border border-[#23232a] overflow-hidden flex items-center justify-center p-5">
          <div
            className="relative"
            style={{
              width: '100%',
              maxWidth: 640,
              aspectRatio: `${totalW} / ${totalH}`,
              maxHeight: 240,
            }}
          >
            {monitors.map((m) => {
              const active = settings.selectedMonitorIndex === m.index;
              const leftPct = ((m.x - minX) / totalW) * 100;
              const topPct = ((m.y - minY) / totalH) * 100;
              const widthPct = (m.width / totalW) * 100;
              const heightPct = (m.height / totalH) * 100;

              return (
                <button
                  key={m.index}
                  type="button"
                  onClick={() => selectMonitor(m.index)}
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                  }}
                  className="absolute p-1 transition cursor-pointer group"
                >
                  <div
                    className={`w-full h-full rounded-xl border-2 flex flex-col items-center justify-center px-1.5 text-center overflow-hidden relative transition-all ${
                      active
                        ? 'bg-[#202028] border-[#ff5526]'
                        : 'bg-[#16161b] border-[#2c2c35] hover:border-[#464654]'
                    }`}
                  >
                    {active && <Crosshair className="w-4 h-4 text-[#ff5526] mb-0.5 shrink-0" />}
                    <div className="text-[11px] font-semibold text-white leading-tight truncate max-w-full">
                      Display {m.index + 1} {m.primary ? '· Primary' : ''}
                    </div>
                    <div className="text-[9px] font-mono text-[#9696a4] leading-tight mt-0.5 truncate max-w-full">
                      {m.width}×{m.height}
                    </div>
                    <div className="text-[9px] font-mono text-[#a1a1ad]/80 leading-tight">
                      {Math.round(m.scaleFactor * 100)}% DPI
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* Precision Pixel Offset & Nudge Pad */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Exact X / Y Center Offset">
          <p className="text-xs text-[#9696a4]">
            Shift the reticle away from absolute screen center for games with offset hipfire or third-person cameras.
          </p>
          <SliderRow
            label="Horizontal Offset (X)"
            value={activeConfig.position.offsetX}
            min={-500}
            max={500}
            step={1}
            unit="px"
            onChange={(v) => updateActiveConfig((c) => ({ ...c, position: { ...c.position, offsetX: v } }))}
          />
          <SliderRow
            label="Vertical Offset (Y)"
            value={activeConfig.position.offsetY}
            min={-500}
            max={500}
            step={1}
            unit="px"
            onChange={(v) => updateActiveConfig((c) => ({ ...c, position: { ...c.position, offsetY: v } }))}
          />
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => updateActiveConfig((c) => ({ ...c, position: { ...c.position, offsetX: 0, offsetY: 0 } }))}
              className="px-3.5 py-2 rounded-xl bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-xs font-semibold text-[#ececf0] flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#a1a1ad]" /> Reset to Exact Center (0, 0)
            </button>
          </div>
        </SectionCard>

        <SectionCard title="1px nudge pad" subtitle="In-game: Alt + Arrow keys">
          <div className="flex items-center justify-around py-3">
            <div className="grid grid-cols-3 gap-2 w-36">
              <div />
              <button
                type="button"
                onClick={() => nudge(0, -1)}
                className="h-10 rounded-xl bg-[#18181e] hover:bg-cyan-500/20 border border-[#2c2c35] hover:border-[#4b4b58] flex items-center justify-center text-[#ececf0] cursor-pointer"
                title="Up 1px"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <div />
              <button
                type="button"
                onClick={() => nudge(-1, 0)}
                className="h-10 rounded-xl bg-[#18181e] hover:bg-cyan-500/20 border border-[#2c2c35] hover:border-[#4b4b58] flex items-center justify-center text-[#ececf0] cursor-pointer"
                title="Left 1px"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => updateActiveConfig((c) => ({ ...c, position: { ...c.position, offsetX: 0, offsetY: 0 } }))}
                className="h-10 rounded-xl bg-cyan-500/15 border border-[#3a3a46] text-[10px] font-mono font-bold text-[#e4e4e8] cursor-pointer"
                title="Reset (0,0)"
              >
                0,0
              </button>
              <button
                type="button"
                onClick={() => nudge(1, 0)}
                className="h-10 rounded-xl bg-[#18181e] hover:bg-cyan-500/20 border border-[#2c2c35] hover:border-[#4b4b58] flex items-center justify-center text-[#ececf0] cursor-pointer"
                title="Right 1px"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <div />
              <button
                type="button"
                onClick={() => nudge(0, 1)}
                className="h-10 rounded-xl bg-[#18181e] hover:bg-cyan-500/20 border border-[#2c2c35] hover:border-[#4b4b58] flex items-center justify-center text-[#ececf0] cursor-pointer"
                title="Down 1px"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <div />
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="px-3 py-2 rounded-xl bg-[#0e0e11] border border-[#23232a]">
                <span className="text-[#727280]">X OFFSET: </span>
                <span className="text-[#f4f4f6] font-bold">{activeConfig.position.offsetX}px</span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-[#0e0e11] border border-[#23232a]">
                <span className="text-[#727280]">Y OFFSET: </span>
                <span className="text-[#f4f4f6] font-bold">{activeConfig.position.offsetY}px</span>
              </div>
              <div className="text-[10px] text-[#727280] max-w-[180px] leading-snug">
                Nudge live while in-game without Alt-Tabbing using Alt + Arrow Keys.
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
