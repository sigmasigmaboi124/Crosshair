import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Download,
  Eye,
  Image as ImageIcon,
  Keyboard,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { SectionCard, SliderRow, ToggleRow } from './ui/Controls';
import {
  BUILTIN_COLOR_LOOKS,
  ColorFilterConfig,
  ColorHotkeyBinding,
  ColorHudCorner,
  ColorLook,
} from '../types/crosshair';
import { downloadTextFile } from '../engine/shareCodec';

interface ColorFiltersViewProps {
  store: AppStore;
}

type ColorSubTab = 'tune' | 'compare' | 'rules';

const STOCK_LOOK: ColorLook = BUILTIN_COLOR_LOOKS[0];

function buildColorMatrix25(look: ColorLook): Float32Array {
  const lumR = 0.2126;
  const lumG = 0.7152;
  const lumB = 0.0722;

  const ident = (): number[][] => [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 0, 1],
  ];

  const mul = (a: number[][], b: number[][]): number[][] => {
    const r = ident();
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        let s = 0;
        for (let k = 0; k < 5; k++) s += a[i][k] * b[k][j];
        r[i][j] = s;
      }
    }
    return r;
  };

  let m = ident();

  const sat = ident();
  const s = look.saturation;
  const ir = lumR * (1 - s);
  const ig = lumG * (1 - s);
  const ib = lumB * (1 - s);
  sat[0][0] = ir + s; sat[0][1] = ir;     sat[0][2] = ir;
  sat[1][0] = ig;     sat[1][1] = ig + s; sat[1][2] = ig;
  sat[2][0] = ib;     sat[2][1] = ib;     sat[2][2] = ib + s;
  m = mul(m, sat);

  const con = ident();
  const off = 0.5 * (1 - look.contrast);
  con[0][0] = look.contrast; con[1][1] = look.contrast; con[2][2] = look.contrast;
  con[4][0] = off;           con[4][1] = off;           con[4][2] = off;
  m = mul(m, con);

  const bri = ident();
  bri[4][0] = look.brightness; bri[4][1] = look.brightness; bri[4][2] = look.brightness;
  m = mul(m, bri);

  if (Math.abs(look.hue) > 0.01) {
    const a = (look.hue * Math.PI) / 180;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const k = [
      [0.213 + c * 0.787 - sn * 0.213, 0.715 - c * 0.715 - sn * 0.715, 0.072 - c * 0.072 + sn * 0.928],
      [0.213 - c * 0.213 + sn * 0.143, 0.715 + c * 0.285 + sn * 0.140, 0.072 - c * 0.072 - sn * 0.283],
      [0.213 - c * 0.213 - sn * 0.787, 0.715 - c * 0.715 + sn * 0.715, 0.072 + c * 0.928 + sn * 0.072],
    ];
    const hm = ident();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) hm[i][j] = k[j][i];
    }
    m = mul(m, hm);
  }

  const t = Math.max(-1, Math.min(1, look.temperature));
  if (Math.abs(t) > 0.0001) {
    const gm = ident();
    gm[0][0] = 1 + 0.12 * t;
    gm[1][1] = 1 + 0.02 * t;
    gm[2][2] = 1 - 0.14 * t;
    m = mul(m, gm);
  }

  const flat = new Float32Array(25);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) flat[i * 5 + j] = m[i][j];
  }
  return flat;
}

function buildShadowLut(boost: number): Uint8Array {
  const lut = new Uint8Array(256);
  const k = 0.9 * (boost - 1);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    if (k <= 0) {
      lut[i] = i;
    } else {
      const inv = 1 - x;
      const y = Math.max(0, Math.min(1, x + k * x * inv * inv * inv));
      lut[i] = Math.round(y * 255);
    }
  }
  return lut;
}

function createSampleSceneCanvas(w = 960, h = 540): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const horizon = Math.floor(h * 0.52);

  // Hazy sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, 'rgb(118, 158, 194)');
  sky.addColorStop(1, 'rgb(196, 206, 212)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // Distant hills
  ctx.fillStyle = 'rgb(122, 136, 128)';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(w * 0.25, horizon - 65);
  ctx.lineTo(w * 0.58, horizon - 28);
  ctx.lineTo(w * 0.85, horizon - 78);
  ctx.lineTo(w, horizon - 35);
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fill();

  // Compound building with dark interior windows (shows Shadow Boost clearly)
  ctx.fillStyle = 'rgb(192, 190, 182)';
  ctx.fillRect(w * 0.08, horizon - 118, w * 0.38, 145);
  ctx.fillStyle = 'rgb(142, 102, 74)';
  ctx.beginPath();
  ctx.moveTo(w * 0.06, horizon - 118);
  ctx.lineTo(w * 0.27, horizon - 168);
  ctx.lineTo(w * 0.48, horizon - 118);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    const wx = w * 0.12 + i * (w * 0.11);
    const wy = horizon - 88;
    ctx.fillStyle = 'rgb(22, 24, 28)';
    ctx.fillRect(wx, wy, w * 0.065, 62);
    // Subtle silhouette inside dark room (invisible at stock, revealed with Shadow Boost)
    if (i === 1) {
      ctx.fillStyle = 'rgb(38, 40, 44)';
      ctx.beginPath();
      ctx.arc(wx + w * 0.032, wy + 24, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(wx + w * 0.018, wy + 34, w * 0.028, 24);
    }
  }

  // Ground / foliage
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, 'rgb(148, 156, 94)');
  ground.addColorStop(1, 'rgb(96, 108, 58)');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Trees
  for (let i = 0; i < 18; i++) {
    const tx = w * 0.5 + (i / 18) * (w * 0.52);
    const r = 24 + (i % 4) * 9;
    ctx.fillStyle = i % 2 === 0 ? 'rgb(78, 102, 62)' : 'rgb(92, 118, 70)';
    ctx.beginPath();
    ctx.arc(tx, horizon - 8 - (i % 3) * 10, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Deep dark shadow corner bush on right (tests Shadow Boost)
  ctx.fillStyle = 'rgb(24, 30, 20)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(w * 0.74 + i * 34, h - 55 + (i % 2) * 14, 58, 42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgb(42, 48, 36)';
  ctx.fillRect(w * 0.79, h - 78, 38, 22);

  // Subtle washed-out game fog
  ctx.fillStyle = 'rgba(225, 225, 215, 0.14)';
  ctx.fillRect(0, 0, w, h);

  return c;
}

function formatHotkeyLabel(b: ColorHotkeyBinding): string {
  if (!b.vk) return 'Unbound';
  const parts: string[] = [];
  if (b.modifiers & 2) parts.push('Ctrl');
  if (b.modifiers & 1) parts.push('Alt');
  if (b.modifiers & 4) parts.push('Shift');
  let keyName = `VK ${b.vk}`;
  if (b.vk >= 0x70 && b.vk <= 0x87) keyName = `F${b.vk - 0x6f}`;
  else if (b.vk >= 0x41 && b.vk <= 0x5a) keyName = String.fromCharCode(b.vk);
  else if (b.vk >= 0x30 && b.vk <= 0x39) keyName = String.fromCharCode(b.vk);
  parts.push(keyName);
  return parts.join(' + ');
}

export const ColorFiltersView: React.FC<ColorFiltersViewProps> = ({ store }) => {
  const {
    colorFilter,
    updateColorFilter,
    colorStatus,
    runningProcesses,
    refreshAudioDevices,
    previewColorHud,
    unlockGammaRange,
    captureCleanScreen,
    pushToast,
  } = store;

  const [subTab, setSubTab] = useState<ColorSubTab>('tune');
  const [newProfileName, setNewProfileName] = useState('');
  const [ruleProcess, setRuleProcess] = useState('');
  const [rulePreset, setRulePreset] = useState('Hyper');
  const [rebindingAction, setRebindingAction] = useState<ColorHotkeyBinding['action'] | null>(null);

  // Compare state
  const [splitPct, setSplitPct] = useState(50);
  const [capturing, setCapturing] = useState(false);
  const compareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingSplitRef = useRef(false);

  const allPresets = useMemo<ColorLook[]>(() => {
    const list = [...BUILTIN_COLOR_LOOKS];
    for (const c of colorFilter.customPresets) {
      if (!list.some((b) => b.name.toLowerCase() === c.name.toLowerCase())) {
        list.push(c);
      }
    }
    return list;
  }, [colorFilter.customPresets]);

  const updateWorking = useCallback(
    (patch: Partial<ColorLook>) => {
      updateColorFilter((prev) => {
        const nextWorking: ColorLook = { ...prev.working, ...patch };
        return {
          ...prev,
          working: nextWorking,
          applied: prev.autoApply ? structuredClone(nextWorking) : prev.applied,
        };
      }, false);
    },
    [updateColorFilter]
  );

  const selectPreset = (name: string) => {
    const found = allPresets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!found) return;
    const cloned = structuredClone(found);
    cloned.builtIn = false;
    updateColorFilter(
      (prev) => ({
        ...prev,
        enabled: true,
        activePreset: found.name,
        working: cloned,
        applied: prev.autoApply ? structuredClone(cloned) : prev.applied,
      }),
      true
    );
  };

  const handleSaveCustomProfile = () => {
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      pushToast('Name required', 'Enter a name for your color profile.', 'amber');
      return;
    }
    if (BUILTIN_COLOR_LOOKS.some((b) => b.name.toLowerCase() === trimmed.toLowerCase()) || trimmed.toLowerCase() === 'off') {
      pushToast('Reserved name', 'Choose a name different from built-in presets.', 'amber');
      return;
    }
    const savedLook: ColorLook = {
      ...structuredClone(colorFilter.working),
      name: trimmed.slice(0, 24),
      builtIn: false,
    };
    updateColorFilter((prev) => {
      const idx = prev.customPresets.findIndex((c) => c.name.toLowerCase() === savedLook.name.toLowerCase());
      const nextCustoms = [...prev.customPresets];
      if (idx >= 0) nextCustoms[idx] = savedLook;
      else nextCustoms.push(savedLook);
      return {
        ...prev,
        enabled: true,
        activePreset: savedLook.name,
        applied: structuredClone(savedLook),
        customPresets: nextCustoms,
      };
    }, true);
    setNewProfileName('');
    pushToast('Color profile saved', savedLook.name, 'emerald');
  };

  const handleDeleteCustomProfile = (name: string) => {
    updateColorFilter((prev) => {
      const remaining = prev.customPresets.filter((c) => c.name !== name);
      const fallback = structuredClone(BUILTIN_COLOR_LOOKS[2]);
      const wasActive = prev.activePreset.toLowerCase() === name.toLowerCase();
      return {
        ...prev,
        activePreset: wasActive ? 'Hyper' : prev.activePreset,
        working: wasActive ? fallback : prev.working,
        applied: wasActive ? structuredClone(fallback) : prev.applied,
        customPresets: remaining,
      };
    });
    pushToast('Profile deleted', `${name} removed.`, 'rose');
  };

  const handleExportProfiles = () => {
    const listToExport =
      colorFilter.customPresets.length > 0
        ? colorFilter.customPresets
        : [{ ...colorFilter.working, name: colorFilter.activePreset, builtIn: false }];
    const payload = {
      App: 'HyperHue',
      Version: 2,
      Profiles: listToExport.map((p) => ({
        Name: p.name,
        BuiltIn: false,
        Brightness: p.brightness,
        Contrast: p.contrast,
        Temperature: p.temperature,
        Saturation: p.saturation,
        Hue: p.hue,
        ShadowBoost: p.shadowBoost,
      })),
    };
    downloadTextFile(
      `zeropoint-colors-${new Date().toISOString().slice(0, 10)}.hyperhue.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
    pushToast('Color profiles exported', 'Saved .hyperhue.json pack.', 'emerald');
  };

  const handleImportProfiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        const arr = Array.isArray(raw?.Profiles) ? raw.Profiles : Array.isArray(raw?.profiles) ? raw.profiles : [];
        if (arr.length === 0) throw new Error('No profiles found');
        const imported: ColorLook[] = arr.map((item: Record<string, unknown>, idx: number) => ({
          name: String(item.Name ?? item.name ?? `Imported ${idx + 1}`).slice(0, 24),
          builtIn: false,
          brightness: Math.max(-0.5, Math.min(0.5, Number(item.Brightness ?? item.brightness ?? 0))),
          contrast: Math.max(0.5, Math.min(2, Number(item.Contrast ?? item.contrast ?? 1))),
          temperature: Math.max(-1, Math.min(1, Number(item.Temperature ?? item.temperature ?? 0))),
          saturation: Math.max(0, Math.min(4, Number(item.Saturation ?? item.saturation ?? 1))),
          hue: Math.max(-180, Math.min(180, Number(item.Hue ?? item.hue ?? 0))),
          shadowBoost: Math.max(1, Math.min(3, Number(item.ShadowBoost ?? item.shadowBoost ?? 1))),
        }));
        updateColorFilter((prev) => {
          const merged = [...prev.customPresets];
          for (const imp of imported) {
            let candidate = imp.name;
            if (BUILTIN_COLOR_LOOKS.some((b) => b.name.toLowerCase() === candidate.toLowerCase())) {
              candidate = `${candidate} (custom)`.slice(0, 24);
            }
            imp.name = candidate;
            const existingIdx = merged.findIndex((m) => m.name.toLowerCase() === candidate.toLowerCase());
            if (existingIdx >= 0) merged[existingIdx] = imp;
            else merged.push(imp);
          }
          const last = imported[imported.length - 1];
          return {
            ...prev,
            enabled: true,
            activePreset: last.name,
            working: structuredClone(last),
            applied: structuredClone(last),
            customPresets: merged,
          };
        }, true);
        pushToast('Profiles imported', `Loaded ${imported.length} color profile(s).`, 'emerald');
      } catch {
        pushToast('Import failed', 'Select a valid .hyperhue.json file.', 'rose');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Hotkey listener when rebinding
  useEffect(() => {
    if (!rebindingAction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRebindingAction(null);
        return;
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      let mods = 0;
      if (e.ctrlKey) mods |= 2;
      if (e.altKey) mods |= 1;
      if (e.shiftKey) mods |= 4;
      const vk = e.keyCode || 0;
      if (vk > 0) {
        updateColorFilter((prev) => ({
          ...prev,
          hotkeys: prev.hotkeys.map((h) =>
            h.action === rebindingAction ? { ...h, modifiers: mods, vk } : h
          ),
        }));
        setRebindingAction(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [rebindingAction, updateColorFilter]);

  // Initialize sample scene for Compare
  useEffect(() => {
    if (!sourceCanvasRef.current) {
      sourceCanvasRef.current = createSampleSceneCanvas(960, 540);
    }
  }, []);

  // Recompute processed "After" canvas whenever source or working look changes
  const rebuildProcessedPreview = useCallback(() => {
    const src = sourceCanvasRef.current;
    if (!src) return;
    const w = src.width;
    const h = src.height;
    const srcCtx = src.getContext('2d');
    if (!srcCtx) return;

    let dst = processedCanvasRef.current;
    if (!dst || dst.width !== w || dst.height !== h) {
      dst = document.createElement('canvas');
      dst.width = w;
      dst.height = h;
      processedCanvasRef.current = dst;
    }
    const dstCtx = dst.getContext('2d');
    if (!dstCtx) return;

    const imgData = srcCtx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const m = buildColorMatrix25(colorFilter.working);
    const boost = colorFilter.shadowBoostEnabled ? colorFilter.working.shadowBoost : 1;
    const lut = boost > 1.001 ? buildShadowLut(boost) : null;

    const m00 = m[0], m01 = m[1], m02 = m[2];
    const m10 = m[5], m11 = m[6], m12 = m[7];
    const m20 = m[10], m21 = m[11], m22 = m[12];
    const offR = m[20] * 255;
    const offG = m[21] * 255;
    const offB = m[22] * 255;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      let nr = r * m00 + g * m10 + b * m20 + offR;
      let ng = r * m01 + g * m11 + b * m21 + offG;
      let nb = r * m02 + g * m12 + b * m22 + offB;
      nr = nr < 0 ? 0 : nr > 255 ? 255 : nr;
      ng = ng < 0 ? 0 : ng > 255 ? 255 : ng;
      nb = nb < 0 ? 0 : nb > 255 ? 255 : nb;
      if (lut) {
        d[i] = lut[nr | 0];
        d[i + 1] = lut[ng | 0];
        d[i + 2] = lut[nb | 0];
      } else {
        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }
    }
    dstCtx.putImageData(imgData, 0, 0);
  }, [colorFilter.working, colorFilter.shadowBoostEnabled]);

  const drawSplitCanvas = useCallback(() => {
    const view = compareCanvasRef.current;
    const before = sourceCanvasRef.current;
    const after = processedCanvasRef.current;
    if (!view || !before || !after) return;
    const ctx = view.getContext('2d');
    if (!ctx) return;

    const w = view.width;
    const h = view.height;
    const splitX = Math.round((splitPct / 100) * w);

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(before, 0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    ctx.drawImage(after, 0, 0, w, h);
    ctx.restore();

    // Clean ZeroPoint monochrome divider line & handle (zero neon colors)
    ctx.fillStyle = '#f4f4f6';
    ctx.fillRect(splitX - 1, 0, 2, h);

    const cy = h / 2;
    ctx.beginPath();
    ctx.arc(splitX, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#141418';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f4f4f6';
    ctx.stroke();

    ctx.strokeStyle = '#f4f4f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(splitX - 6, cy);
    ctx.lineTo(splitX - 2, cy - 4);
    ctx.moveTo(splitX - 6, cy);
    ctx.lineTo(splitX - 2, cy + 4);
    ctx.moveTo(splitX + 6, cy);
    ctx.lineTo(splitX + 2, cy - 4);
    ctx.moveTo(splitX + 6, cy);
    ctx.lineTo(splitX + 2, cy + 4);
    ctx.stroke();
  }, [splitPct]);

  useEffect(() => {
    if (subTab !== 'compare') return;
    rebuildProcessedPreview();
    drawSplitCanvas();
  }, [subTab, rebuildProcessedPreview, drawSplitCanvas]);

  const loadDataUrlIntoCompare = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1280;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const cw = Math.max(320, Math.round(img.width * scale));
      const ch = Math.max(180, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      ctx?.drawImage(img, 0, 0, cw, ch);
      sourceCanvasRef.current = c;
      rebuildProcessedPreview();
      drawSplitCanvas();
    };
    img.src = dataUrl;
  };

  const handleCaptureScreen = async () => {
    setCapturing(true);
    const dataUrl = await captureCleanScreen();
    setCapturing(false);
    if (dataUrl) {
      loadDataUrlIntoCompare(dataUrl);
      pushToast('Screen captured', 'Loaded clean pre-filter frame for comparison.', 'emerald');
    } else {
      pushToast('Desktop capture', 'Open in ZeroPoint Desktop to capture your live monitor.', 'cyan');
    }
  };

  const handleUploadCompareImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadDataUrlIntoCompare(reader.result);
      }
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const updateSplitFromPointer = (clientX: number) => {
    const rect = compareCanvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSplitPct(pct);
  };

  const handleAddAppRule = (procOverride?: string, presetOverride?: string) => {
    const rawProc = (procOverride ?? ruleProcess).trim().replace(/\.exe$/i, '');
    if (!rawProc) {
      pushToast('App required', 'Pick a running game or enter its process name.', 'amber');
      return;
    }
    const targetPreset = presetOverride ?? rulePreset;
    updateColorFilter((prev) => {
      const filtered = prev.rules.filter((r) => r.process.toLowerCase() !== rawProc.toLowerCase());
      return {
        ...prev,
        rules: [{ process: rawProc, preset: targetPreset }, ...filtered],
      };
    });
    if (!procOverride) setRuleProcess('');
    pushToast('Game rule saved', `${rawProc}.exe → ${targetPreset}`, 'emerald');
  };

  const w = colorFilter.working;
  const hasPendingManualApply =
    !colorFilter.autoApply &&
    JSON.stringify(colorFilter.working) !== JSON.stringify(colorFilter.applied);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Unified ZeroPoint Header */}
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1c1c22] border border-[#2b2b34] flex items-center justify-center shrink-0">
            <Palette className="w-4 h-4 text-[#f4f4f6]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Color filters & shadow boost</h2>
            <p className="text-xs text-[#8c8c9a] mt-0.5 max-w-2xl leading-relaxed">
              Adjust saturation, contrast, color temperature, and dark-corner gamma across borderless or fullscreen games — restored automatically on exit.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {/* Sub-navigation segmented bar */}
          <div className="flex flex-wrap rounded-lg bg-[#0e0e11] border border-[#24242c] p-0.5 gap-0.5">
            {(
              [
                ['tune', 'Tune & profiles'],
                ['compare', 'Before / After'],
                ['rules', 'Game rules & HUD'],
              ] as Array<[ColorSubTab, string]>
            ).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSubTab(id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  subTab === id
                    ? 'bg-[#22222b] text-white'
                    : 'text-[#8c8c9a] hover:text-[#e4e4e8]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              updateColorFilter((prev) => ({ ...prev, enabled: !prev.enabled }), true)
            }
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              colorFilter.enabled
                ? 'bg-[#f4f4f6] hover:bg-white text-[#0c0c0e]'
                : 'bg-[#1c1c22] hover:bg-[#25252d] border border-[#2f2f39] text-[#d0d0d8]'
            }`}
          >
            {colorFilter.enabled ? `Filters on · ${colorFilter.activePreset}` : 'Turn on filters'}
          </button>
        </div>
      </div>

      {/* TAB 1: TUNE & PROFILES */}
      {subTab === 'tune' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Built-in & Custom Profiles */}
          <div className="lg:col-span-4 space-y-4">
            <SectionCard
              title="Color profiles"
              subtitle="Built-in looks and saved profiles"
            >
              <div className="space-y-1">
                {BUILTIN_COLOR_LOOKS.map((preset) => {
                  const active = colorFilter.activePreset.toLowerCase() === preset.name.toLowerCase();
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => selectPreset(preset.name)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition cursor-pointer relative ${
                        active
                          ? 'bg-[#1d1d24] border-[#3d3d4a] text-white'
                          : 'bg-[#101013] border-[#202027] text-[#b4b4c0] hover:border-[#2f2f39]'
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[#ff5526]" />
                      )}
                      <span className="text-xs font-semibold truncate">{preset.name}</span>
                      <span className="text-[10px] font-mono tabular-nums text-[#7c7c8a] shrink-0">
                        {preset.saturation.toFixed(1)}× sat
                        {preset.shadowBoost > 1 ? ` · ${preset.shadowBoost.toFixed(1)}× shadow` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Saved / Migrated Custom Profiles */}
              <div className="pt-3 border-t border-[#1f1f26] space-y-2">
                <div className="text-[11px] font-medium text-[#8c8c9a]">Saved profiles</div>

                {colorFilter.customPresets.length === 0 ? (
                  <div className="text-[11px] text-[#6e6e7c] py-1">
                    Tune the sliders and save your own profile below.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {colorFilter.customPresets.map((custom) => {
                      const active = colorFilter.activePreset.toLowerCase() === custom.name.toLowerCase();
                      return (
                        <div
                          key={custom.name}
                          onClick={() => selectPreset(custom.name)}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition cursor-pointer relative ${
                            active
                              ? 'bg-[#1d1d24] border-[#3d3d4a] text-white'
                              : 'bg-[#101013] border-[#202027] text-[#b4b4c0] hover:border-[#2f2f39]'
                          }`}
                        >
                          {active && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[#ff5526]" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{custom.name}</div>
                            <div className="text-[10px] font-mono tabular-nums text-[#787886]">
                              {custom.saturation.toFixed(2)}× sat · {custom.shadowBoost.toFixed(2)}× shadow
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomProfile(custom.name);
                            }}
                            className="p-1 rounded text-[#6f6f7d] hover:text-rose-300 cursor-pointer shrink-0"
                            title="Delete saved profile"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Profile name..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-white focus:outline-none focus:border-[#4b4b59]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCustomProfile}
                    className="px-2.5 py-1.5 rounded-md bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold whitespace-nowrap flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Save
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <label className="px-2.5 py-1.5 rounded-md bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-xs font-medium text-[#d4d4dc] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5 text-[#8c8c9a]" />
                    <span>Import</span>
                    <input type="file" accept=".json" className="hidden" onChange={handleImportProfiles} />
                  </label>
                  <button
                    type="button"
                    onClick={handleExportProfiles}
                    className="px-2.5 py-1.5 rounded-md bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-xs font-medium text-[#d4d4dc] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-[#8c8c9a]" />
                    <span>Export</span>
                  </button>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Right: Sliders & Live Engine Status */}
          <div className="lg:col-span-8 space-y-4">
            <SectionCard
              title="Light & tone"
              subtitle="Exposure, contrast, and warm/cool balance"
              rightSlot={
                <button
                  type="button"
                  onClick={() =>
                    updateWorking({
                      brightness: STOCK_LOOK.brightness,
                      contrast: STOCK_LOOK.contrast,
                      temperature: STOCK_LOOK.temperature,
                    })
                  }
                  className="text-[11px] text-[#8c8c9a] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SliderRow
                  label="Brightness"
                  value={w.brightness}
                  min={-0.5}
                  max={0.5}
                  step={0.01}
                  onChange={(v) => updateWorking({ brightness: v })}
                />
                <SliderRow
                  label="Contrast"
                  value={w.contrast}
                  min={0.5}
                  max={2.0}
                  step={0.01}
                  unit="×"
                  onChange={(v) => updateWorking({ contrast: v })}
                />
                <SliderRow
                  label="Temperature"
                  value={w.temperature}
                  min={-1.0}
                  max={1.0}
                  step={0.02}
                  onChange={(v) => updateWorking({ temperature: v })}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Color & vibrance"
              subtitle="Boost enemy color contrast up to 4× without touching game files"
              rightSlot={
                <button
                  type="button"
                  onClick={() => updateWorking({ saturation: STOCK_LOOK.saturation, hue: STOCK_LOOK.hue })}
                  className="text-[11px] text-[#8c8c9a] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SliderRow
                  label="Saturation"
                  value={w.saturation}
                  min={0}
                  max={4.0}
                  step={0.02}
                  unit="×"
                  onChange={(v) => updateWorking({ saturation: v })}
                />
                <SliderRow
                  label="Hue rotation"
                  value={w.hue}
                  min={-180}
                  max={180}
                  step={1}
                  unit="°"
                  onChange={(v) => updateWorking({ hue: v })}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Dark corners (Shadow boost)"
              subtitle="Lifts dark interiors via hardware gamma while keeping bright skies intact"
              rightSlot={
                <button
                  type="button"
                  onClick={() => updateWorking({ shadowBoost: STOCK_LOOK.shadowBoost })}
                  className="text-[11px] text-[#8c8c9a] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              }
            >
              <SliderRow
                label="Shadow boost strength"
                value={w.shadowBoost}
                min={1.0}
                max={3.0}
                step={0.02}
                unit="×"
                disabled={!colorFilter.shadowBoostEnabled}
                onChange={(v) => updateWorking({ shadowBoost: v })}
              />

              {colorStatus.gammaLimited && (
                <div className="pt-2 border-t border-[#1f1f26] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[#a1a1ad]">
                    Windows capped gamma range at <span className="font-mono tabular-nums text-white">{colorStatus.gammaAchieved.toFixed(2)}×</span>.
                  </span>
                  <button
                    type="button"
                    onClick={() => unlockGammaRange()}
                    className="px-2.5 py-1 rounded-md bg-[#1c1c22] hover:bg-[#26262f] border border-[#32323d] text-xs font-medium text-[#f4f4f6] cursor-pointer"
                  >
                    Unlock full gamma range
                  </button>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Live output & controls"
              subtitle="Current display pipeline and quick actions"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        colorStatus.effectiveActive ? 'bg-emerald-400' : 'bg-[#5c5c68]'
                      }`}
                    />
                    <span className="text-[#f4f4f6]">
                      {colorStatus.effectiveActive ? colorStatus.effectiveName : 'Filters off'}
                    </span>
                  </div>
                  <span className="text-[#787886]">
                    Engine: <span className="text-[#c4c4d0]">{colorStatus.lastPath}</span>
                  </span>
                  {colorStatus.foregroundProcess && (
                    <span className="text-[#787886]">
                      Front app: <span className="font-mono text-[#c4c4d0]">{colorStatus.foregroundProcess}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {hasPendingManualApply && (
                    <button
                      type="button"
                      onClick={() =>
                        updateColorFilter(
                          (prev) => ({ ...prev, enabled: true, applied: structuredClone(prev.working) }),
                          true
                        )
                      }
                      className="px-3 py-1.5 rounded-md bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold cursor-pointer"
                    >
                      Apply changes
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSubTab('compare')}
                    className="px-3 py-1.5 rounded-md bg-[#18181e] hover:bg-[#22222a] border border-[#2c2c35] text-xs font-medium text-[#e4e4e8] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#9898a6]" />
                    <span>Compare before / after</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-[#1f1f26]">
                <ToggleRow
                  label="Apply slider adjustments immediately"
                  description="Updates your monitor live while dragging sliders."
                  checked={colorFilter.autoApply}
                  accent="emerald"
                  onChange={(v) =>
                    updateColorFilter((prev) => ({
                      ...prev,
                      autoApply: v,
                      applied: v ? structuredClone(prev.working) : prev.applied,
                    }))
                  }
                />
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* TAB 2: BEFORE / AFTER SPLIT COMPARE */}
      {subTab === 'compare' && (
        <SectionCard
          title="Before / After visual comparison"
          subtitle="Drag across the frame to compare untouched stock output against your active profile"
          rightSlot={
            <select
              value={colorFilter.activePreset}
              onChange={(e) => selectPreset(e.target.value)}
              className="px-2.5 py-1 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6]"
            >
              {allPresets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          }
        >
          <div className="relative rounded-lg overflow-hidden border border-[#23232b] bg-[#0c0c0e] select-none">
            <canvas
              ref={compareCanvasRef}
              width={960}
              height={480}
              onMouseDown={(e) => {
                draggingSplitRef.current = true;
                updateSplitFromPointer(e.clientX);
              }}
              onMouseMove={(e) => {
                if (draggingSplitRef.current) updateSplitFromPointer(e.clientX);
              }}
              onMouseUp={() => {
                draggingSplitRef.current = false;
              }}
              onMouseLeave={() => {
                draggingSplitRef.current = false;
              }}
              className="w-full h-auto max-h-[460px] object-cover block cursor-ew-resize"
            />
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-[#0c0c0e]/85 border border-[#2c2c35] text-[11px] font-medium text-[#d0d0d8] pointer-events-none">
              Before (Stock)
            </div>
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-[#0c0c0e]/85 border border-[#3d3d4a] text-[11px] font-medium text-white pointer-events-none">
              After ({colorFilter.activePreset})
            </div>
          </div>

          <SliderRow
            label="Split position"
            value={Math.round(splitPct)}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(v) => setSplitPct(v)}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1f1f26]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCaptureScreen}
                disabled={capturing}
                className="px-3.5 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white disabled:opacity-50 text-[#0c0c0e] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{capturing ? 'Capturing...' : 'Capture my screen'}</span>
              </button>

              <label className="px-3 py-1.5 rounded-lg bg-[#18181e] hover:bg-[#22222a] border border-[#2c2c35] text-xs font-medium text-[#e4e4e8] flex items-center gap-1.5 cursor-pointer">
                <ImageIcon className="w-3.5 h-3.5 text-[#9898a6]" />
                <span>Load screenshot</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadCompareImage} />
              </label>

              <button
                type="button"
                onClick={() => {
                  sourceCanvasRef.current = createSampleSceneCanvas(960, 540);
                  rebuildProcessedPreview();
                  drawSplitCanvas();
                }}
                className="px-3 py-1.5 rounded-lg bg-[#18181e] hover:bg-[#22222a] border border-[#2c2c35] text-xs font-medium text-[#e4e4e8] cursor-pointer"
              >
                Sample game scene
              </button>
            </div>

            <span className="text-[11px] font-mono tabular-nums text-[#787886]">
              SAT {w.saturation.toFixed(2)}× · CON {w.contrast.toFixed(2)}× · SHADOW {w.shadowBoost.toFixed(2)}×
            </span>
          </div>
        </SectionCard>
      )}

      {/* TAB 3: PER-GAME RULES, ENGINE & HUD */}
      {subTab === 'rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Per-Game Auto-Switch Rules */}
          <div className="lg:col-span-6 space-y-4">
            <SectionCard
              title="Per-game automatic rules"
              subtitle="Assign profiles to specific games or keep desktop stock"
              rightSlot={
                <button
                  type="button"
                  onClick={() => refreshAudioDevices()}
                  className="p-1.5 rounded-md bg-[#18181e] hover:bg-[#222229] border border-[#2a2a33] text-[#a1a1ad] hover:text-white cursor-pointer"
                  title="Refresh running apps"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              }
            >
              <ToggleRow
                label="Only run in listed games"
                description="Leaves your Windows desktop at stock colors and activates filters only when a listed game is in front."
                checked={colorFilter.rulesOnly}
                accent="emerald"
                onChange={(v) => updateColorFilter((prev) => ({ ...prev, rulesOnly: v }))}
              />

              <div className="pt-2.5 border-t border-[#1f1f26] flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-[#a1a1ad]">Quick setup for ROB RUN</span>
                <button
                  type="button"
                  onClick={() => handleAddAppRule('ROB RUN', colorFilter.activePreset)}
                  className="px-3 py-1.5 rounded-md bg-[#1c1c22] hover:bg-[#26262f] border border-[#32323d] text-xs font-medium text-[#f4f4f6] cursor-pointer"
                >
                  Assign ROB RUN → {colorFilter.activePreset}
                </button>
              </div>

              <div className="pt-2.5 border-t border-[#1f1f26] space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#8c8c9a] block">Game process</label>
                    <input
                      type="text"
                      value={ruleProcess}
                      onChange={(e) => setRuleProcess(e.target.value)}
                      placeholder="ROB RUN.exe"
                      list="running-procs-datalist"
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs font-mono text-white"
                    />
                    <datalist id="running-procs-datalist">
                      {runningProcesses.map((p) => (
                        <option key={p} value={p.replace(/\.exe$/i, '')} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[#8c8c9a] block">Assigned profile</label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={rulePreset}
                        onChange={(e) => setRulePreset(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-white"
                      >
                        <option value="Off">Off (Disable filter)</option>
                        {allPresets.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleAddAppRule()}
                        className="px-3 py-1.5 rounded-md bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {colorFilter.rules.length === 0 ? (
                  <div className="text-[11px] text-[#6e6e7c] pt-1">
                    No per-game rules added yet.
                  </div>
                ) : (
                  <div className="space-y-1 pt-1">
                    {colorFilter.rules.map((r) => (
                      <div
                        key={r.process}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#101013] border border-[#222229] text-xs"
                      >
                        <span className="font-mono text-[#e4e4e8] truncate">{r.process}.exe</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[#a1a1ad]">{r.preset}</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateColorFilter((prev) => ({
                                ...prev,
                                rules: prev.rules.filter((x) => x.process !== r.process),
                              }))
                            }
                            className="p-1 rounded text-[#6f6f7d] hover:text-rose-300 cursor-pointer"
                            title="Remove rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Right: Hardware Engine, In-Game HUD & Hotkeys */}
          <div className="lg:col-span-6 space-y-4">
            <SectionCard
              title="Display color engine"
              subtitle="Choose how color transforms reach your monitor"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateColorFilter((prev) => ({ ...prev, engineMode: 'screen' }))}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                    colorFilter.engineMode === 'screen'
                      ? 'bg-[#202028] border-[#484857] text-white'
                      : 'bg-[#101013] border-[#222229] text-[#b4b4c0] hover:border-[#343440]'
                  }`}
                >
                  <div className="text-xs font-semibold">Screen filter</div>
                  <div className="text-[11px] text-[#7c7c8a] mt-0.5">
                    Covers desktop, windowed, and borderless games on any GPU.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => updateColorFilter((prev) => ({ ...prev, engineMode: 'amd' }))}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                    colorFilter.engineMode === 'amd'
                      ? 'bg-[#202028] border-[#484857] text-white'
                      : 'bg-[#101013] border-[#222229] text-[#b4b4c0] hover:border-[#343440]'
                  }`}
                >
                  <div className="text-xs font-semibold">AMD Radeon driver</div>
                  <div className="text-[11px] text-[#7c7c8a] mt-0.5">
                    Direct Radeon ADL2 control — works in exclusive fullscreen too.
                  </div>
                </button>
              </div>

              <div className="text-[11px] text-[#8c8c9a]">
                {colorFilter.engineMode === 'amd' ? colorStatus.amdStatus : colorStatus.filterStatus}
              </div>

              <div className="pt-2 border-t border-[#1f1f26]">
                <ToggleRow
                  label="Enable hardware gamma Shadow Boost"
                  description="Uses monitor gamma ramps (works in both borderless and exclusive fullscreen)."
                  checked={colorFilter.shadowBoostEnabled}
                  accent="emerald"
                  onChange={(v) => updateColorFilter((prev) => ({ ...prev, shadowBoostEnabled: v }))}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="In-game HUD & hotkeys"
              subtitle="Click-through status toast and global shortcuts"
              rightSlot={
                <button
                  type="button"
                  onClick={() => previewColorHud()}
                  className="px-2.5 py-1 rounded-md bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[11px] font-medium text-[#e4e4e8] cursor-pointer"
                >
                  Test HUD
                </button>
              }
            >
              <ToggleRow
                label="Show 2s HUD toast on profile change"
                description="Click-through overlay card that never steals game focus."
                checked={colorFilter.hudToasts}
                onChange={(v) => updateColorFilter((prev) => ({ ...prev, hudToasts: v }))}
              />
              <ToggleRow
                label="Pin compact HUD badge in corner"
                description="Keeps a small status indicator visible on screen."
                checked={colorFilter.hudPinned}
                onChange={(v) => updateColorFilter((prev) => ({ ...prev, hudPinned: v }))}
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                {(
                  [
                    ['TopLeft', 'Top left'],
                    ['TopRight', 'Top right'],
                    ['BottomLeft', 'Bottom left'],
                    ['BottomRight', 'Bottom right'],
                  ] as Array<[ColorHudCorner, string]>
                ).map(([corner, label]) => (
                  <button
                    key={corner}
                    type="button"
                    onClick={() => updateColorFilter((prev) => ({ ...prev, hudCorner: corner }))}
                    className={`py-1.5 px-2 rounded-md border text-[11px] font-medium cursor-pointer ${
                      colorFilter.hudCorner === corner
                        ? 'bg-[#22222b] border-[#454554] text-white'
                        : 'bg-[#101013] border-[#222229] text-[#9696a4] hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="pt-2.5 border-t border-[#1f1f26] space-y-1.5">
                {(
                  [
                    ['toggle', 'Toggle color filters'],
                    ['next', 'Next color profile'],
                    ['prev', 'Previous color profile'],
                    ['hud', 'Pin / unpin HUD badge'],
                  ] as Array<[ColorHotkeyBinding['action'], string]>
                ).map(([act, desc]) => {
                  const b = colorFilter.hotkeys.find((x) => x.action === act) ?? {
                    action: act,
                    modifiers: 2,
                    vk: 0x78,
                  };
                  const listening = rebindingAction === act;
                  return (
                    <div key={act} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#c4c4d0]">{desc}</span>
                      <button
                        type="button"
                        onClick={() => setRebindingAction(listening ? null : act)}
                        className={`px-2.5 py-1 rounded-md border font-mono text-[11px] flex items-center gap-1.5 cursor-pointer ${
                          listening
                            ? 'bg-[#262630] border-[#ff5526] text-white'
                            : 'bg-[#0e0e11] border-[#27272f] text-[#e4e4e8] hover:border-[#3e3e4c]'
                        }`}
                      >
                        <Keyboard className="w-3 h-3 text-[#8c8c9a]" />
                        <span>{listening ? 'Press keys...' : formatHotkeyLabel(b)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
};
