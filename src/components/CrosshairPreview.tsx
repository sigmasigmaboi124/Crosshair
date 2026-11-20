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
        return { background: 'radial-gradient(circle at 50% 40%, #1c2436 0%, #0b0f18 75%)' };
      case 'desert':
        return { background: 'linear-gradient(180deg, #9bd3f5 0%, #d8e7ef 46%, #d9b88c 47%, #a67f52 100%)' };
      case 'snow':
        return { background: 'linear-gradient(180deg, #e2e8f0 0%, #f8fafc 55%, #cbd5e1 100%)' };
      case 'neon':
        return { background: 'radial-gradient(circle at 50% 50%, #3b0764 0%, #090314 75%)' };
      case 'forest':
        return { background: 'linear-gradient(180deg, #1d3b2a 0%, #2d4f38 50%, #14261a 100%)' };
      case 'alpha':
        return {
          backgroundImage:
            'linear-gradient(45deg, #1a202c 25%, transparent 25%), linear-gradient(-45deg, #1a202c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a202c 75%), linear-gradient(-45deg, transparent 75%, #1a202c 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          backgroundColor: '#111622',
        };
      case 'custom':
        return customBgUrl
          ? { backgroundImage: `url(${customBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: '#111827' };
      default:
        return { background: '#0f172a' };
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
    <div className="rounded-2xl bg-[#0b101b] border border-slate-800/90 overflow-hidden flex flex-col hud-frame shadow-xl shadow-black/40">
      {/* Top Preview Toolbar */}
      <div className="px-3 py-2 bg-[#0e1422] border-b border-slate-800/80 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                ['tactical', 'Dark'],
                ['live-targets', 'Targets'],
                ['desert', 'Desert'],
                ['snow', 'Snow'],
                ['forest', 'Forest'],
                ['neon', 'Neon'],
                ['alpha', 'Alpha'],
              ] as Array<[BackdropId, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBackdrop(id)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                  backdrop === id
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900/70 border border-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-300 hover:text-cyan-200 bg-slate-900/80 border border-slate-700/80 cursor-pointer flex items-center gap-1 shrink-0">
            <ImagePlus className="w-3 h-3 text-cyan-400" />
            <span>BG</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
            Optical Preview Stage
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowPixelGrid((v) => !v)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono flex items-center gap-1 border transition cursor-pointer ${
                showPixelGrid
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
                  : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Toggle Precision Pixel Alignment Grid"
            >
              <Grid3X3 className="w-3 h-3" />
              <span>GRID</span>
            </button>

            <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-md p-0.5">
              {[1, 2, 4, 6].map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoom(z)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                    zoom === z ? 'bg-cyan-500/30 text-cyan-200' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {z}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Live Optical Viewport */}
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
                'linear-gradient(rgba(0,240,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.16) 1px, transparent 1px)',
              backgroundSize: `${Math.max(8, zoom * 4)}px ${Math.max(8, zoom * 4)}px`,
            }}
          >
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/35" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-400/35" />
          </div>
        )}

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Subtle HUD Telemetry Overlays */}
        <div className="absolute top-2.5 left-3 pointer-events-none flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/55 backdrop-blur border border-white/10 text-cyan-300 flex items-center gap-1">
            <ZoomIn className="w-3 h-3" /> {zoom}.0x OPTICS
          </span>
          {config.animation.adsAction !== 'none' && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/55 backdrop-blur border border-white/10 text-amber-300">
              ADS: {config.animation.adsAction.toUpperCase()}
            </span>
          )}
        </div>

        <div className="absolute bottom-2.5 left-3 pointer-events-none text-[10px] font-mono px-2 py-0.5 rounded bg-black/55 backdrop-blur border border-white/10 text-slate-300 flex items-center gap-1.5">
          <MousePointerClick className="w-3 h-3 text-cyan-400" />
          <span>Left-Click: Test Fire • Right-Click: Test ADS</span>
        </div>
      </div>

      {/* Bottom Interactive Simulator Bar */}
      <div className="px-3 py-2 bg-[#0e1422] border-t border-slate-800/80 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase text-slate-500">SIM:</span>
          <button
            type="button"
            onMouseDown={() => setSimFire(true)}
            onMouseUp={() => setSimFire(false)}
            onMouseLeave={() => setSimFire(false)}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition cursor-pointer ${
              simFire
                ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-rose-400/50'
            }`}
          >
            Fire (LMB)
          </button>
          <button
            type="button"
            onClick={() => {
              setSimAds((v) => !v);
              onAdsTestTrigger?.();
            }}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition cursor-pointer ${
              simAds
                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-amber-400/50'
            }`}
          >
            ADS (RMB)
          </button>
          <button
            type="button"
            onClick={() => setSimMoving((v) => !v)}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition cursor-pointer ${
              simMoving
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-cyan-400/50'
            }`}
          >
            Move (WASD)
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
          className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer shrink-0"
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
