import React, { useEffect, useRef, useState } from 'react';
import { Grid3X3, ImagePlus, MousePointerClick, RotateCcw, ZoomIn } from 'lucide-react';
import { CrosshairConfig, DEFAULT_INPUT_STATE, LiveInputState } from '../types/crosshair';
import { CrosshairAnimationController, STATIC_FRAME } from '../engine/animationState';
import { renderCrosshairCanvas } from '../engine/crosshairRenderer';

type BackdropId = 'tactical' | 'desert' | 'snow' | 'neon' | 'forest' | 'alpha' | 'live-targets' | 'custom';

interface CrosshairPreviewProps {
  config: CrosshairConfig;
  secondaryAdsConfig?: CrosshairConfig | null;
  liveInput?: LiveInputState;
  onAdsTestTrigger?: () => void;
}

export const CrosshairPreview: React.FC<CrosshairPreviewProps> = ({
  config,
  secondaryAdsConfig = null,
  liveInput,
  onAdsTestTrigger,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(new CrosshairAnimationController());

  const [zoom, setZoom] = useState<number>(2);
  const [showPixelGrid, setShowPixelGrid] = useState<boolean>(false);
  const [backdrop, setBackdrop] = useState<BackdropId>('tactical');
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);

  // Local interactive sandbox input inside the preview viewport
  const simInputRef = useRef<LiveInputState>(structuredClone(DEFAULT_INPUT_STATE));
  const [simMoving, setSimMoving] = useState(false);
  const [simAds, setSimAds] = useState(false);
  const [simFire, setSimFire] = useState(false);

  const configRef = useRef(config);
  configRef.current = config;
  const secondaryRef = useRef(secondaryAdsConfig);
  secondaryRef.current = secondaryAdsConfig;
  const liveInputRef = useRef(liveInput ?? DEFAULT_INPUT_STATE);
  liveInputRef.current = liveInput ?? DEFAULT_INPUT_STATE;

  useEffect(() => {
    simInputRef.current.moving = simMoving;
  }, [simMoving]);
  useEffect(() => {
    simInputRef.current.rmb = simAds;
  }, [simAds]);
  useEffect(() => {
    simInputRef.current.lmb = simFire;
  }, [simFire]);

  // Smart low-CPU render loop: draws immediately on changes and only spins rAF when animating or on live-targets backdrop
  useEffect(() => {
    let rafId = 0;
    let last = performance.now();
    let idleFrames = 0;

    const needsContinuousLoop =
      backdrop === 'live-targets' ||
      config.animation.idleType !== 'none' ||
      simFire ||
      simAds ||
      simMoving ||
      liveInput?.lmb ||
      liveInput?.rmb ||
      liveInput?.moving ||
      liveInput?.controller.fire ||
      liveInput?.controller.ads;

    const draw = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      const g = liveInputRef.current;
      const s = simInputRef.current;
      const merged: LiveInputState = {
        lmb: g.lmb || s.lmb,
        rmb: g.rmb || s.rmb,
        mmb: g.mmb || s.mmb,
        x1: g.x1 || s.x1,
        x2: g.x2 || s.x2,
        moving: g.moving || s.moving,
        sprint: g.sprint || s.sprint,
        crouch: g.crouch || s.crouch,
        jump: g.jump || s.jump,
        adsCustom: g.adsCustom || s.adsCustom,
        controller: g.controller,
      };

      const canvas = canvasRef.current;
      let stillSettling = false;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const frame = animRef.current.step(configRef.current, merged, dt);
          stillSettling =
            Math.abs(frame.gapDelta) > 0.05 ||
            Math.abs(frame.recoilOffsetY) > 0.05 ||
            Math.abs(frame.scaleMult - 1) > 0.005 ||
            frame.hitmarkerAlpha > 0.02 ||
            (frame.opacityMult > 0.01 && frame.opacityMult < 0.99);
          const drawCfg = frame.useSecondaryProfile && secondaryRef.current ? secondaryRef.current : configRef.current;
          renderCrosshairCanvas(ctx, w, h, drawCfg, frame, {
            zoom,
            ignorePositionOffset: true,
          });
        }
      }

      if (backdrop === 'live-targets' && bgCanvasRef.current) {
        const bgc = bgCanvasRef.current;
        const rect = bgc.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        if (bgc.width !== w || bgc.height !== h) {
          bgc.width = w;
          bgc.height = h;
        }
        const bctx = bgc.getContext('2d');
        if (bctx) {
          const grad = bctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#0f172a');
          grad.addColorStop(0.55, '#1e293b');
          grad.addColorStop(1, '#0c1018');
          bctx.fillStyle = grad;
          bctx.fillRect(0, 0, w, h);

          bctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
          bctx.lineWidth = 1;
          const horizon = h * 0.56;
          bctx.beginPath();
          bctx.moveTo(0, horizon);
          bctx.lineTo(w, horizon);
          for (let i = -8; i <= 8; i++) {
            bctx.moveTo(w / 2 + i * 28, horizon);
            bctx.lineTo(w / 2 + i * 110, h);
          }
          bctx.stroke();

          const t = now * 0.001;
          const targets = [
            { x: w / 2 + Math.sin(t * 1.4) * (w * 0.34), y: h * 0.5, r: 16, col: '#f43f5e' },
            { x: w / 2 + Math.cos(t * 0.9 + 1.2) * (w * 0.25), y: h * 0.44, r: 10, col: '#fbbf24' },
            { x: w / 2 + Math.sin(t * 2.1 + 2.4) * (w * 0.38), y: h * 0.54, r: 12, col: '#38bdf8' },
          ];
          targets.forEach((tg) => {
            bctx.fillStyle = 'rgba(0,0,0,0.45)';
            bctx.beginPath();
            bctx.ellipse(tg.x, tg.y + tg.r * 1.9, tg.r * 0.9, tg.r * 0.3, 0, 0, Math.PI * 2);
            bctx.fill();

            bctx.fillStyle = tg.col;
            bctx.beginPath();
            bctx.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2);
            bctx.fill();
            bctx.strokeStyle = 'rgba(255,255,255,0.6)';
            bctx.lineWidth = 1.5;
            bctx.stroke();
          });
        }
      }

      if (needsContinuousLoop || stillSettling) {
        idleFrames = 0;
        rafId = requestAnimationFrame(draw);
      } else if (idleFrames < 2) {
        idleFrames++;
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [zoom, backdrop, config, secondaryAdsConfig, simFire, simAds, simMoving, liveInput]);

  const backdropStyle: React.CSSProperties = (() => {
    switch (backdrop) {
      case 'tactical':
        return { background: '#18181d' };
      case 'desert':
        return { background: 'linear-gradient(180deg, #95bfd9 0%, #c8d6df 46%, #c8ac85 47%, #9b7a53 100%)' };
      case 'snow':
        return { background: 'linear-gradient(180deg, #e5e7eb 0%, #f4f4f6 55%, #d4d4dc 100%)' };
      case 'neon':
        return { background: '#1c1129' };
      case 'forest':
        return { background: 'linear-gradient(180deg, #21372a 0%, #2c4736 50%, #18271e 100%)' };
      case 'alpha':
        return {
          backgroundImage:
            'linear-gradient(45deg, #1f1f25 25%, transparent 25%), linear-gradient(-45deg, #1f1f25 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f1f25 75%), linear-gradient(-45deg, transparent 75%, #1f1f25 75%)',
          backgroundSize: '18px 18px',
          backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
          backgroundColor: '#131317',
        };
      case 'custom':
        return customBgUrl
          ? { backgroundImage: `url(${customBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: '#18181d' };
      default:
        return { background: '#141418' };
    }
  })();

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomBgUrl(reader.result);
        setBackdrop('custom');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-xl bg-[#141418] border border-[#23232a] overflow-hidden flex flex-col">
      {/* Top Preview Toolbar */}
      <div className="px-3 py-2 bg-[#111115] border-b border-[#202026] flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 bg-[#0c0c0e] p-0.5 rounded-lg border border-[#202026]">
          {(
            [
              ['tactical', 'Dark'],
              ['live-targets', 'Targets'],
              ['desert', 'Sand'],
              ['snow', 'Light'],
              ['forest', 'Green'],
              ['alpha', 'Grid'],
            ] as Array<[BackdropId, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBackdrop(id)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                backdrop === id
                  ? 'bg-[#222229] text-white'
                  : 'text-[#787886] hover:text-[#d4d4dc]'
              }`}
            >
              {label}
            </button>
          ))}
          <label
            className={`px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer flex items-center gap-1 transition-colors ${
              backdrop === 'custom' ? 'bg-[#222229] text-white' : 'text-[#787886] hover:text-[#d4d4dc]'
            }`}
            title="Upload a game screenshot as preview background"
          >
            <ImagePlus className="w-3 h-3" />
            <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
          </label>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowPixelGrid((v) => !v)}
            className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
              showPixelGrid
                ? 'bg-[#25252e] text-white border-[#3a3a46]'
                : 'bg-[#0c0c0e] text-[#787886] border-[#202026] hover:text-[#d4d4dc]'
            }`}
            title="Toggle pixel alignment grid"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center bg-[#0c0c0e] border border-[#202026] rounded-md p-0.5">
            {[1, 2, 4, 6].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                  zoom === z ? 'bg-[#24242c] text-white' : 'text-[#727280] hover:text-[#d4d4dc]'
                }`}
              >
                {z}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Preview Viewport */}
      <div
        className="relative h-64 sm:h-72 w-full select-none cursor-crosshair overflow-hidden"
        style={backdropStyle}
        onMouseDown={(e) => {
          if (e.button === 0) {
            simInputRef.current.lmb = true;
            setSimFire(true);
            animRef.current.triggerManualFirePulse();
          } else if (e.button === 2) {
            simInputRef.current.rmb = true;
            setSimAds(true);
            onAdsTestTrigger?.();
          }
        }}
        onMouseUp={(e) => {
          if (e.button === 0) {
            simInputRef.current.lmb = false;
            setSimFire(false);
          } else if (e.button === 2) {
            simInputRef.current.rmb = false;
            setSimAds(false);
          }
        }}
        onMouseLeave={() => {
          simInputRef.current.lmb = false;
          simInputRef.current.rmb = false;
          setSimFire(false);
          setSimAds(false);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {backdrop === 'live-targets' && (
          <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        )}

        {showPixelGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.09) 1px, transparent 1px)',
              backgroundSize: `${Math.max(8, zoom * 4)}px ${Math.max(8, zoom * 4)}px`,
            }}
          >
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#ff5526]/40" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-[#ff5526]/40" />
          </div>
        )}

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        <div className="absolute bottom-2.5 left-3 pointer-events-none text-[10px] text-white/55 flex items-center gap-1.5">
          <MousePointerClick className="w-3 h-3" />
          <span>Left-click to fire · Right-click to ADS</span>
        </div>
      </div>

      {/* Bottom Interactive Simulator Bar */}
      <div className="px-3 py-2 bg-[#111115] border-t border-[#202026] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#6e6e7c] mr-0.5">Test</span>
          <button
            type="button"
            onMouseDown={() => setSimFire(true)}
            onMouseUp={() => setSimFire(false)}
            onMouseLeave={() => setSimFire(false)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              simFire
                ? 'bg-[#ff5526]/20 border-[#ff5526]/55 text-[#ff9a7d]'
                : 'bg-[#17171c] border-[#26262e] text-[#b4b4c0] hover:text-white'
            }`}
          >
            Fire
          </button>
          <button
            type="button"
            onClick={() => {
              setSimAds((v) => !v);
              onAdsTestTrigger?.();
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              simAds
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                : 'bg-[#17171c] border-[#26262e] text-[#b4b4c0] hover:text-white'
            }`}
          >
            ADS
          </button>
          <button
            type="button"
            onClick={() => setSimMoving((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              simMoving
                ? 'bg-white/15 border-white/30 text-white'
                : 'bg-[#17171c] border-[#26262e] text-[#b4b4c0] hover:text-white'
            }`}
          >
            Move
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setSimFire(false);
            setSimAds(false);
            setSimMoving(false);
            animRef.current.reset();
          }}
          className="text-[11px] text-[#787886] hover:text-white flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>
    </div>
  );
};

/**
 * Lightweight miniature preview canvas for Community Gallery & Profile Cards
 * Supports subtle live animation on hover for animated crosshairs!
 */
export const MiniCrosshairCanvas: React.FC<{
  config: CrosshairConfig;
  size?: number;
  zoom?: number;
  animate?: boolean;
}> = ({ config, size = 96, zoom = 1.35, animate = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const hasIdleAnim = config.animation.idleType !== 'none';
    if (!animate && !hasIdleAnim) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderCrosshairCanvas(ctx, size, size, config, STATIC_FRAME, {
        zoom,
        ignorePositionOffset: true,
      });
      return;
    }

    const ctrl = new CrosshairAnimationController();
    let rafId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fakeInput: LiveInputState = animate
        ? { ...DEFAULT_INPUT_STATE, lmb: Math.sin(now * 0.004) > 0.55 }
        : DEFAULT_INPUT_STATE;
      const frame = ctrl.step(config, fakeInput, dt);
      renderCrosshairCanvas(ctx, size, size, config, frame, {
        zoom,
        ignorePositionOffset: true,
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [config, size, zoom, animate]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} className="block" />;
};
