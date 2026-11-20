import { CrosshairConfig } from '../types/crosshair';
import { CrosshairRuntimeFrame, STATIC_FRAME } from './animationState';

const imageCache = new Map<string, HTMLImageElement>();

function getCachedImage(dataUrl: string): HTMLImageElement | null {
  let img = imageCache.get(dataUrl);
  if (!img) {
    img = new Image();
    img.src = dataUrl;
    imageCache.set(dataUrl, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function hslToHex(h: number, s = 100, l = 55): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function resolveColor(base: string, frame: CrosshairRuntimeFrame): string {
  if (frame.colorOverride) return frame.colorOverride;
  if (frame.rainbowHue !== null) return hslToHex(frame.rainbowHue);
  return base;
}

export interface RenderOptions {
  zoom?: number;
  ignorePositionOffset?: boolean;
  centerX?: number;
  centerY?: number;
}

/**
 * Shared high-precision 2D Canvas renderer used by:
 *   - Live Transparent Desktop Overlay (144Hz/240Hz)
 *   - Interactive Precision Designer Preview
 *   - Community Gallery Cards
 *   - 3D Aim Trainer ("The Range") HUD
 *   - Crisp PNG Exporter
 */
export function renderCrosshairCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: CrosshairConfig,
  frame: CrosshairRuntimeFrame = STATIC_FRAME,
  options: RenderOptions = {}
): void {
  ctx.clearRect(0, 0, width, height);

  if (frame.opacityMult <= 0.005) return;

  const zoom = options.zoom ?? 1;
  const scale = config.position.scale * frame.scaleMult * zoom;
  const baseCx = options.centerX ?? width / 2;
  const baseCy = options.centerY ?? height / 2;
  const ox = options.ignorePositionOffset ? 0 : config.position.offsetX * zoom;
  const oy = (options.ignorePositionOffset ? 0 : config.position.offsetY * zoom) + frame.recoilOffsetY * zoom;

  const cx = config.position.evenPixelSnap ? Math.round(baseCx + ox) : baseCx + ox;
  const cy = config.position.evenPixelSnap ? Math.round(baseCy + oy) : baseCy + oy;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Optional outer glow
  if (config.outline.glowEnabled) {
    ctx.shadowColor = frame.rainbowHue !== null
      ? hslToHex(frame.rainbowHue)
      : config.outline.glowColor;
    ctx.shadowBlur = config.outline.glowBlur;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // 1. Custom Image / Animated Sprite Layer
  if (config.image.enabled && config.image.dataUrl) {
    const img = getCachedImage(config.image.dataUrl);
    if (img) {
      ctx.save();
      ctx.globalAlpha = config.image.opacity * frame.opacityMult;
      ctx.rotate(((config.image.rotation + frame.rotationDeltaDeg) * Math.PI) / 180);
      const maxDim = 64 * config.image.scale;
      const ratio = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight);
      const drawW = img.naturalWidth * ratio;
      const drawH = img.naturalHeight * ratio;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }
    if (config.image.hideVectorLayers) {
      drawHitmarker(ctx, config, frame);
      ctx.restore();
      return;
    }
  }

  const outlineOn = config.outline.enabled && config.outline.thickness > 0;
  const outlineT = config.outline.thickness;
  const outlineColor = config.outline.color;
  const outlineAlpha = config.outline.opacity * frame.opacityMult;

  const primaryColor = resolveColor(config.lines.color, frame);

  // Helper to draw a crisp arm rect with optional outline & rounded cap
  const drawArm = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    alpha: number,
    rounded: boolean
  ) => {
    const r = rounded ? Math.min(w, h) / 2 : 0;
    if (outlineOn) {
      ctx.save();
      ctx.globalAlpha = outlineAlpha * alpha;
      ctx.fillStyle = outlineColor;
      drawRoundedRect(ctx, x - outlineT, y - outlineT, w + outlineT * 2, h + outlineT * 2, r > 0 ? r + outlineT : 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = alpha * frame.opacityMult;
    ctx.fillStyle = color;
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
  };

  // 2. Ring / Brackets / Arcs / Chevron / Scope
  if (config.ring.enabled) {
    const ringColor = resolveColor(
      config.ring.usePrimaryColor ? config.lines.color : config.ring.color,
      frame
    );
    const ringAlpha = config.ring.opacity * frame.opacityMult;
    const radius = Math.max(2, config.ring.radius + frame.gapDelta * 0.65);
    const thick = Math.max(0.5, config.ring.thickness);

    ctx.save();
    ctx.rotate(((config.ring.rotation + frame.rotationDeltaDeg) * Math.PI) / 180);

    const strokeShape = (drawPath: () => void) => {
      if (outlineOn) {
        ctx.save();
        ctx.globalAlpha = outlineAlpha * config.ring.opacity;
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = thick + outlineT * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawPath();
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = thick;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawPath();
      ctx.stroke();
      ctx.restore();
    };

    if (config.ring.style === 'solid') {
      strokeShape(() => {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
      });
    } else if (config.ring.style === 'dashed') {
      const gapRad = (Math.max(5, Math.min(75, config.ring.dashGapDeg)) * Math.PI) / 180;
      const segRad = Math.PI / 2 - gapRad;
      strokeShape(() => {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const start = i * (Math.PI / 2) + gapRad / 2;
          ctx.moveTo(Math.cos(start) * radius, Math.sin(start) * radius);
          ctx.arc(0, 0, radius, start, start + segRad);
        }
      });
    } else if (config.ring.style === 'arcs') {
      const span = ((90 - Math.min(70, config.ring.dashGapDeg)) * Math.PI) / 180;
      strokeShape(() => {
        ctx.beginPath();
        ctx.arc(0, 0, radius, -span / 2, span / 2);
        ctx.moveTo(Math.cos(Math.PI - span / 2) * radius, Math.sin(Math.PI - span / 2) * radius);
        ctx.arc(0, 0, radius, Math.PI - span / 2, Math.PI + span / 2);
      });
    } else if (config.ring.style === 'brackets') {
      const halfH = radius * 0.72;
      const lip = radius * 0.3;
      strokeShape(() => {
        ctx.beginPath();
        // Left bracket [
        ctx.moveTo(-radius + lip, -halfH);
        ctx.lineTo(-radius, -halfH);
        ctx.lineTo(-radius, halfH);
        ctx.lineTo(-radius + lip, halfH);
        // Right bracket ]
        ctx.moveTo(radius - lip, -halfH);
        ctx.lineTo(radius, -halfH);
        ctx.lineTo(radius, halfH);
        ctx.lineTo(radius - lip, halfH);
      });
    } else if (config.ring.style === 'chevron') {
      strokeShape(() => {
        ctx.beginPath();
        ctx.moveTo(-radius * 0.7, radius * 0.55);
        ctx.lineTo(0, 0);
        ctx.lineTo(radius * 0.7, radius * 0.55);
      });
    } else if (config.ring.style === 'scope') {
      // Tactical sniper circle + mil ticks
      strokeShape(() => {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        for (let t = 1; t <= 3; t++) {
          const d = (radius * t) / 4;
          const tick = t === 2 ? 3.5 : 2;
          ctx.moveTo(-tick, d);
          ctx.lineTo(tick, d);
          ctx.moveTo(d, -tick);
          ctx.lineTo(d, tick);
          ctx.moveTo(-d, -tick);
          ctx.lineTo(-d, tick);
        }
      });
    }

    // Radar sweep accent if idleType === 'radar'
    if (config.animation.idleType === 'radar') {
      ctx.save();
      ctx.globalAlpha = 0.65 * frame.opacityMult;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = Math.max(1.5, thick);
      ctx.beginPath();
      ctx.arc(0, 0, radius + 3, frame.radarAngleRad, frame.radarAngleRad + Math.PI * 0.55);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  } else if (config.animation.idleType === 'radar') {
    ctx.save();
    ctx.globalAlpha = 0.65 * frame.opacityMult;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 16, frame.radarAngleRad, frame.radarAngleRad + Math.PI * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Secondary Outer Lines (Valorant / CS2 style)
  if (config.outerLines.enabled) {
    const ol = config.outerLines;
    const color = resolveColor(ol.usePrimaryColor ? config.lines.color : ol.color, frame);
    const gap = Math.max(0, ol.gap + frame.outerGapDelta);
    const len = Math.max(1, ol.length);
    const t = Math.max(1, ol.thickness);

    ctx.save();
    ctx.rotate(((config.lines.rotation + frame.rotationDeltaDeg) * Math.PI) / 180);
    if (!config.lines.tShape && config.lines.showTop) {
      drawArm(-t / 2, -gap - len, t, len, color, ol.opacity, config.lines.roundedCaps);
    }
    if (config.lines.showBottom) {
      drawArm(-t / 2, gap, t, len, color, ol.opacity, config.lines.roundedCaps);
    }
    if (config.lines.showLeft) {
      drawArm(-gap - len, -t / 2, len, t, color, ol.opacity, config.lines.roundedCaps);
    }
    if (config.lines.showRight) {
      drawArm(gap, -t / 2, len, t, color, ol.opacity, config.lines.roundedCaps);
    }
    ctx.restore();
  }

  // 4. Primary Inner Lines
  if (config.lines.enabled) {
    const l = config.lines;
    const gapH = Math.max(0, l.gap + frame.gapDelta);
    const gapV = Math.max(0, (l.splitAxes ? l.gapVertical : l.gap) + frame.gapDelta);
    const lenH = Math.max(1, l.length);
    const lenV = Math.max(1, l.splitAxes ? l.lengthVertical : l.length);
    const t = Math.max(1, l.thickness);

    ctx.save();
    ctx.rotate(((l.rotation + frame.rotationDeltaDeg) * Math.PI) / 180);

    if (!l.tShape && l.showTop) {
      drawArm(-t / 2, -gapV - lenV, t, lenV, primaryColor, l.opacity, l.roundedCaps);
    }
    if (l.showBottom) {
      drawArm(-t / 2, gapV, t, lenV, primaryColor, l.opacity, l.roundedCaps);
    }
    if (l.showLeft) {
      drawArm(-gapH - lenH, -t / 2, lenH, t, primaryColor, l.opacity, l.roundedCaps);
    }
    if (l.showRight) {
      drawArm(gapH, -t / 2, lenH, t, primaryColor, l.opacity, l.roundedCaps);
    }
    ctx.restore();
  }

  // 5. Center Dot
  if (config.dot.enabled && config.dot.size > 0) {
    const d = config.dot;
    const dotColor = resolveColor(d.usePrimaryColor ? config.lines.color : d.color, frame);
    const dotAlpha = d.opacity * frame.opacityMult;
    const dotOutline = d.outline && d.outlineThickness > 0;
    const dotOt = d.outlineThickness;
    const s = d.size;

    ctx.save();
    if (d.shape === 'circle') {
      const r = s / 2;
      if (dotOutline) {
        ctx.globalAlpha = dotAlpha * config.outline.opacity;
        ctx.fillStyle = d.outlineColor;
        ctx.beginPath();
        ctx.arc(0, 0, r + dotOt, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = dotAlpha;
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.shape === 'square') {
      if (dotOutline) {
        ctx.globalAlpha = dotAlpha * config.outline.opacity;
        ctx.fillStyle = d.outlineColor;
        ctx.fillRect(-s / 2 - dotOt, -s / 2 - dotOt, s + dotOt * 2, s + dotOt * 2);
      }
      ctx.globalAlpha = dotAlpha;
      ctx.fillStyle = dotColor;
      ctx.fillRect(-s / 2, -s / 2, s, s);
    } else if (d.shape === 'diamond') {
      ctx.rotate(Math.PI / 4);
      const side = s * 0.78;
      if (dotOutline) {
        ctx.globalAlpha = dotAlpha * config.outline.opacity;
        ctx.fillStyle = d.outlineColor;
        ctx.fillRect(-side / 2 - dotOt, -side / 2 - dotOt, side + dotOt * 2, side + dotOt * 2);
      }
      ctx.globalAlpha = dotAlpha;
      ctx.fillStyle = dotColor;
      ctx.fillRect(-side / 2, -side / 2, side, side);
    } else if (d.shape === 'plus') {
      const thick = Math.max(1, Math.min(2.5, s * 0.35));
      const len = Math.max(3, s * 1.4);
      if (dotOutline) {
        ctx.globalAlpha = dotAlpha * config.outline.opacity;
        ctx.fillStyle = d.outlineColor;
        ctx.fillRect(-len / 2 - dotOt, -thick / 2 - dotOt, len + dotOt * 2, thick + dotOt * 2);
        ctx.fillRect(-thick / 2 - dotOt, -len / 2 - dotOt, thick + dotOt * 2, len + dotOt * 2);
      }
      ctx.globalAlpha = dotAlpha;
      ctx.fillStyle = dotColor;
      ctx.fillRect(-len / 2, -thick / 2, len, thick);
      ctx.fillRect(-thick / 2, -len / 2, thick, len);
    }
    ctx.restore();
  }

  // 6. Hitmarker Burst (EZCrosshair / Reactive Click feedback)
  drawHitmarker(ctx, config, frame);

  ctx.restore();
}

function drawHitmarker(
  ctx: CanvasRenderingContext2D,
  config: CrosshairConfig,
  frame: CrosshairRuntimeFrame
): void {
  if (frame.hitmarkerAlpha <= 0.02) return;
  const size = Math.max(6, config.animation.hitmarkerSize);
  const inner = 4 + (1 - frame.hitmarkerAlpha) * 3;
  const outer = inner + size * 0.55;

  ctx.save();
  ctx.globalAlpha = frame.hitmarkerAlpha * frame.opacityMult;
  ctx.strokeStyle = config.animation.fireColor || '#ff3b5c';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
  }
  ctx.stroke();
  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (r <= 0.2) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    return;
  }
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/**
 * Generates a clean, lossless standalone SVG string for exporting designs (.svg)
 */
export function generateCrosshairSVG(config: CrosshairConfig, size = 128): string {
  const half = size / 2;
  const parts: string[] = [];
  const scale = config.position.scale;
  const outlineOn = config.outline.enabled && config.outline.thickness > 0;
  const ot = config.outline.thickness;
  const oc = config.outline.color;
  const oa = config.outline.opacity;

  const rectSvg = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    opacity: number,
    rx = 0
  ) => {
    const out: string[] = [];
    if (outlineOn) {
      out.push(
        `<rect x="${(x - ot).toFixed(2)}" y="${(y - ot).toFixed(2)}" width="${(w + ot * 2).toFixed(2)}" height="${(h + ot * 2).toFixed(2)}" rx="${rx > 0 ? (rx + ot).toFixed(2) : 0}" fill="${oc}" fill-opacity="${(oa * opacity).toFixed(2)}" />`
      );
    }
    out.push(
      `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx.toFixed(2)}" fill="${fill}" fill-opacity="${opacity.toFixed(2)}" />`
    );
    return out.join('\n    ');
  };

  if (config.ring.enabled) {
    const rc = config.ring.usePrimaryColor ? config.lines.color : config.ring.color;
    const r = config.ring.radius;
    const sw = config.ring.thickness;
    if (config.ring.style === 'solid' || config.ring.style === 'scope') {
      if (outlineOn) {
        parts.push(`<circle cx="0" cy="0" r="${r}" fill="none" stroke="${oc}" stroke-width="${sw + ot * 2}" stroke-opacity="${(oa * config.ring.opacity).toFixed(2)}" />`);
      }
      parts.push(`<circle cx="0" cy="0" r="${r}" fill="none" stroke="${rc}" stroke-width="${sw}" stroke-opacity="${config.ring.opacity.toFixed(2)}" />`);
    } else if (config.ring.style === 'chevron') {
      const d = `M ${(-r * 0.7).toFixed(2)} ${(r * 0.55).toFixed(2)} L 0 0 L ${(r * 0.7).toFixed(2)} ${(r * 0.55).toFixed(2)}`;
      if (outlineOn) {
        parts.push(`<path d="${d}" fill="none" stroke="${oc}" stroke-width="${sw + ot * 2}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${(oa * config.ring.opacity).toFixed(2)}" />`);
      }
      parts.push(`<path d="${d}" fill="none" stroke="${rc}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${config.ring.opacity.toFixed(2)}" />`);
    } else {
      const dash = (Math.PI * r) / 4;
      const gap = (config.ring.dashGapDeg / 90) * dash;
      if (outlineOn) {
        parts.push(`<circle cx="0" cy="0" r="${r}" fill="none" stroke="${oc}" stroke-width="${sw + ot * 2}" stroke-dasharray="${(dash - gap).toFixed(2)} ${gap.toFixed(2)}" stroke-opacity="${(oa * config.ring.opacity).toFixed(2)}" />`);
      }
      parts.push(`<circle cx="0" cy="0" r="${r}" fill="none" stroke="${rc}" stroke-width="${sw}" stroke-dasharray="${(dash - gap).toFixed(2)} ${gap.toFixed(2)}" stroke-opacity="${config.ring.opacity.toFixed(2)}" />`);
    }
  }

  if (config.outerLines.enabled) {
    const ol = config.outerLines;
    const color = ol.usePrimaryColor ? config.lines.color : ol.color;
    const rx = config.lines.roundedCaps ? ol.thickness / 2 : 0;
    const group: string[] = [];
    if (!config.lines.tShape && config.lines.showTop) group.push(rectSvg(-ol.thickness / 2, -ol.gap - ol.length, ol.thickness, ol.length, color, ol.opacity, rx));
    if (config.lines.showBottom) group.push(rectSvg(-ol.thickness / 2, ol.gap, ol.thickness, ol.length, color, ol.opacity, rx));
    if (config.lines.showLeft) group.push(rectSvg(-ol.gap - ol.length, -ol.thickness / 2, ol.length, ol.thickness, color, ol.opacity, rx));
    if (config.lines.showRight) group.push(rectSvg(ol.gap, -ol.thickness / 2, ol.length, ol.thickness, color, ol.opacity, rx));
    parts.push(`<g transform="rotate(${config.lines.rotation})">\n    ${group.join('\n    ')}\n  </g>`);
  }

  if (config.lines.enabled) {
    const l = config.lines;
    const lenV = l.splitAxes ? l.lengthVertical : l.length;
    const gapV = l.splitAxes ? l.gapVertical : l.gap;
    const rx = l.roundedCaps ? l.thickness / 2 : 0;
    const group: string[] = [];
    if (!l.tShape && l.showTop) group.push(rectSvg(-l.thickness / 2, -gapV - lenV, l.thickness, lenV, l.color, l.opacity, rx));
    if (l.showBottom) group.push(rectSvg(-l.thickness / 2, gapV, l.thickness, lenV, l.color, l.opacity, rx));
    if (l.showLeft) group.push(rectSvg(-l.gap - l.length, -l.thickness / 2, l.length, l.thickness, l.color, l.opacity, rx));
    if (l.showRight) group.push(rectSvg(l.gap, -l.thickness / 2, l.length, l.thickness, l.color, l.opacity, rx));
    parts.push(`<g transform="rotate(${l.rotation})">\n    ${group.join('\n    ')}\n  </g>`);
  }

  if (config.dot.enabled && config.dot.size > 0) {
    const d = config.dot;
    const dc = d.usePrimaryColor ? config.lines.color : d.color;
    const r = d.size / 2;
    if (d.shape === 'circle') {
      if (d.outline && d.outlineThickness > 0) {
        parts.push(`<circle cx="0" cy="0" r="${(r + d.outlineThickness).toFixed(2)}" fill="${d.outlineColor}" fill-opacity="${(d.opacity * oa).toFixed(2)}" />`);
      }
      parts.push(`<circle cx="0" cy="0" r="${r.toFixed(2)}" fill="${dc}" fill-opacity="${d.opacity.toFixed(2)}" />`);
    } else {
      const rot = d.shape === 'diamond' ? ' transform="rotate(45)"' : '';
      if (d.outline && d.outlineThickness > 0) {
        const os = d.size + d.outlineThickness * 2;
        parts.push(`<rect x="${(-os / 2).toFixed(2)}" y="${(-os / 2).toFixed(2)}" width="${os.toFixed(2)}" height="${os.toFixed(2)}"${rot} fill="${d.outlineColor}" fill-opacity="${(d.opacity * oa).toFixed(2)}" />`);
      }
      parts.push(`<rect x="${(-r).toFixed(2)}" y="${(-r).toFixed(2)}" width="${d.size.toFixed(2)}" height="${d.size.toFixed(2)}"${rot} fill="${dc}" fill-opacity="${d.opacity.toFixed(2)}" />`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${half}, ${half}) scale(${scale})">
    ${parts.join('\n    ')}
  </g>
</svg>`;
}
