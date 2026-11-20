import { CrosshairConfig, createDefaultCrosshair } from '../types/crosshair';
import { renderCrosshairCanvas, generateCrosshairSVG } from './crosshairRenderer';
import { STATIC_FRAME } from './animationState';

/**
 * Encodes any CrosshairConfig into a compact CrosshairX-style share code (CX1-...)
 * Strips large base64 images so share codes stay crisp and pasteable.
 */
export function encodeShareCode(config: CrosshairConfig): string {
  const clean: CrosshairConfig = {
    ...config,
    image: { ...config.image, dataUrl: null, enabled: false },
  };
  const json = JSON.stringify(clean);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `CX1-${b64}`;
}

/**
 * Decodes either a native CX1-... share code OR a standard Valorant crosshair profile code (0;P;...)!
 */
export function decodeAnyShareCode(rawCode: string): CrosshairConfig {
  const trimmed = rawCode.trim();
  if (!trimmed) {
    throw new Error('Share code is empty.');
  }

  if (trimmed.startsWith('CX1-')) {
    const payload = trimmed.slice(4).replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
    const binary = atob(payload + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Partial<CrosshairConfig>;
    const base = createDefaultCrosshair();
    return {
      ...base,
      ...parsed,
      id: `imported-${Date.now()}`,
      lines: { ...base.lines, ...(parsed.lines ?? {}) },
      outerLines: { ...base.outerLines, ...(parsed.outerLines ?? {}) },
      dot: { ...base.dot, ...(parsed.dot ?? {}) },
      ring: { ...base.ring, ...(parsed.ring ?? {}) },
      outline: { ...base.outline, ...(parsed.outline ?? {}) },
      image: { ...base.image, ...(parsed.image ?? {}) },
      animation: { ...base.animation, ...(parsed.animation ?? {}) },
      position: { ...base.position, ...(parsed.position ?? {}) },
    };
  }

  // Valorant Crosshair Profile Code parser (e.g. 0;P;c;5;h;0;f;0;0l;4;0o;2;0a;1;0f;0;1b;0)
  if (trimmed.startsWith('0;')) {
    return parseValorantCode(trimmed);
  }

  // Fallback raw JSON
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as Partial<CrosshairConfig>;
    const base = createDefaultCrosshair();
    return {
      ...base,
      ...parsed,
      id: `imported-${Date.now()}`,
      lines: { ...base.lines, ...(parsed.lines ?? {}) },
      outerLines: { ...base.outerLines, ...(parsed.outerLines ?? {}) },
      dot: { ...base.dot, ...(parsed.dot ?? {}) },
      ring: { ...base.ring, ...(parsed.ring ?? {}) },
      outline: { ...base.outline, ...(parsed.outline ?? {}) },
      image: { ...base.image, ...(parsed.image ?? {}) },
      animation: { ...base.animation, ...(parsed.animation ?? {}) },
      position: { ...base.position, ...(parsed.position ?? {}) },
    };
  }

  throw new Error('Unrecognized code format. Paste a CX1-... share code, Valorant 0;P;... code, or JSON.');
}

const VALORANT_COLORS: Record<string, string> = {
  '0': '#ffffff',
  '1': '#00ff00',
  '2': '#7fff00',
  '3': '#dfff00',
  '4': '#ffff00',
  '5': '#00ffff',
  '6': '#ff00ff',
  '7': '#ff0000',
};

function parseValorantCode(code: string): CrosshairConfig {
  const cfg = createDefaultCrosshair();
  cfg.id = `val-${Date.now()}`;
  cfg.name = 'Imported Valorant Crosshair';
  cfg.author = 'Valorant Import';
  cfg.category = 'Tactical';
  cfg.tags = ['valorant', 'imported', 'tactical'];
  cfg.dot.enabled = false;
  cfg.outerLines.enabled = false;
  cfg.outline.enabled = true;
  cfg.outline.thickness = 1;
  cfg.lines.color = '#ffffff';
  cfg.lines.length = 6;
  cfg.lines.thickness = 2;
  cfg.lines.gap = 3;

  const tokens = code.split(';');
  const map = new Map<string, string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    if (key === 'P' || key === 's' || key === '0') continue;
    map.set(key, tokens[i + 1]);
    i++;
  }

  if (map.has('c')) {
    const cVal = map.get('c')!;
    if (cVal === '8' && map.has('u')) {
      const hex = map.get('u')!.slice(0, 6);
      cfg.lines.color = `#${hex}`;
    } else if (VALORANT_COLORS[cVal]) {
      cfg.lines.color = VALORANT_COLORS[cVal];
    }
  }
  if (map.has('h')) cfg.outline.enabled = map.get('h') !== '0';
  if (map.has('t')) cfg.outline.thickness = Number(map.get('t')) || 1;
  if (map.has('o')) cfg.outline.opacity = Math.max(0, Math.min(1, Number(map.get('o')) || 0.5));
  if (map.has('d')) cfg.dot.enabled = map.get('d') === '1';
  if (map.has('z')) cfg.dot.size = Number(map.get('z')) || 2;
  if (map.has('a')) cfg.dot.opacity = Number(map.get('a')) || 1;
  if (map.has('0b')) cfg.lines.enabled = map.get('0b') !== '0';
  if (map.has('0t')) cfg.lines.thickness = Number(map.get('0t')) || 2;
  if (map.has('0l')) cfg.lines.length = Number(map.get('0l')) || 6;
  if (map.has('0v')) {
    cfg.lines.splitAxes = true;
    cfg.lines.lengthVertical = Number(map.get('0v')) || cfg.lines.length;
  }
  if (map.has('0o')) cfg.lines.gap = Number(map.get('0o')) || 3;
  if (map.has('0a')) cfg.lines.opacity = Number(map.get('0a')) || 1;
  if (map.has('0f')) cfg.animation.firingEnabled = map.get('0f') === '1';
  if (map.has('0m')) cfg.animation.movementBloomEnabled = map.get('0m') === '1';
  if (map.has('1b')) cfg.outerLines.enabled = map.get('1b') !== '0';
  if (map.has('1t')) cfg.outerLines.thickness = Number(map.get('1t')) || 2;
  if (map.has('1l')) cfg.outerLines.length = Number(map.get('1l')) || 2;
  if (map.has('1o')) cfg.outerLines.gap = Number(map.get('1o')) || 10;
  if (map.has('1a')) cfg.outerLines.opacity = Number(map.get('1a')) || 0.35;
  cfg.dot.usePrimaryColor = true;
  cfg.outerLines.usePrimaryColor = true;

  return cfg;
}

export function exportCrosshairAsPNGDataUrl(config: CrosshairConfig, size = 256, zoom = 2): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  renderCrosshairCanvas(ctx, size, size, config, STATIC_FRAME, {
    zoom,
    ignorePositionOffset: true,
  });
  return canvas.toDataURL('image/png');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function exportCrosshairSVGFile(config: CrosshairConfig): void {
  const svg = generateCrosshairSVG(config, 128);
  const safe = config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'crosshair';
  downloadTextFile(`${safe}.svg`, svg, 'image/svg+xml');
}

export function exportCrosshairPNGFile(config: CrosshairConfig, zoom = 2): void {
  const url = exportCrosshairAsPNGDataUrl(config, 256, zoom);
  const safe = config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'crosshair';
  downloadDataUrl(`${safe}.png`, url);
}
