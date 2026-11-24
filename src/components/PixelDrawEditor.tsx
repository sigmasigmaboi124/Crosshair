import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eraser,
  Grid3X3,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import { CrosshairConfig } from '../types/crosshair';
import { ColorPickerRow, SectionCard, SliderRow, ToggleRow } from './ui/Controls';

type DrawTool = 'pencil' | 'eraser' | 'eyedropper' | 'bucket';
type SymmetryMode = 'none' | 'mirror-x' | 'mirror-y' | 'quad' | 'radial-8';

interface PixelDrawEditorProps {
  config: CrosshairConfig;
  onUpdateConfig: (updater: (prev: CrosshairConfig) => CrosshairConfig) => void;
}

export const PixelDrawEditor: React.FC<PixelDrawEditorProps> = ({ config, onUpdateConfig }) => {
  const [gridSize, setGridSize] = useState<32 | 64>(32);
  const [tool, setTool] = useState<DrawTool>('pencil');
  const [symmetry, setSymmetry] = useState<SymmetryMode>('quad');
  const [brushSize, setBrushSize] = useState<1 | 2 | 3>(1);
  const [color, setColor] = useState<string>(config.lines.color || '#00f5ff');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [historyLen, setHistoryLen] = useState<number>(0);
  const [redoLen, setRedoLen] = useState<number>(0);

  // Offscreen pixel buffer (RGBA Uint8ClampedArray)
  const bufferRef = useRef<Uint8ClampedArray>(new Uint8ClampedArray(32 * 32 * 4));
  const undoStackRef = useRef<Uint8ClampedArray[]>([]);
  const redoStackRef = useRef<Uint8ClampedArray[]>([]);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const activeButtonRef = useRef<number>(0);
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);

  const hexToRgba = (hex: string): [number, number, number, number] => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return [0, 245, 255, 255];
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
      255,
    ];
  };

  const rgbaToHex = (r: number, g: number, b: number): string =>
    `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  const renderDisplayCanvas = useCallback(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = gridSize;
    const w = canvas.width;
    const h = canvas.height;
    const cell = w / size;

    // Checkerboard alpha backdrop
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#121216' : '#18181e';
        ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }

    // Draw pixels from RGBA buffer
    const buf = bufferRef.current;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const a = buf[idx + 3];
        if (a > 0) {
          ctx.fillStyle = `rgba(${buf[idx]}, ${buf[idx + 1]}, ${buf[idx + 2]}, ${a / 255})`;
          ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }

    // Optional pixel grid + center symmetry axes
    if (showGrid) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < size; i++) {
        const pos = Math.round(i * cell) + 0.5;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, h);
        ctx.moveTo(0, pos);
        ctx.lineTo(w, pos);
      }
      ctx.stroke();
    }

    // Center alignment crosshair guide
    ctx.strokeStyle = 'rgba(255, 85, 38, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }, [gridSize, showGrid]);

  const syncBufferToOverlay = useCallback(() => {
    const size = gridSize;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d');
    if (!octx) return;
    const imgData = octx.createImageData(size, size);
    imgData.data.set(bufferRef.current);
    octx.putImageData(imgData, 0, 0);
    const dataUrl = off.toDataURL('image/png');

    onUpdateConfig((prev) => ({
      ...prev,
      image: {
        ...prev.image,
        enabled: true,
        dataUrl,
        fileName: 'pixel-art.png',
      },
    }));
  }, [gridSize, onUpdateConfig]);

  // Hydrate existing pixel-art image if present on mount
  useEffect(() => {
    if (config.image.fileName === 'pixel-art.png' && config.image.dataUrl) {
      const img = new Image();
      img.onload = () => {
        const s = img.naturalWidth === 64 ? 64 : 32;
        setGridSize(s);
        const off = document.createElement('canvas');
        off.width = s;
        off.height = s;
        const octx = off.getContext('2d');
        if (octx) {
          octx.drawImage(img, 0, 0, s, s);
          bufferRef.current = new Uint8ClampedArray(octx.getImageData(0, 0, s, s).data);
          renderDisplayCanvas();
        }
      };
      img.src = config.image.dataUrl;
    } else {
      renderDisplayCanvas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderDisplayCanvas();
  }, [renderDisplayCanvas]);

  const pushUndoSnapshot = () => {
    undoStackRef.current.push(new Uint8ClampedArray(bufferRef.current));
    if (undoStackRef.current.length > 40) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryLen(undoStackRef.current.length);
    setRedoLen(0);
  };

  const handleUndo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push(new Uint8ClampedArray(bufferRef.current));
    bufferRef.current = prev;
    setHistoryLen(undoStackRef.current.length);
    setRedoLen(redoStackRef.current.length);
    renderDisplayCanvas();
    syncBufferToOverlay();
  }, [renderDisplayCanvas, syncBufferToOverlay]);

  const handleRedo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(new Uint8ClampedArray(bufferRef.current));
    bufferRef.current = next;
    setHistoryLen(undoStackRef.current.length);
    setRedoLen(redoStackRef.current.length);
    renderDisplayCanvas();
    syncBufferToOverlay();
  }, [renderDisplayCanvas, syncBufferToOverlay]);

  // Ctrl+Z / Ctrl+Y keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  const setPixelSingle = (x: number, y: number, rgba: [number, number, number, number]) => {
    const size = gridSize;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const idx = (y * size + x) * 4;
    bufferRef.current[idx] = rgba[0];
    bufferRef.current[idx + 1] = rgba[1];
    bufferRef.current[idx + 2] = rgba[2];
    bufferRef.current[idx + 3] = rgba[3];
  };

  const plotWithSymmetry = (cx: number, cy: number, rgba: [number, number, number, number]) => {
    const size = gridSize;
    const max = size - 1;
    const pts: Array<[number, number]> = [[cx, cy]];
    if (symmetry === 'mirror-x' || symmetry === 'quad' || symmetry === 'radial-8') {
      pts.push([max - cx, cy]);
    }
    if (symmetry === 'mirror-y' || symmetry === 'quad' || symmetry === 'radial-8') {
      pts.push([cx, max - cy]);
    }
    if (symmetry === 'quad' || symmetry === 'radial-8') {
      pts.push([max - cx, max - cy]);
    }
    if (symmetry === 'radial-8') {
      pts.push([cy, cx], [max - cy, cx], [cy, max - cx], [max - cy, max - cx]);
    }

    const r = brushSize === 1 ? 0 : 1;
    for (const [px, py] of pts) {
      if (brushSize === 1) {
        setPixelSingle(px, py, rgba);
      } else if (brushSize === 2) {
        setPixelSingle(px, py, rgba);
        setPixelSingle(px + 1, py, rgba);
        setPixelSingle(px, py + 1, rgba);
        setPixelSingle(px + 1, py + 1, rgba);
      } else {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            setPixelSingle(px + ox, py + oy, rgba);
          }
        }
      }
    }
  };

  // Bresenham line interpolation so fast drags stay continuous
  const drawLineCells = (x0: number, y0: number, x1: number, y1: number, rgba: [number, number, number, number]) => {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    while (true) {
      plotWithSymmetry(cx, cy, rgba);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  };

  const floodFill = (startX: number, startY: number, fillRgba: [number, number, number, number]) => {
    const size = gridSize;
    const buf = bufferRef.current;
    const sIdx = (startY * size + startX) * 4;
    const tr = buf[sIdx], tg = buf[sIdx + 1], tb = buf[sIdx + 2], ta = buf[sIdx + 3];
    if (tr === fillRgba[0] && tg === fillRgba[1] && tb === fillRgba[2] && ta === fillRgba[3]) return;

    const stack: Array<[number, number]> = [[startX, startY]];
    const visited = new Uint8Array(size * size);
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const p = y * size + x;
      if (visited[p]) continue;
      const idx = p * 4;
      if (buf[idx] !== tr || buf[idx + 1] !== tg || buf[idx + 2] !== tb || buf[idx + 3] !== ta) continue;
      visited[p] = 1;
      buf[idx] = fillRgba[0];
      buf[idx + 1] = fillRgba[1];
      buf[idx + 2] = fillRgba[2];
      buf[idx + 3] = fillRgba[3];
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  };

  const getCellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(gridSize - 1, Math.floor(((e.clientX - rect.left) / rect.width) * gridSize)));
    const y = Math.max(0, Math.min(gridSize - 1, Math.floor(((e.clientY - rect.top) / rect.height) * gridSize)));
    return { x, y };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCellFromEvent(e);
    activeButtonRef.current = e.button;

    if (tool === 'eyedropper' && e.button === 0) {
      const idx = (y * gridSize + x) * 4;
      if (bufferRef.current[idx + 3] > 0) {
        setColor(rgbaToHex(bufferRef.current[idx], bufferRef.current[idx + 1], bufferRef.current[idx + 2]));
        setTool('pencil');
      }
      return;
    }

    pushUndoSnapshot();
    const erase = e.button === 2 || tool === 'eraser';
    const rgba: [number, number, number, number] = erase ? [0, 0, 0, 0] : hexToRgba(color);

    if (tool === 'bucket' && !erase) {
      floodFill(x, y, rgba);
      renderDisplayCanvas();
      syncBufferToOverlay();
      return;
    }

    isDrawingRef.current = true;
    lastCellRef.current = { x, y };
    plotWithSymmetry(x, y, rgba);
    renderDisplayCanvas();
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const { x, y } = getCellFromEvent(e);
    const erase = activeButtonRef.current === 2 || tool === 'eraser';
    const rgba: [number, number, number, number] = erase ? [0, 0, 0, 0] : hexToRgba(color);
    const prev = lastCellRef.current ?? { x, y };
    drawLineCells(prev.x, prev.y, x, y, rgba);
    lastCellRef.current = { x, y };
    renderDisplayCanvas();
  };

  const finishStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastCellRef.current = null;
    syncBufferToOverlay();
  };

  const handleChangeGridSize = (nextSize: 32 | 64) => {
    if (nextSize === gridSize) return;
    pushUndoSnapshot();
    const oldSize = gridSize;
    const oldBuf = bufferRef.current;
    const nextBuf = new Uint8ClampedArray(nextSize * nextSize * 4);
    // Rescale nearest-neighbor cleanly
    for (let y = 0; y < nextSize; y++) {
      for (let x = 0; x < nextSize; x++) {
        const sx = Math.min(oldSize - 1, Math.floor((x / nextSize) * oldSize));
        const sy = Math.min(oldSize - 1, Math.floor((y / nextSize) * oldSize));
        const sIdx = (sy * oldSize + sx) * 4;
        const dIdx = (y * nextSize + x) * 4;
        nextBuf[dIdx] = oldBuf[sIdx];
        nextBuf[dIdx + 1] = oldBuf[sIdx + 1];
        nextBuf[dIdx + 2] = oldBuf[sIdx + 2];
        nextBuf[dIdx + 3] = oldBuf[sIdx + 3];
      }
    }
    bufferRef.current = nextBuf;
    setGridSize(nextSize);
  };

  const handleAutoOutline = () => {
    pushUndoSnapshot();
    const size = gridSize;
    const src = new Uint8ClampedArray(bufferRef.current);
    const dst = new Uint8ClampedArray(src);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        if (src[idx + 3] > 0) continue;
        let touchesOpaque = false;
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size && src[(ny * size + nx) * 4 + 3] > 0) {
            touchesOpaque = true;
            break;
          }
        }
        if (touchesOpaque) {
          dst[idx] = 0;
          dst[idx + 1] = 0;
          dst[idx + 2] = 0;
          dst[idx + 3] = 235;
        }
      }
    }
    bufferRef.current = dst;
    renderDisplayCanvas();
    syncBufferToOverlay();
  };

  const stampTemplate = (kind: 'cross' | 'star' | 'heart' | 'brackets') => {
    pushUndoSnapshot();
    const size = gridSize;
    bufferRef.current = new Uint8ClampedArray(size * size * 4);
    const rgba = hexToRgba(color);
    const mid = Math.floor(size / 2);
    const unit = size === 64 ? 2 : 1;

    const fillRect = (x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) setPixelSingle(x, y, rgba);
      }
    };

    if (kind === 'cross') {
      fillRect(mid - unit, mid - 9 * unit, unit * 2, 6 * unit);
      fillRect(mid - unit, mid + 3 * unit, unit * 2, 6 * unit);
      fillRect(mid - 9 * unit, mid - unit, 6 * unit, unit * 2);
      fillRect(mid + 3 * unit, mid - unit, 6 * unit, unit * 2);
      fillRect(mid - unit, mid - unit, unit * 2, unit * 2);
    } else if (kind === 'star') {
      for (let i = 2 * unit; i <= 8 * unit; i++) {
        setPixelSingle(mid + i, mid + i, rgba);
        setPixelSingle(mid - i - 1, mid + i, rgba);
        setPixelSingle(mid + i, mid - i - 1, rgba);
        setPixelSingle(mid - i - 1, mid - i - 1, rgba);
      }
      fillRect(mid - unit, mid - unit, unit * 2, unit * 2);
    } else if (kind === 'heart') {
      const pts = [
        [-4, -3], [-3, -4], [-2, -4], [-1, -3], [0, -2],
        [-5, -2], [-5, -1], [-4, 0], [-3, 1], [-2, 2], [-1, 3], [0, 4],
      ];
      for (const [px, py] of pts) {
        fillRect(mid + px * unit, mid + py * unit, unit, unit);
        fillRect(mid - (px + 1) * unit, mid + py * unit, unit, unit);
      }
    } else if (kind === 'brackets') {
      fillRect(mid - 9 * unit, mid - 6 * unit, unit * 2, 12 * unit);
      fillRect(mid - 9 * unit, mid - 6 * unit, 4 * unit, unit * 2);
      fillRect(mid - 9 * unit, mid + 4 * unit, 4 * unit, unit * 2);
      fillRect(mid + 7 * unit, mid - 6 * unit, unit * 2, 12 * unit);
      fillRect(mid + 5 * unit, mid - 6 * unit, 4 * unit, unit * 2);
      fillRect(mid + 5 * unit, mid + 4 * unit, 4 * unit, unit * 2);
      fillRect(mid - unit, mid - unit, unit * 2, unit * 2);
    }

    renderDisplayCanvas();
    syncBufferToOverlay();
  };

  const handleClear = () => {
    pushUndoSnapshot();
    bufferRef.current = new Uint8ClampedArray(gridSize * gridSize * 4);
    renderDisplayCanvas();
    syncBufferToOverlay();
  };

  return (
    <SectionCard
      title="Pixel editor"
      subtitle={`${gridSize}×${gridSize} canvas · syncs live to overlay`}
      rightSlot={
        <div className="flex items-center gap-1">
          {([32, 64] as const).map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => handleChangeGridSize(sz)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border cursor-pointer ${
                gridSize === sz
                  ? 'bg-[#25252e] border-[#444452] text-white'
                  : 'bg-[#18181e] border-[#23232a] text-[#9696a4] hover:text-white'
              }`}
            >
              {sz}×{sz}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Interactive Pixel Grid Canvas */}
        <div className="xl:col-span-6 flex flex-col items-center gap-2">
          <div className="relative rounded-xl overflow-hidden border-2 border-[#2e2e38] bg-[#0e0e11]">
            <canvas
              ref={displayCanvasRef}
              width={320}
              height={320}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={finishStroke}
              onMouseLeave={finishStroke}
              onContextMenu={(e) => e.preventDefault()}
              className="block w-[288px] h-[288px] sm:w-[320px] sm:h-[320px] cursor-crosshair select-none"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <div className="text-[10px] font-mono text-[#727280] text-center">
            Left-Click: Draw • Right-Click: Quick Erase • Ctrl+Z / Ctrl+Y: Undo / Redo
          </div>
        </div>

        {/* Right: Tools, Symmetry, Color & Overlay Controls */}
        <div className="xl:col-span-6 space-y-3">
          {/* Tool Row */}
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ['pencil', 'Draw', <Pencil className="w-3.5 h-3.5" />],
                ['eraser', 'Erase', <Eraser className="w-3.5 h-3.5" />],
                ['bucket', 'Fill', <PaintBucket className="w-3.5 h-3.5" />],
                ['eyedropper', 'Pick', <Pipette className="w-3.5 h-3.5" />],
              ] as Array<[DrawTool, string, React.ReactNode]>
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTool(id)}
                className={`py-2 rounded-lg text-[11px] font-semibold border flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                  tool === id
                    ? 'bg-[#25252e] border-[#444452] text-white'
                    : 'bg-[#18181e] border-[#23232a] text-[#9696a4] hover:text-white'
                }`}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Symmetry Selector */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-[#d0d0d8]">Symmetry Mode</span>
            <div className="grid grid-cols-5 gap-1">
              {(
                [
                  ['none', 'Free'],
                  ['mirror-x', 'Mir X'],
                  ['mirror-y', 'Mir Y'],
                  ['quad', '4-Way'],
                  ['radial-8', '8-Way'],
                ] as Array<[SymmetryMode, string]>
              ).map(([m, lbl]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSymmetry(m)}
                  className={`py-1.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                    symmetry === m
                      ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-200'
                      : 'bg-[#18181e] border-[#23232a] text-[#9696a4] hover:text-white'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Brush Size + Undo/Redo + Auto-Outline + Clear */}
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-[#727280] mr-0.5">BRUSH:</span>
              {([1, 2, 3] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setBrushSize(sz)}
                  className={`px-2 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                    brushSize === sz
                      ? 'bg-[#26262f] border-[#424250] text-white'
                      : 'bg-[#18181e] border-[#23232a] text-[#9696a4]'
                  }`}
                >
                  {sz}px
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyLen === 0}
                className="p-1.5 rounded-lg bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[#d0d0d8] disabled:opacity-30 cursor-pointer"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoLen === 0}
                className="p-1.5 rounded-lg bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[#d0d0d8] disabled:opacity-30 cursor-pointer"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowGrid((v) => !v)}
                className={`p-1.5 rounded-lg border cursor-pointer ${
                  showGrid
                    ? 'bg-[#25252e] border-[#444452] text-white'
                    : 'bg-[#18181e] border-[#2c2c35] text-[#9696a4]'
                }`}
                title="Toggle Pixel Grid"
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 cursor-pointer"
                title="Clear Pixel Canvas"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Color Picker */}
          <ColorPickerRow label="Pixel Color" value={color} onChange={setColor} />

          {/* Smart Actions: Auto-Outline + Starter Stamps */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#222228]">
            <button
              type="button"
              onClick={handleAutoOutline}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/50 text-amber-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto-Outline 1px
            </button>
            <span className="text-[10px] font-mono text-[#727280] ml-1">STAMP:</span>
            {(['cross', 'star', 'heart', 'brackets'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => stampTemplate(k)}
                className="px-2 py-1 rounded bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[10px] font-semibold capitalize text-[#d0d0d8] cursor-pointer"
              >
                {k}
              </button>
            ))}
          </div>

          {/* Live Overlay Scaling & Blending */}
          <div className="space-y-2 pt-2 border-t border-[#222228]">
            <SliderRow
              label="Pixel Crosshair Scale"
              value={config.image.scale}
              min={0.3}
              max={3.0}
              step={0.05}
              unit="x"
              onChange={(v) => onUpdateConfig((c) => ({ ...c, image: { ...c.image, scale: v, enabled: true } }))}
            />
            <ToggleRow
              label="Pixel Art Only (Hide Vector Lines)"
              description="Turn OFF to combine your drawn pixels with dynamic vector bloom!"
              checked={config.image.hideVectorLayers}
              onChange={(v) => onUpdateConfig((c) => ({ ...c, image: { ...c.image, hideVectorLayers: v } }))}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
};
