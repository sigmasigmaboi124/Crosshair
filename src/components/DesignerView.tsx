import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
  Image as ImageIcon,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { CrosshairPreview } from './CrosshairPreview';
import { PixelDrawEditor } from './PixelDrawEditor';
import { ColorPickerRow, SectionCard, SliderRow, ToggleRow } from './ui/Controls';
import {
  AdsAction,
  AdsTrigger,
  DotShape,
  FireAnimType,
  IdleAnimType,
  RingStyle,
  createDefaultCrosshair,
} from '../types/crosshair';
import {
  decodeAnyShareCode,
  encodeShareCode,
  exportCrosshairPNGFile,
  exportCrosshairSVGFile,
} from '../engine/shareCodec';
import { useT } from '../data/i18n';

type DesignerSubTab = 'geometry' | 'dot-shapes' | 'outline-image' | 'pixel-draw' | 'dynamics' | 'position-share';

interface DesignerViewProps {
  store: AppStore;
}

export const DesignerView: React.FC<DesignerViewProps> = ({ store }) => {
  const {
    activeConfig,
    updateActiveConfig,
    setActiveConfig,
    activeProfileId,
    profiles,
    saveCurrentAsProfile,
    liveInput,
    settings,
    pushToast,
    bumpStat,
  } = store;

  const t = useT(settings.language);
  const [subTab, setSubTab] = useState<DesignerSubTab>('geometry');
  const [copiedCode, setCopiedCode] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);

  const secondaryAdsConfig = activeConfig.animation.adsSecondaryProfileId
    ? profiles.find((p) => p.id === activeConfig.animation.adsSecondaryProfileId)?.config ?? null
    : null;

  const handleCopyShareCode = () => {
    const code = encodeShareCode(activeConfig);
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(true);
    bumpStat((s) => ({ ...s, codesExported: s.codesExported + 1 }));
    pushToast('Share Code Copied', 'Paste CX1 code anywhere or share with teammates.', 'cyan');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleImportCode = () => {
    try {
      const decoded = decodeAnyShareCode(importInput);
      setActiveConfig(decoded);
      setImportInput('');
      setShowImportBox(false);
      pushToast('Crosshair Imported', decoded.name, 'emerald');
    } catch (err) {
      pushToast('Import Failed', err instanceof Error ? err.message : 'Invalid code format.', 'rose');
    }
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateActiveConfig((c) => ({
          ...c,
          image: {
            ...c.image,
            enabled: true,
            dataUrl: reader.result as string,
            fileName: file.name,
          },
        }));
        pushToast('Custom Image Loaded', `${file.name} active on overlay.`, 'emerald');
      }
    };
    reader.readAsDataURL(file);
  };

  const subTabs: Array<{ id: DesignerSubTab; label: string }> = [
    { id: 'geometry', label: 'Lines' },
    { id: 'dot-shapes', label: 'Dot & Shapes' },
    { id: 'outline-image', label: 'Outline & Img' },
    { id: 'pixel-draw', label: 'Pixel Draw' },
    { id: 'dynamics', label: 'Dynamics & ADS' },
    { id: 'position-share', label: 'Offset & Export' },
  ];

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
      {/* LEFT COLUMN: Live Interactive Optics Viewport + Quick Action Bar */}
      <div className="lg:w-[440px] xl:w-[490px] shrink-0 flex flex-col gap-3 overflow-y-auto pr-0.5">
        {/* Editable Crosshair Name */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={activeConfig.name}
            onChange={(e) => updateActiveConfig((c) => ({ ...c, name: e.target.value }))}
            className="flex-1 px-3 py-2 rounded-xl bg-[#0e1422] border border-slate-800 focus:border-cyan-400/70 focus:outline-none text-sm font-bold text-white tracking-wide"
            placeholder="Crosshair name..."
          />
          <button
            type="button"
            onClick={() => saveCurrentAsProfile(undefined, !!activeProfileId)}
            className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-[0_0_16px_rgba(0,240,255,0.28)] transition cursor-pointer shrink-0"
            title={activeProfileId ? 'Update Active Profile' : 'Save New Profile'}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{activeProfileId ? 'Update' : t.saveProfile}</span>
          </button>
          {activeProfileId && (
            <button
              type="button"
              onClick={() => saveCurrentAsProfile(`${activeConfig.name} Copy`, false)}
              className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-semibold text-xs transition cursor-pointer shrink-0"
              title="Save as a brand-new profile copy"
            >
              + New
            </button>
          )}
        </div>

        {/* Live Optical Viewport */}
        <CrosshairPreview
          config={activeConfig}
          secondaryAdsConfig={secondaryAdsConfig}
          liveInput={liveInput}
          onAdsTestTrigger={() => bumpStat((s) => ({ ...s, adsToggledCount: s.adsToggledCount + 1 }))}
        />

        {/* Quick Share / Import / Export Dock */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={handleCopyShareCode}
            className="py-2 px-2.5 rounded-xl bg-[#0e1422] hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-400/40 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{copiedCode ? 'Copied!' : 'Share Code'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowImportBox((v) => !v)}
            className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              showImportBox
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                : 'bg-[#0e1422] hover:bg-slate-800/80 border-slate-800 text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Import Code</span>
          </button>
          <button
            type="button"
            onClick={() => {
              exportCrosshairPNGFile(activeConfig, 2);
              bumpStat((s) => ({ ...s, imagesExported: s.imagesExported + 1 }));
              pushToast('PNG Exported', `${activeConfig.name}.png downloaded.`, 'emerald');
            }}
            className="py-2 px-2.5 rounded-xl bg-[#0e1422] hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-400/40 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>PNG</span>
          </button>
          <button
            type="button"
            onClick={() => {
              exportCrosshairSVGFile(activeConfig);
              bumpStat((s) => ({ ...s, imagesExported: s.imagesExported + 1 }));
              pushToast('SVG Exported', `${activeConfig.name}.svg downloaded.`, 'emerald');
            }}
            className="py-2 px-2.5 rounded-xl bg-[#0e1422] hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-400/40 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>SVG</span>
          </button>
        </div>

        {/* Inline Share / Valorant Code Importer */}
        {showImportBox && (
          <div className="rounded-xl bg-[#0e1422] border border-cyan-500/35 p-3 space-y-2">
            <div className="text-[11px] font-semibold text-cyan-300 flex items-center justify-between">
              <span>Import CX1 Share Code or Valorant Profile Code (0;P;...)</span>
              <button
                type="button"
                onClick={() => setImportInput('0;P;c;5;h;0;f;0;0l;4;0o;2;0a;1;0f;0;1b;0')}
                className="text-[10px] font-mono text-slate-400 hover:text-cyan-300 underline cursor-pointer"
              >
                Try Sample Valorant Code
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                placeholder="Paste CX1-... or 0;P;..."
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={handleImportCode}
                className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Quick Style Shortcuts */}
        <div className="rounded-xl bg-[#0d121d] border border-slate-800/80 p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase text-slate-500 mr-1">Quick Morph:</span>
            <button
              type="button"
              onClick={() =>
                updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, enabled: true, tShape: !c.lines.tShape } }))
              }
              className={`px-2 py-1 rounded text-[11px] font-semibold border transition cursor-pointer ${
                activeConfig.lines.tShape
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              T-Shape
            </button>
            <button
              type="button"
              onClick={() =>
                updateActiveConfig((c) => ({
                  ...c,
                  lines: { ...c.lines, enabled: true, rotation: c.lines.rotation === 45 ? 0 : 45 },
                }))
              }
              className={`px-2 py-1 rounded text-[11px] font-semibold border transition cursor-pointer ${
                activeConfig.lines.rotation === 45
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              X-Rotate 45°
            </button>
            <button
              type="button"
              onClick={() =>
                updateActiveConfig((c) => ({
                  ...c,
                  lines: { ...c.lines, enabled: false },
                  ring: { ...c.ring, enabled: false },
                  dot: { ...c.dot, enabled: true, size: 3 },
                }))
              }
              className="px-2 py-1 rounded text-[11px] font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-600 transition cursor-pointer"
            >
              Dot Only
            </button>
          </div>
          <button
            type="button"
            onClick={() => setActiveConfig(createDefaultCrosshair())}
            className="text-[11px] text-slate-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Reset Default
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Precision Controls Inspector */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Sub-tab Strip */}
        <div className="grid grid-cols-6 gap-1 bg-[#0a0f19] border border-slate-800/90 rounded-xl p-1 mb-3 shrink-0">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold text-center truncate transition cursor-pointer ${
                subTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Controls Pane */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
          {/* TAB 1: LINES & ARMS */}
          {subTab === 'geometry' && (
            <>
              <SectionCard
                title="Primary Crosshair Lines"
                badge={activeConfig.lines.enabled ? 'ACTIVE' : 'OFF'}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, enabled: !c.lines.enabled } }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                      activeConfig.lines.enabled
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {activeConfig.lines.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <SliderRow
                    label={activeConfig.lines.splitAxes ? 'Horizontal Length' : 'Line Length'}
                    value={activeConfig.lines.length}
                    min={1}
                    max={40}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.lines.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, length: v } }))}
                  />
                  <SliderRow
                    label="Line Thickness"
                    value={activeConfig.lines.thickness}
                    min={1}
                    max={14}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.lines.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, thickness: v } }))}
                  />
                  <SliderRow
                    label={activeConfig.lines.splitAxes ? 'Horizontal Gap' : 'Center Gap (Offset)'}
                    value={activeConfig.lines.gap}
                    min={0}
                    max={36}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.lines.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, gap: v } }))}
                  />
                  <SliderRow
                    label="Rotation Angle"
                    value={activeConfig.lines.rotation}
                    min={0}
                    max={360}
                    step={1}
                    unit="°"
                    disabled={!activeConfig.lines.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, rotation: v } }))}
                  />
                  {activeConfig.lines.splitAxes && (
                    <>
                      <SliderRow
                        label="Vertical Length"
                        value={activeConfig.lines.lengthVertical}
                        min={1}
                        max={40}
                        step={0.5}
                        unit="px"
                        disabled={!activeConfig.lines.enabled}
                        onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, lengthVertical: v } }))}
                      />
                      <SliderRow
                        label="Vertical Gap"
                        value={activeConfig.lines.gapVertical}
                        min={0}
                        max={36}
                        step={0.5}
                        unit="px"
                        disabled={!activeConfig.lines.enabled}
                        onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, gapVertical: v } }))}
                      />
                    </>
                  )}
                  <SliderRow
                    label="Line Opacity"
                    value={Math.round(activeConfig.lines.opacity * 100)}
                    min={5}
                    max={100}
                    step={1}
                    unit="%"
                    disabled={!activeConfig.lines.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, opacity: v / 100 } }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                  <ToggleRow
                    label="T-Shape Mode"
                    description="Removes top arm for clear headshots"
                    checked={activeConfig.lines.tShape}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, tShape: v } }))}
                  />
                  <ToggleRow
                    label="Split H / V Axes"
                    description="Independent horizontal & vertical dims"
                    checked={activeConfig.lines.splitAxes}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, splitAxes: v } }))}
                  />
                  <ToggleRow
                    label="Rounded Caps"
                    description="Smooth pill-shaped arm ends"
                    checked={activeConfig.lines.roundedCaps}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, roundedCaps: v } }))}
                  />
                </div>

                {/* Individual arm toggles */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Individual Arms:</span>
                  {(
                    [
                      ['showTop', 'Top'],
                      ['showBottom', 'Bottom'],
                      ['showLeft', 'Left'],
                      ['showRight', 'Right'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, [key]: !c.lines[key] } }))
                      }
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
                        activeConfig.lines[key]
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <ColorPickerRow
                  label="Primary Line Color"
                  value={activeConfig.lines.color}
                  disabled={!activeConfig.lines.enabled}
                  onChange={(hex) => updateActiveConfig((c) => ({ ...c, lines: { ...c.lines, color: hex } }))}
                />
              </SectionCard>

              <SectionCard
                title="Secondary Outer Lines (Dynamic Stage)"
                badge={activeConfig.outerLines.enabled ? 'ON' : 'OFF'}
                rightSlot={
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveConfig((c) => ({ ...c, outerLines: { ...c.outerLines, enabled: !c.outerLines.enabled } }))
                    }
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                      activeConfig.outerLines.enabled
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {activeConfig.outerLines.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <SliderRow
                    label="Outer Length"
                    value={activeConfig.outerLines.length}
                    min={1}
                    max={30}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.outerLines.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, outerLines: { ...c.outerLines, length: v } }))}
                  />
                  <SliderRow
                    label="Outer Thickness"
                    value={activeConfig.outerLines.thickness}
                    min={1}
                    max={10}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.outerLines.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, outerLines: { ...c.outerLines, thickness: v } }))}
                  />
                  <SliderRow
                    label="Outer Gap"
                    value={activeConfig.outerLines.gap}
                    min={2}
                    max={48}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.outerLines.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, outerLines: { ...c.outerLines, gap: v } }))}
                  />
                  <SliderRow
                    label="Outer Opacity"
                    value={Math.round(activeConfig.outerLines.opacity * 100)}
                    min={5}
                    max={100}
                    step={1}
                    unit="%"
                    disabled={!activeConfig.outerLines.enabled}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, outerLines: { ...c.outerLines, opacity: v / 100 } }))
                    }
                  />
                  <SliderRow
                    label="Bloom Multiplier"
                    value={activeConfig.outerLines.bloomMultiplier}
                    min={0.5}
                    max={4}
                    step={0.1}
                    unit="x"
                    disabled={!activeConfig.outerLines.enabled}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, outerLines: { ...c.outerLines, bloomMultiplier: v } }))
                    }
                  />
                  <ToggleRow
                    label="Match Primary Color"
                    checked={activeConfig.outerLines.usePrimaryColor}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, outerLines: { ...c.outerLines, usePrimaryColor: v } }))
                    }
                  />
                </div>
                {!activeConfig.outerLines.usePrimaryColor && activeConfig.outerLines.enabled && (
                  <ColorPickerRow
                    label="Outer Line Color"
                    value={activeConfig.outerLines.color}
                    onChange={(hex) => updateActiveConfig((c) => ({ ...c, outerLines: { ...c.outerLines, color: hex } }))}
                  />
                )}
              </SectionCard>
            </>
          )}

          {/* TAB 2: CENTER DOT & RING/SHAPES */}
          {subTab === 'dot-shapes' && (
            <>
              <SectionCard
                title="Center Dot"
                badge={activeConfig.dot.enabled ? activeConfig.dot.shape.toUpperCase() : 'OFF'}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => updateActiveConfig((c) => ({ ...c, dot: { ...c.dot, enabled: !c.dot.enabled } }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                      activeConfig.dot.enabled
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {activeConfig.dot.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                }
              >
                <div className="grid grid-cols-4 gap-2">
                  {(['circle', 'square', 'diamond', 'plus'] as DotShape[]).map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => updateActiveConfig((c) => ({ ...c, dot: { ...c.dot, shape, enabled: true } }))}
                      className={`py-2 rounded-lg text-xs font-semibold capitalize border transition cursor-pointer ${
                        activeConfig.dot.shape === shape && activeConfig.dot.enabled
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {shape}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <SliderRow
                    label="Dot Size"
                    value={activeConfig.dot.size}
                    min={1}
                    max={18}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.dot.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, dot: { ...c.dot, size: v } }))}
                  />
                  <SliderRow
                    label="Dot Opacity"
                    value={Math.round(activeConfig.dot.opacity * 100)}
                    min={5}
                    max={100}
                    step={1}
                    unit="%"
                    disabled={!activeConfig.dot.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, dot: { ...c.dot, opacity: v / 100 } }))}
                  />
                  <ToggleRow
                    label="Dot Outline"
                    checked={activeConfig.dot.outline}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, dot: { ...c.dot, outline: v } }))}
                  />
                  <SliderRow
                    label="Dot Outline Thickness"
                    value={activeConfig.dot.outlineThickness}
                    min={0.5}
                    max={4}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.dot.enabled || !activeConfig.dot.outline}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, dot: { ...c.dot, outlineThickness: v } }))}
                  />
                </div>

                <ToggleRow
                  label="Match Primary Line Color"
                  checked={activeConfig.dot.usePrimaryColor}
                  onChange={(v) => updateActiveConfig((c) => ({ ...c, dot: { ...c.dot, usePrimaryColor: v } }))}
                />

                {!activeConfig.dot.usePrimaryColor && activeConfig.dot.enabled && (
                  <ColorPickerRow
                    label="Center Dot Color"
                    value={activeConfig.dot.color}
                    onChange={(hex) => updateActiveConfig((c) => ({ ...c, dot: { ...c.dot, color: hex } }))}
                  />
                )}
              </SectionCard>

              <SectionCard
                title="Tactical Rings, Brackets, Arcs & Chevrons"
                badge={activeConfig.ring.enabled ? activeConfig.ring.style.toUpperCase() : 'OFF'}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, enabled: !c.ring.enabled } }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                      activeConfig.ring.enabled
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {activeConfig.ring.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                }
              >
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(
                    [
                      ['solid', 'Circle'],
                      ['dashed', 'Dashed'],
                      ['arcs', 'Arcs'],
                      ['brackets', 'Brackets'],
                      ['chevron', 'Chevron'],
                      ['scope', 'Mil-Scope'],
                    ] as Array<[RingStyle, string]>
                  ).map(([style, label]) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, style, enabled: true } }))}
                      className={`py-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                        activeConfig.ring.style === style && activeConfig.ring.enabled
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <SliderRow
                    label="Shape Radius"
                    value={activeConfig.ring.radius}
                    min={4}
                    max={55}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.ring.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, radius: v } }))}
                  />
                  <SliderRow
                    label="Stroke Thickness"
                    value={activeConfig.ring.thickness}
                    min={0.5}
                    max={8}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.ring.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, thickness: v } }))}
                  />
                  <SliderRow
                    label="Segment / Arc Gap"
                    value={activeConfig.ring.dashGapDeg}
                    min={5}
                    max={75}
                    step={1}
                    unit="°"
                    disabled={!activeConfig.ring.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, dashGapDeg: v } }))}
                  />
                  <SliderRow
                    label="Shape Rotation"
                    value={activeConfig.ring.rotation}
                    min={0}
                    max={360}
                    step={1}
                    unit="°"
                    disabled={!activeConfig.ring.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, rotation: v } }))}
                  />
                  <SliderRow
                    label="Shape Opacity"
                    value={Math.round(activeConfig.ring.opacity * 100)}
                    min={5}
                    max={100}
                    step={1}
                    unit="%"
                    disabled={!activeConfig.ring.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, opacity: v / 100 } }))}
                  />
                  <ToggleRow
                    label="Match Primary Color"
                    checked={activeConfig.ring.usePrimaryColor}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, usePrimaryColor: v } }))}
                  />
                </div>

                {!activeConfig.ring.usePrimaryColor && activeConfig.ring.enabled && (
                  <ColorPickerRow
                    label="Shape Color"
                    value={activeConfig.ring.color}
                    onChange={(hex) => updateActiveConfig((c) => ({ ...c, ring: { ...c.ring, color: hex } }))}
                  />
                )}
              </SectionCard>
            </>
          )}

          {/* TAB 3: OUTLINE, GLOW & CUSTOM IMAGE UPLOAD */}
          {subTab === 'outline-image' && (
            <>
              <SectionCard title="Contrast Outline & Optical Glow">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <ToggleRow
                    label="Crisp Vector Outline"
                    description="High-contrast rim for bright skies & snow maps"
                    checked={activeConfig.outline.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, outline: { ...c.outline, enabled: v } }))}
                  />
                  <SliderRow
                    label="Outline Thickness"
                    value={activeConfig.outline.thickness}
                    min={0.5}
                    max={5}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.outline.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, outline: { ...c.outline, thickness: v } }))}
                  />
                  <SliderRow
                    label="Outline Opacity"
                    value={Math.round(activeConfig.outline.opacity * 100)}
                    min={10}
                    max={100}
                    step={1}
                    unit="%"
                    disabled={!activeConfig.outline.enabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, outline: { ...c.outline, opacity: v / 100 } }))}
                  />
                  <ToggleRow
                    label="Neon / Laser Outer Glow"
                    description="Adds luminous bloom around reticle"
                    checked={activeConfig.outline.glowEnabled}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, outline: { ...c.outline, glowEnabled: v } }))}
                  />
                </div>

                {activeConfig.outline.enabled && (
                  <ColorPickerRow
                    label="Outline Color"
                    value={activeConfig.outline.color}
                    onChange={(hex) => updateActiveConfig((c) => ({ ...c, outline: { ...c.outline, color: hex } }))}
                  />
                )}

                {activeConfig.outline.glowEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t border-slate-800/80">
                    <SliderRow
                      label="Glow Blur Radius"
                      value={activeConfig.outline.glowBlur}
                      min={1}
                      max={22}
                      step={1}
                      unit="px"
                      onChange={(v) => updateActiveConfig((c) => ({ ...c, outline: { ...c.outline, glowBlur: v } }))}
                    />
                    <ColorPickerRow
                      label="Glow Color"
                      value={activeConfig.outline.glowColor}
                      onChange={(hex) => updateActiveConfig((c) => ({ ...c, outline: { ...c.outline, glowColor: hex } }))}
                    />
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Custom Image / Animated Sprite Upload"
                badge="PNG / SVG / WEBP / GIF"
              >
                <p className="text-xs text-slate-400">
                  Upload any transparent PNG, SVG, WebP, or GIF image to render directly on your overlay. You can use it standalone or blended underneath your vector layers.
                </p>

                <div className="flex items-center gap-3 flex-wrap">
                  <label className="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/45 text-cyan-200 text-xs font-bold flex items-center gap-2 cursor-pointer transition">
                    <Upload className="w-4 h-4" />
                    <span>{activeConfig.image.fileName ? `Replace (${activeConfig.image.fileName})` : 'Upload Custom Image'}</span>
                    <input type="file" accept="image/png,image/svg+xml,image/webp,image/gif" className="hidden" onChange={handleCustomImageUpload} />
                  </label>

                  {activeConfig.image.dataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveConfig((c) => ({
                          ...c,
                          image: { ...c.image, enabled: false, dataUrl: null, fileName: null },
                        }))
                      }
                      className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove Image
                    </button>
                  )}
                </div>

                {activeConfig.image.dataUrl && (
                  <div className="space-y-3 pt-2 border-t border-slate-800/80">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ToggleRow
                        label="Show Uploaded Image"
                        checked={activeConfig.image.enabled}
                        onChange={(v) => updateActiveConfig((c) => ({ ...c, image: { ...c.image, enabled: v } }))}
                      />
                      <ToggleRow
                        label="Hide Vector Layers"
                        description="Show image only (disable to combine both)"
                        checked={activeConfig.image.hideVectorLayers}
                        onChange={(v) =>
                          updateActiveConfig((c) => ({ ...c, image: { ...c.image, hideVectorLayers: v } }))
                        }
                      />
                      <SliderRow
                        label="Image Scale"
                        value={activeConfig.image.scale}
                        min={0.2}
                        max={3.5}
                        step={0.05}
                        unit="x"
                        onChange={(v) => updateActiveConfig((c) => ({ ...c, image: { ...c.image, scale: v } }))}
                      />
                      <SliderRow
                        label="Image Opacity"
                        value={Math.round(activeConfig.image.opacity * 100)}
                        min={10}
                        max={100}
                        step={1}
                        unit="%"
                        onChange={(v) => updateActiveConfig((c) => ({ ...c, image: { ...c.image, opacity: v / 100 } }))}
                      />
                      <SliderRow
                        label="Image Rotation"
                        value={activeConfig.image.rotation}
                        min={0}
                        max={360}
                        step={1}
                        unit="°"
                        onChange={(v) => updateActiveConfig((c) => ({ ...c, image: { ...c.image, rotation: v } }))}
                      />
                    </div>
                  </div>
                )}
              </SectionCard>
            </>
          )}

          {/* TAB 3B: PIXEL-ART & FREEHAND DRAW STUDIO */}
          {subTab === 'pixel-draw' && (
            <PixelDrawEditor config={activeConfig} onUpdateConfig={updateActiveConfig} />
          )}

          {/* TAB 4: DYNAMIC ANIMATIONS, BLOOM, MOVEMENT & SMART ADS */}
          {subTab === 'dynamics' && (
            <>
              <SectionCard
                title="Firing Reaction (LMB / Controller RT)"
                badge={activeConfig.animation.firingEnabled ? activeConfig.animation.firingType.toUpperCase() : 'STATIC'}
              >
                <ToggleRow
                  label="Enable Reactive Firing Animation"
                  description="Reacts in real-time to mouse clicks & controller triggers via passive OS input"
                  checked={activeConfig.animation.firingEnabled}
                  onChange={(v) =>
                    updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, firingEnabled: v } }))
                  }
                />

                <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
                  {(
                    [
                      ['none', 'None'],
                      ['bloom', 'Bloom'],
                      ['recoil', 'Recoil'],
                      ['pulse', 'Pulse'],
                      ['spin', 'Spin'],
                      ['flash', 'Color Flash'],
                      ['hitmarker', 'Hitmarker'],
                    ] as Array<[FireAnimType, string]>
                  ).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        updateActiveConfig((c) => ({
                          ...c,
                          animation: { ...c.animation, firingType: type, firingEnabled: type !== 'none' },
                        }))
                      }
                      className={`py-2 px-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                        activeConfig.animation.firingType === type && activeConfig.animation.firingEnabled
                          ? 'bg-rose-500/20 border-rose-400/55 text-rose-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <SliderRow
                    label="Bloom / Intensity"
                    value={activeConfig.animation.bloomAmount}
                    min={1}
                    max={28}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.animation.firingEnabled}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, bloomAmount: v } }))
                    }
                  />
                  <SliderRow
                    label="Expansion Speed"
                    value={activeConfig.animation.bloomSpeed}
                    min={2}
                    max={35}
                    step={1}
                    disabled={!activeConfig.animation.firingEnabled}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, bloomSpeed: v } }))
                    }
                  />
                  <SliderRow
                    label="Recovery Speed"
                    value={activeConfig.animation.recoverySpeed}
                    min={2}
                    max={35}
                    step={1}
                    disabled={!activeConfig.animation.firingEnabled}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, recoverySpeed: v } }))
                    }
                  />
                  {activeConfig.animation.firingType === 'recoil' && (
                    <SliderRow
                      label="Recoil Vertical Kick"
                      value={activeConfig.animation.recoilKickPx}
                      min={1}
                      max={22}
                      step={0.5}
                      unit="px"
                      onChange={(v) =>
                        updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, recoilKickPx: v } }))
                      }
                    />
                  )}
                  {activeConfig.animation.firingType === 'hitmarker' && (
                    <SliderRow
                      label="Hitmarker Burst Size"
                      value={activeConfig.animation.hitmarkerSize}
                      min={6}
                      max={26}
                      step={1}
                      unit="px"
                      onChange={(v) =>
                        updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, hitmarkerSize: v } }))
                      }
                    />
                  )}
                </div>

                {(activeConfig.animation.firingType === 'flash' ||
                  activeConfig.animation.firingType === 'hitmarker') && (
                  <ColorPickerRow
                    label="Fire Flash / Hitmarker Color"
                    value={activeConfig.animation.fireColor}
                    onChange={(hex) =>
                      updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, fireColor: hex } }))
                    }
                  />
                )}
              </SectionCard>

              <SectionCard
                title="Smart ADS / Right-Click Behavior"
                badge={activeConfig.animation.adsAction.toUpperCase()}
              >
                <div className="grid grid-cols-5 gap-1.5">
                  {(
                    [
                      ['none', 'Keep Static'],
                      ['hide', 'Hide'],
                      ['dim', 'Dim'],
                      ['shrink', 'Tighten'],
                      ['switch', 'Swap Profile'],
                    ] as Array<[AdsAction, string]>
                  ).map(([act, label]) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => {
                        updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, adsAction: act } }));
                        bumpStat((s) => ({ ...s, adsToggledCount: s.adsToggledCount + 1 }));
                      }}
                      className={`py-2 px-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                        activeConfig.animation.adsAction === act
                          ? 'bg-amber-500/20 border-amber-400/55 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">ADS Trigger Input</label>
                    <select
                      value={activeConfig.animation.adsTrigger}
                      onChange={(e) =>
                        updateActiveConfig((c) => ({
                          ...c,
                          animation: { ...c.animation, adsTrigger: e.target.value as AdsTrigger },
                        }))
                      }
                      className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="rmb_or_lt">Right-Click OR Controller Left Trigger (Recommended)</option>
                      <option value="rmb">Mouse Right-Click Only (RMB)</option>
                      <option value="lt">Controller Left Trigger Only (LT)</option>
                      <option value="mmb">Middle Mouse Button (MMB)</option>
                      <option value="x1">Mouse Side Button 4 (X1)</option>
                      <option value="x2">Mouse Side Button 5 (X2)</option>
                      <option value="custom">Custom Keyboard Key (Configure in Inputs Tab)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">Trigger Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['hold', 'toggle'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, adsMode: m } }))
                          }
                          className={`py-2 rounded-lg text-xs font-semibold capitalize border cursor-pointer ${
                            activeConfig.animation.adsMode === m
                              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          {m} ADS
                        </button>
                      ))}
                    </div>
                  </div>

                  <SliderRow
                    label="Transition Fade Speed"
                    value={activeConfig.animation.adsFadeMs}
                    min={15}
                    max={300}
                    step={5}
                    unit="ms"
                    disabled={activeConfig.animation.adsAction === 'none'}
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, adsFadeMs: v } }))}
                  />

                  {activeConfig.animation.adsAction === 'dim' && (
                    <SliderRow
                      label="ADS Dimmed Opacity"
                      value={Math.round(activeConfig.animation.adsDimOpacity * 100)}
                      min={5}
                      max={80}
                      step={1}
                      unit="%"
                      onChange={(v) =>
                        updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, adsDimOpacity: v / 100 } }))
                      }
                    />
                  )}

                  {activeConfig.animation.adsAction === 'shrink' && (
                    <SliderRow
                      label="ADS Gap Tighten"
                      value={activeConfig.animation.adsShrinkGapPx}
                      min={1}
                      max={16}
                      step={0.5}
                      unit="px"
                      onChange={(v) =>
                        updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, adsShrinkGapPx: v } }))
                      }
                    />
                  )}

                  {activeConfig.animation.adsAction === 'switch' && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Secondary ADS Profile</label>
                      <select
                        value={activeConfig.animation.adsSecondaryProfileId ?? ''}
                        onChange={(e) =>
                          updateActiveConfig((c) => ({
                            ...c,
                            animation: { ...c.animation, adsSecondaryProfileId: e.target.value || null },
                          }))
                        }
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs text-slate-200"
                      >
                        <option value="">-- Choose a Saved Profile --</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.config.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Movement Spread & Continuous Idle Effects" badge="EZ REACTIVE">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <ToggleRow
                    label="WASD / Left-Stick Movement Bloom"
                    description="Expands when moving/sprinting, tightens when crouching (Ctrl)"
                    checked={activeConfig.animation.movementBloomEnabled}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, movementBloomEnabled: v } }))
                    }
                  />
                  <SliderRow
                    label="Movement Spread"
                    value={activeConfig.animation.movementSpreadPx}
                    min={1}
                    max={20}
                    step={0.5}
                    unit="px"
                    disabled={!activeConfig.animation.movementBloomEnabled}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, movementSpreadPx: v } }))
                    }
                  />
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Continuous Idle Animation</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(
                      [
                        ['none', 'None'],
                        ['breathe', 'Breathe'],
                        ['spin', 'Spin'],
                        ['rainbow', 'RGB Chroma'],
                        ['radar', 'Radar Sweep'],
                      ] as Array<[IdleAnimType, string]>
                    ).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, idleType: type } }))
                        }
                        className={`py-2 px-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          activeConfig.animation.idleType === type
                            ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {activeConfig.animation.idleType !== 'none' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <SliderRow
                        label="Animation Speed"
                        value={activeConfig.animation.idleSpeed}
                        min={0.2}
                        max={4}
                        step={0.1}
                        unit="x"
                        onChange={(v) =>
                          updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, idleSpeed: v } }))
                        }
                      />
                      <SliderRow
                        label="Effect Intensity"
                        value={Math.round(activeConfig.animation.idleIntensity * 100)}
                        min={10}
                        max={100}
                        step={5}
                        unit="%"
                        onChange={(v) =>
                          updateActiveConfig((c) => ({ ...c, animation: { ...c.animation, idleIntensity: v / 100 } }))
                        }
                      />
                    </div>
                  )}
                </div>
              </SectionCard>
            </>
          )}

          {/* TAB 5: POSITION OFFSET, SCALE & EXPORT */}
          {subTab === 'position-share' && (
            <>
              <SectionCard title="Screen Position Offset & Optical Scale">
                <p className="text-xs text-slate-400">
                  Fine-tune pixel alignment for games with non-centered third-person or weapon-bob hipfire cameras. Tip: You can also nudge 1px live in-game using{' '}
                  <span className="font-mono text-cyan-300">Alt + Arrow Keys</span>!
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <SliderRow
                    label="Horizontal Offset (X)"
                    value={activeConfig.position.offsetX}
                    min={-300}
                    max={300}
                    step={1}
                    unit="px"
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, position: { ...c.position, offsetX: v } }))}
                  />
                  <SliderRow
                    label="Vertical Offset (Y)"
                    value={activeConfig.position.offsetY}
                    min={-300}
                    max={300}
                    step={1}
                    unit="px"
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, position: { ...c.position, offsetY: v } }))}
                  />
                  <SliderRow
                    label="Global Reticle Scale"
                    value={activeConfig.position.scale}
                    min={0.4}
                    max={3.0}
                    step={0.05}
                    unit="x"
                    onChange={(v) => updateActiveConfig((c) => ({ ...c, position: { ...c.position, scale: v } }))}
                  />
                  <ToggleRow
                    label="Even-Pixel Center Snap"
                    description="Prevents blurry half-pixel anti-aliasing on 1080p/1440p monitors"
                    checked={activeConfig.position.evenPixelSnap}
                    onChange={(v) =>
                      updateActiveConfig((c) => ({ ...c, position: { ...c.position, evenPixelSnap: v } }))
                    }
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveConfig((c) => ({ ...c, position: { ...c.position, offsetX: 0, offsetY: 0, scale: 1 } }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Center Exactly (0, 0)
                  </button>
                  <button
                    type="button"
                    onClick={() => store.setActiveTab('monitors')}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-xs font-semibold text-cyan-200 cursor-pointer"
                  >
                    Open Visual Multi-Monitor Map →
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Instant Share Code & Asset Export">
                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-slate-400">Your Unique Share Code (CX1)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={encodeShareCode(activeConfig)}
                      className="flex-1 px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-300 select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyShareCode}
                      className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      exportCrosshairPNGFile(activeConfig, 1);
                      bumpStat((s) => ({ ...s, imagesExported: s.imagesExported + 1 }));
                      pushToast('PNG Exported (1x)', `${activeConfig.name}.png`, 'emerald');
                    }}
                    className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-400" /> PNG 1x (Exact)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportCrosshairPNGFile(activeConfig, 3);
                      bumpStat((s) => ({ ...s, imagesExported: s.imagesExported + 1 }));
                      pushToast('PNG Exported (3x HD)', `${activeConfig.name}.png`, 'emerald');
                    }}
                    className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" /> PNG 3x HD
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportCrosshairSVGFile(activeConfig);
                      bumpStat((s) => ({ ...s, imagesExported: s.imagesExported + 1 }));
                      pushToast('SVG Exported', `${activeConfig.name}.svg`, 'emerald');
                    }}
                    className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-amber-400" /> Lossless SVG
                  </button>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
