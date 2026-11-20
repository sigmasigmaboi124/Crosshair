import { CrosshairConfig, DEFAULT_INPUT_STATE, LiveInputState, createDefaultCrosshair } from '../types/crosshair';
import { CrosshairAnimationController } from '../engine/animationState';
import { renderCrosshairCanvas } from '../engine/crosshairRenderer';

interface OverlaySyncPayload {
  enabled: boolean;
  activeConfig: CrosshairConfig;
  secondaryAdsConfig: CrosshairConfig | null;
  monitorIndex: number;
}

declare global {
  interface Window {
    crosshairAPI?: {
      onOverlayPayload: (cb: (payload: OverlaySyncPayload) => void) => () => void;
      onInputState: (cb: (input: LiveInputState) => void) => () => void;
    };
  }
}

const canvas = document.getElementById('overlay-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

let enabled = true;
let activeConfig: CrosshairConfig = createDefaultCrosshair();
let secondaryAdsConfig: CrosshairConfig | null = null;
let liveInput: LiveInputState = { ...DEFAULT_INPUT_STATE };

const animController = new CrosshairAnimationController();

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

if (window.crosshairAPI) {
  window.crosshairAPI.onOverlayPayload((payload) => {
    enabled = payload.enabled;
    if (payload.activeConfig) activeConfig = payload.activeConfig;
    secondaryAdsConfig = payload.secondaryAdsConfig ?? null;
  });

  window.crosshairAPI.onInputState((input) => {
    liveInput = input;
  });
}

let lastTime = performance.now();

function loop(now: number): void {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (ctx) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!enabled) {
      ctx.clearRect(0, 0, w, h);
    } else {
      const frame = animController.step(activeConfig, liveInput, dt);
      const drawCfg = frame.useSecondaryProfile && secondaryAdsConfig ? secondaryAdsConfig : activeConfig;
      // Note: Position offset is already applied to the overlay window coordinates, so draw at exact window center
      renderCrosshairCanvas(ctx, w, h, drawCfg, frame, {
        zoom: 1,
        ignorePositionOffset: true,
      });
    }
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
