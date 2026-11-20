import { CrosshairConfig, createDefaultCrosshair } from '../types/crosshair';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function makePreset(
  id: string,
  name: string,
  author: string,
  category: CrosshairConfig['category'],
  tags: string[],
  description: string,
  overrides: DeepPartial<CrosshairConfig>
): CrosshairConfig {
  const base = createDefaultCrosshair();
  return {
    ...base,
    id,
    name,
    author,
    category,
    tags,
    description,
    lines: { ...base.lines, ...(overrides.lines ?? {}) },
    outerLines: { ...base.outerLines, ...(overrides.outerLines ?? {}) },
    dot: { ...base.dot, ...(overrides.dot ?? {}) },
    ring: { ...base.ring, ...(overrides.ring ?? {}) },
    outline: { ...base.outline, ...(overrides.outline ?? {}) },
    image: { ...base.image, ...(overrides.image ?? {}) },
    animation: { ...base.animation, ...(overrides.animation ?? {}) },
    position: { ...base.position, ...(overrides.position ?? {}) },
  };
}

export interface CommunityPresetItem {
  config: CrosshairConfig;
  downloads: number;
  likes: number;
  featured?: boolean;
  isUserPublished?: boolean;
}

const RAW_PRESETS: Array<{ config: CrosshairConfig; downloads: number; likes: number; featured?: boolean }> = [
  // ================= TACTICAL FPS =================
  {
    featured: true,
    downloads: 148200,
    likes: 29400,
    config: makePreset(
      'tac-cyan-razor',
      'Apex Cyan Razor',
      'Vexel',
      'Tactical',
      ['valorant', 'cs2', 'pro', 'cyan', 'static'],
      'Ultra-clean tournament cyan cross with crisp 1px black outline and zero visual clutter.',
      {
        lines: { length: 5, thickness: 2, gap: 3, color: '#00f5ff' },
        dot: { enabled: false },
        outline: { enabled: true, thickness: 1, opacity: 0.9 },
        animation: { firingEnabled: false, adsAction: 'hide' },
      }
    ),
  },
  {
    featured: true,
    downloads: 132900,
    likes: 25100,
    config: makePreset(
      'tac-tshape-headhunter',
      'T-Shape Headhunter',
      'KiroFPS',
      'Tactical',
      ['t-shape', 'headshot', 'cs2', 'valorant', 'green'],
      'Open top channel keeps enemy heads completely unobstructed during long-range duels.',
      {
        lines: { tShape: true, length: 6, thickness: 2, gap: 3, color: '#22ff66' },
        dot: { enabled: false },
        outline: { enabled: true, thickness: 1, opacity: 0.85 },
        animation: { firingEnabled: true, firingType: 'bloom', bloomAmount: 5 },
      }
    ),
  },
  {
    featured: true,
    downloads: 118400,
    likes: 21800,
    config: makePreset(
      'tac-emerald-pro',
      'Classic Emerald Compact',
      'NikoStyle',
      'Tactical',
      ['cs2', 'classic', 'green', 'compact'],
      'Iconic compact neon-green 4-arm cross engineered for crisp one-taps and spray control.',
      {
        lines: { length: 4, thickness: 2, gap: 2, color: '#00ff55' },
        dot: { enabled: false },
        outline: { enabled: true, thickness: 1, opacity: 0.95 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 94200,
    likes: 17300,
    config: makePreset(
      'tac-dual-stage',
      'Dual-Stage Spray Master',
      'StrafeLab',
      'Tactical',
      ['dynamic', 'bloom', 'outer-lines', 'valorant'],
      'Static inner anchor paired with dynamic outer bloom bars that expand on spray and movement.',
      {
        lines: { length: 4, thickness: 2, gap: 2, color: '#ffffff' },
        outerLines: { enabled: true, length: 5, thickness: 2, gap: 9, opacity: 0.55, bloomMultiplier: 2.0 },
        dot: { enabled: false },
        animation: { firingEnabled: true, firingType: 'bloom', bloomAmount: 7, movementBloomEnabled: true, movementSpreadPx: 5 },
      }
    ),
  },
  {
    downloads: 87600,
    likes: 15900,
    config: makePreset(
      'tac-crimson-tap',
      'Crimson One-Tap',
      'ScreamAim',
      'Tactical',
      ['red', 'dot', 'headshot', 'valorant'],
      'High-visibility scarlet center dot with tight flanking bars for precision rifle taps.',
      {
        lines: { length: 3, thickness: 2, gap: 4, color: '#ff2e4c' },
        dot: { enabled: true, shape: 'square', size: 2, color: '#ff2e4c', usePrimaryColor: true, outline: true },
        outline: { enabled: true, thickness: 1 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 76300,
    likes: 13200,
    config: makePreset(
      'tac-amber-hybrid',
      'Amber Hybrid T',
      'Zest',
      'Tactical',
      ['t-shape', 'yellow', 'amber', 'dot'],
      'High-contrast amber T-reticle with 2px center point that pops against dark foliage and gray stone.',
      {
        lines: { tShape: true, length: 7, thickness: 2, gap: 4, color: '#ffbe0b' },
        dot: { enabled: true, shape: 'circle', size: 2.5, color: '#ffffff', usePrimaryColor: false },
        outline: { enabled: true, thickness: 1 },
      }
    ),
  },
  {
    downloads: 69100,
    likes: 11800,
    config: makePreset(
      'tac-x-diagonal',
      'Diagonal X-Vector',
      'Arcane',
      'Tactical',
      ['x-shape', 'rotated', 'cyan', 'precision'],
      '45-degree rotated X-crosshair that leaves horizontal and vertical sightlines completely open.',
      {
        lines: { length: 6, thickness: 2, gap: 4, rotation: 45, color: '#38bdf8' },
        dot: { enabled: true, shape: 'diamond', size: 2.5, color: '#ffffff' },
        outline: { enabled: true, thickness: 1 },
      }
    ),
  },
  {
    downloads: 61500,
    likes: 10200,
    config: makePreset(
      'tac-split-wide',
      'Wide Horizon Lineup',
      'SmokerPro',
      'Tactical',
      ['wide', 'split-axes', 'lineup', 'white'],
      'Wider horizontal arms for pre-aiming head height across corners with short vertical guides.',
      {
        lines: { splitAxes: true, length: 11, lengthVertical: 4, thickness: 2, gap: 3, gapVertical: 3, color: '#f8fafc' },
        dot: { enabled: false },
        outline: { enabled: true, thickness: 1 },
      }
    ),
  },
  {
    downloads: 54800,
    likes: 9100,
    config: makePreset(
      'tac-magenta-pop',
      'Neon Magenta Clash',
      'RiftGG',
      'Tactical',
      ['magenta', 'pink', 'high-contrast', 'fps'],
      'Vivid neon magenta reticle — one of the rarest natural map colors for instant eye acquisition.',
      {
        lines: { length: 5, thickness: 2, gap: 3, color: '#ff00e5' },
        dot: { enabled: true, shape: 'circle', size: 2, color: '#ffffff' },
        outline: { enabled: true, thickness: 1, opacity: 0.95 },
      }
    ),
  },
  {
    downloads: 49200,
    likes: 8300,
    config: makePreset(
      'tac-plus-tight',
      'Closed Surgical Plus',
      'ZeroGap',
      'Tactical',
      ['plus', 'zero-gap', 'minimal', 'green'],
      'Zero-gap surgical plus reticle with crisp 1px lines for pixel-angle holds.',
      {
        lines: { length: 6, thickness: 1.5, gap: 0, color: '#4ade80' },
        dot: { enabled: false },
        outline: { enabled: true, thickness: 1, opacity: 0.85 },
      }
    ),
  },

  // ================= BATTLE ROYALE =================
  {
    featured: true,
    downloads: 129400,
    likes: 23900,
    config: makePreset(
      'br-hipfire-halo',
      'Apex Hipfire Halo',
      'OctaneMain',
      'Battle Royale',
      ['apex', 'warzone', 'hipfire', 'ring', 'dynamic'],
      'Segmented hipfire spread ring that tightens on crouch and hides seamlessly when you ADS.',
      {
        lines: { length: 4, thickness: 2, gap: 14, color: '#38f8c5' },
        ring: { enabled: true, style: 'dashed', radius: 14, thickness: 1.5, dashGapDeg: 32, opacity: 0.75 },
        dot: { enabled: true, shape: 'circle', size: 3, color: '#ffffff', usePrimaryColor: false },
        animation: {
          firingEnabled: true,
          firingType: 'bloom',
          bloomAmount: 10,
          movementBloomEnabled: true,
          movementSpreadPx: 6,
          adsAction: 'hide',
          adsFadeMs: 70,
        },
      }
    ),
  },
  {
    featured: true,
    downloads: 108700,
    likes: 19400,
    config: makePreset(
      'br-shotgun-choke',
      'Shotgun Choke Ring',
      'PumpKing',
      'Battle Royale',
      ['fortnite', 'shotgun', 'circle', 'close-range'],
      'Clean circular spread indicator calibrated for close-quarters shotgun flicks.',
      {
        lines: { enabled: false },
        ring: { enabled: true, style: 'solid', radius: 18, thickness: 2, color: '#ffffff', usePrimaryColor: false, opacity: 0.85 },
        dot: { enabled: true, shape: 'circle', size: 3, color: '#ff3b5c', usePrimaryColor: false, outline: true },
        animation: { firingEnabled: true, firingType: 'pulse', bloomAmount: 9, adsAction: 'shrink', adsShrinkGapPx: 6 },
      }
    ),
  },
  {
    downloads: 91200,
    likes: 16200,
    config: makePreset(
      'br-chevron-acog',
      'Tactical ACOG Chevron',
      'Longshot',
      'Battle Royale',
      ['chevron', 'sniper', 'pubg', 'rust', 'red'],
      'Military-style glowing crimson chevron tip for precision bullet-drop estimation.',
      {
        lines: { enabled: false },
        ring: { enabled: true, style: 'chevron', radius: 14, thickness: 2.2, color: '#ff2a44', usePrimaryColor: false, opacity: 0.95 },
        dot: { enabled: true, shape: 'circle', size: 2, color: '#ffffff', usePrimaryColor: false },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 6, glowColor: '#ff2a44' },
      }
    ),
  },
  {
    downloads: 82500,
    likes: 14100,
    config: makePreset(
      'br-rust-bow',
      'Survival Bow & AK Dot',
      'RustLord',
      'Battle Royale',
      ['rust', 'survival', 'tarkov', 'dot', 'brackets'],
      'Unobtrusive survival reticle with crisp side brackets and glowing lime center bead.',
      {
        lines: { enabled: false },
        ring: { enabled: true, style: 'brackets', radius: 15, thickness: 1.5, color: '#a3e635', usePrimaryColor: false, opacity: 0.65 },
        dot: { enabled: true, shape: 'circle', size: 3.5, color: '#a3e635', usePrimaryColor: false, outline: true },
        animation: { firingEnabled: true, firingType: 'recoil', recoilKickPx: 5, adsAction: 'dim', adsDimOpacity: 0.25 },
      }
    ),
  },
  {
    downloads: 74900,
    likes: 12600,
    config: makePreset(
      'br-sniper-mildot',
      'Mil-Dot Marksman Scope',
      'GhostRecon',
      'Battle Royale',
      ['sniper', 'scope', 'mil-dot', 'precision'],
      'Fine tactical circle with built-in horizontal and vertical elevation hash ticks.',
      {
        lines: { length: 10, thickness: 1, gap: 18, color: '#e2e8f0', opacity: 0.7 },
        ring: { enabled: true, style: 'scope', radius: 22, thickness: 1.2, color: '#38bdf8', usePrimaryColor: false, opacity: 0.75 },
        dot: { enabled: true, shape: 'circle', size: 2, color: '#ff3b5c', usePrimaryColor: false },
        animation: { firingEnabled: false, adsAction: 'hide' },
      }
    ),
  },
  {
    downloads: 66800,
    likes: 11100,
    config: makePreset(
      'br-dual-arcs',
      'Wingman Dual Arcs',
      'Valkyrie',
      'Battle Royale',
      ['arcs', 'apex', 'pistol', 'cyan'],
      'Curved lateral focus arcs that guide your eyes straight to the center dot during fast strafes.',
      {
        lines: { enabled: false },
        ring: { enabled: true, style: 'arcs', radius: 13, thickness: 2, dashGapDeg: 28, color: '#00f0ff', usePrimaryColor: false, opacity: 0.85 },
        dot: { enabled: true, shape: 'circle', size: 3, color: '#ffffff', usePrimaryColor: false },
        animation: { firingEnabled: true, firingType: 'bloom', bloomAmount: 8 },
      }
    ),
  },
  {
    downloads: 58300,
    likes: 9800,
    config: makePreset(
      'br-warzone-tac',
      'Tac-Stance Tri-Point',
      'DeltaSix',
      'Battle Royale',
      ['warzone', 'cod', 'tri-point', 't-shape'],
      '3-arm tactical stance reticle with soft rounded caps and instant firing pulse.',
      {
        lines: { tShape: true, length: 8, thickness: 2.5, gap: 6, roundedCaps: true, color: '#facc15' },
        dot: { enabled: true, shape: 'circle', size: 2.5, color: '#ffffff' },
        animation: { firingEnabled: true, firingType: 'pulse', bloomAmount: 6, adsAction: 'hide' },
      }
    ),
  },

  // ================= SCI-FI & CYBER =================
  {
    featured: true,
    downloads: 112600,
    likes: 22400,
    config: makePreset(
      'scifi-holo-pulse',
      'Cyber Holo Pulse',
      'NeonSynth',
      'Sci-Fi',
      ['cyber', 'holo', 'glow', 'animated', 'cyan'],
      'Glowing holographic bracket reticle with smooth breathing aura and reactive firing flash.',
      {
        lines: { length: 5, thickness: 1.5, gap: 9, rotation: 45, color: '#00f5ff' },
        ring: { enabled: true, style: 'dashed', radius: 16, thickness: 1.5, dashGapDeg: 40, color: '#a855f7', usePrimaryColor: false, opacity: 0.85 },
        dot: { enabled: true, shape: 'diamond', size: 3.5, color: '#00f5ff', usePrimaryColor: false },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 10, glowColor: '#00f5ff', glowOpacity: 0.7 },
        animation: { firingEnabled: true, firingType: 'flash', fireColor: '#ff007f', idleType: 'breathe', idleSpeed: 1.1, idleIntensity: 0.55 },
      }
    ),
  },
  {
    downloads: 96400,
    likes: 18700,
    config: makePreset(
      'scifi-radar-lock',
      'Orbital Radar Lock',
      'AegisCore',
      'Sci-Fi',
      ['radar', 'animated', 'scifi', 'emerald'],
      'Active orbital sweep ring continuously scanning around a high-precision tactical core.',
      {
        lines: { length: 4, thickness: 1.5, gap: 6, color: '#10b981' },
        ring: { enabled: true, style: 'solid', radius: 15, thickness: 1.2, color: '#10b981', opacity: 0.55 },
        dot: { enabled: true, shape: 'circle', size: 2.5, color: '#ecfdf5', usePrimaryColor: false },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 8, glowColor: '#10b981' },
        animation: { idleType: 'radar', idleSpeed: 1.3, firingEnabled: true, firingType: 'hitmarker', fireColor: '#34d399' },
      }
    ),
  },
  {
    downloads: 88900,
    likes: 17100,
    config: makePreset(
      'scifi-chroma-prism',
      'Chroma RGB Prism',
      'PrismFX',
      'Sci-Fi',
      ['rgb', 'rainbow', 'animated', 'cyber'],
      'Full-spectrum continuous RGB chroma cycle with sleek diamond focus core.',
      {
        lines: { length: 6, thickness: 2, gap: 5, roundedCaps: true, color: '#00ffff' },
        ring: { enabled: true, style: 'arcs', radius: 15, thickness: 1.8, dashGapDeg: 30, usePrimaryColor: true, opacity: 0.8 },
        dot: { enabled: true, shape: 'diamond', size: 3, usePrimaryColor: true },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 9, glowColor: '#00ffff' },
        animation: { idleType: 'rainbow', idleSpeed: 1.4, firingEnabled: true, firingType: 'pulse', bloomAmount: 8 },
      }
    ),
  },
  {
    downloads: 72100,
    likes: 13500,
    config: makePreset(
      'scifi-mecha-brackets',
      'Mecha Titan HUD',
      'Protocol3',
      'Sci-Fi',
      ['brackets', 'titanfall', 'halo', 'orange'],
      'Armored combat visor brackets in warm HUD orange with high-clarity central diamond.',
      {
        lines: { enabled: false },
        ring: { enabled: true, style: 'brackets', radius: 17, thickness: 2, color: '#fb923c', usePrimaryColor: false, opacity: 0.9 },
        dot: { enabled: true, shape: 'diamond', size: 4, color: '#fef08a', usePrimaryColor: false, outline: true },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 7, glowColor: '#fb923c' },
        animation: { firingEnabled: true, firingType: 'bloom', bloomAmount: 7 },
      }
    ),
  },
  {
    downloads: 64300,
    likes: 11400,
    config: makePreset(
      'scifi-vortex-spinner',
      'Plasma Vortex',
      'Volt',
      'Sci-Fi',
      ['spin', 'animated', 'violet', 'energy'],
      'Slowly rotating plasma energy arcs that accelerate into overdrive when you hold fire.',
      {
        lines: { length: 5, thickness: 2, gap: 7, rotation: 45, roundedCaps: true, color: '#c084fc' },
        ring: { enabled: true, style: 'dashed', radius: 13, thickness: 1.6, dashGapDeg: 45, color: '#e879f9', usePrimaryColor: false },
        dot: { enabled: true, shape: 'circle', size: 2.5, color: '#ffffff', usePrimaryColor: false },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 8, glowColor: '#c084fc' },
        animation: { idleType: 'spin', idleSpeed: 0.55, firingEnabled: true, firingType: 'spin', bloomAmount: 10 },
      }
    ),
  },
  {
    downloads: 53700,
    likes: 9400,
    config: makePreset(
      'scifi-ion-blade',
      'Ion Blade Horizontal',
      'CyberSamurai',
      'Sci-Fi',
      ['horizontal', 'minimal', 'neon', 'blue'],
      'Minimalist horizontal wing bars with glowing ice-blue plasma dot.',
      {
        lines: { showTop: false, showBottom: false, length: 10, thickness: 2, gap: 6, roundedCaps: true, color: '#38bdf8' },
        dot: { enabled: true, shape: 'circle', size: 3, color: '#ffffff', usePrimaryColor: false },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 7, glowColor: '#38bdf8' },
      }
    ),
  },

  // ================= MINIMAL & PRECISION =================
  {
    featured: true,
    downloads: 138500,
    likes: 27200,
    config: makePreset(
      'min-micro-dot-2px',
      'Pure Micro Dot (2px)',
      'PixelExact',
      'Minimal',
      ['dot', 'minimal', '2px', 'headshot', 'static'],
      'Surgical 2px neon cyan micro-dot with crisp 1px dark rim for maximum target visibility.',
      {
        lines: { enabled: false },
        dot: { enabled: true, shape: 'circle', size: 2.5, color: '#00ffff', usePrimaryColor: false, outline: true, outlineThickness: 1 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 114200,
    likes: 20600,
    config: makePreset(
      'min-white-bead',
      'Tournament White Bead',
      'CleanAim',
      'Minimal',
      ['dot', 'white', '3px', 'universal'],
      'Balanced 3.5px pure white center dot with black border — visible on every surface in every game.',
      {
        lines: { enabled: false },
        dot: { enabled: true, shape: 'circle', size: 3.5, color: '#ffffff', usePrimaryColor: false, outline: true, outlineThickness: 1.2 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 92800,
    likes: 16500,
    config: makePreset(
      'min-hollow-ring',
      'Hollow Focus Ring',
      'ZenAim',
      'Minimal',
      ['ring', 'hollow', 'minimal', 'tracking'],
      'Tiny open ring lets you see the exact enemy pixel inside the center while tracking heads.',
      {
        lines: { enabled: false },
        dot: { enabled: false },
        ring: { enabled: true, style: 'solid', radius: 5, thickness: 1.5, color: '#00ff88', usePrimaryColor: false, opacity: 0.95 },
        outline: { enabled: true, thickness: 0.8, opacity: 0.85 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 83400,
    likes: 14700,
    config: makePreset(
      'min-square-pixel',
      'Crisp 3px Square',
      'RetroPro',
      'Minimal',
      ['square', 'dot', 'green', 'pixel'],
      'Razor-sharp 3px square pixel dot that never anti-aliases into blur.',
      {
        lines: { enabled: false },
        dot: { enabled: true, shape: 'square', size: 3, color: '#00ff44', usePrimaryColor: false, outline: true, outlineThickness: 1 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 71900,
    likes: 12300,
    config: makePreset(
      'min-diamond-gem',
      'Ruby Micro Diamond',
      'GemAim',
      'Minimal',
      ['diamond', 'red', 'minimal', 'sharp'],
      'Crisp 4px ruby diamond point favored for tracking fast moving targets.',
      {
        lines: { enabled: false },
        dot: { enabled: true, shape: 'diamond', size: 4, color: '#ff2e5b', usePrimaryColor: false, outline: true, outlineThickness: 1 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 63200,
    likes: 10900,
    config: makePreset(
      'min-plus-micro',
      'Nano Plus',
      'SubPixel',
      'Minimal',
      ['plus', 'nano', 'yellow', 'tiny'],
      'Featherweight mini-plus anchor in bright canary yellow.',
      {
        lines: { enabled: false },
        dot: { enabled: true, shape: 'plus', size: 4.5, color: '#fde047', usePrimaryColor: false, outline: true, outlineThickness: 1 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 52600,
    likes: 8800,
    config: makePreset(
      'min-ghost-dot',
      'Translucent Ghost Point',
      'Subtle',
      'Minimal',
      ['ghost', 'transparent', 'dot', 'minimal'],
      'Semi-transparent 55% opacity bead for players who want subtle screen centering without distraction.',
      {
        lines: { enabled: false },
        dot: { enabled: true, shape: 'circle', size: 4, color: '#ffffff', usePrimaryColor: false, opacity: 0.55, outline: true, outlineThickness: 1 },
        outline: { enabled: true, thickness: 1, opacity: 0.4 },
      }
    ),
  },

  // ================= REACTIVE & DYNAMIC (EZCROSSHAIR STYLE) =================
  {
    featured: true,
    downloads: 121300,
    likes: 24800,
    config: makePreset(
      'react-hitmarker-burst',
      'Hit-Confirm Burst X',
      'EZPro',
      'Reactive',
      ['hitmarker', 'reactive', 'click', 'dynamic'],
      'Triggers a crisp scarlet hit-confirm X burst on every left-click or controller RT press.',
      {
        lines: { length: 5, thickness: 2, gap: 4, color: '#ffffff' },
        dot: { enabled: true, shape: 'circle', size: 2, color: '#00f5ff', usePrimaryColor: false },
        animation: {
          firingEnabled: true,
          firingType: 'hitmarker',
          fireColor: '#ff3b5c',
          hitmarkerSize: 13,
          bloomAmount: 5,
        },
      }
    ),
  },
  {
    downloads: 97400,
    likes: 18900,
    config: makePreset(
      'react-recoil-kicker',
      'Dynamic Recoil Kicker',
      'SpraySense',
      'Reactive',
      ['recoil', 'reactive', 'spray', 'orange'],
      'Visually kicks upward and expands with sustained fire, snapping smoothly back to center on release.',
      {
        lines: { length: 6, thickness: 2, gap: 4, color: '#ff7b00' },
        outerLines: { enabled: true, length: 4, thickness: 1.5, gap: 11, opacity: 0.5, bloomMultiplier: 2.1 },
        dot: { enabled: true, shape: 'circle', size: 2, color: '#ffffff' },
        animation: {
          firingEnabled: true,
          firingType: 'recoil',
          recoilKickPx: 8,
          bloomAmount: 9,
          bloomSpeed: 20,
          recoverySpeed: 12,
        },
      }
    ),
  },
  {
    downloads: 86200,
    likes: 16100,
    config: makePreset(
      'react-flash-crimson',
      'Fire-Flash Sentinel',
      'TriggerFX',
      'Reactive',
      ['flash', 'color-change', 'reactive', 'green'],
      'Cool tactical green while aiming, instantly flashing blazing crimson while firing.',
      {
        lines: { length: 6, thickness: 2, gap: 4, color: '#10b981' },
        ring: { enabled: true, style: 'brackets', radius: 14, thickness: 1.5, usePrimaryColor: true, opacity: 0.7 },
        dot: { enabled: true, shape: 'circle', size: 2.5, usePrimaryColor: true },
        animation: {
          firingEnabled: true,
          firingType: 'flash',
          fireColor: '#ff1e42',
          bloomAmount: 6,
        },
      }
    ),
  },
  {
    downloads: 77500,
    likes: 14200,
    config: makePreset(
      'react-shuriken-spin',
      'Shuriken Fire Spinner',
      'NinjaAim',
      'Reactive',
      ['spin', 'reactive', 'fun', 'cyan'],
      '45-degree shuriken blades that spin rapidly when firing and lock crisply when idle.',
      {
        lines: { length: 7, thickness: 2, gap: 5, rotation: 45, roundedCaps: true, color: '#22d3ee' },
        dot: { enabled: true, shape: 'diamond', size: 3.5, color: '#ffffff', usePrimaryColor: false },
        animation: {
          firingEnabled: true,
          firingType: 'spin',
          bloomAmount: 6,
          bloomSpeed: 18,
        },
      }
    ),
  },
  {
    downloads: 68900,
    likes: 12400,
    config: makePreset(
      'react-movement-hybrid',
      'Kinetic Strafe Sensor',
      'CounterStrafe',
      'Reactive',
      ['movement', 'counter-strafe', 'cs2', 'dynamic'],
      'Expands on WASD / Left-Stick movement and snaps tight the instant you counter-strafe or crouch!',
      {
        lines: { length: 5, thickness: 2, gap: 3, color: '#00ff88' },
        outerLines: { enabled: true, length: 5, thickness: 2, gap: 8, opacity: 0.65, bloomMultiplier: 2.4 },
        dot: { enabled: true, shape: 'circle', size: 2, color: '#ffffff', usePrimaryColor: false },
        animation: {
          firingEnabled: true,
          firingType: 'bloom',
          bloomAmount: 8,
          movementBloomEnabled: true,
          movementSpreadPx: 7,
          sprintMultiplier: 1.7,
          crouchTightenPx: 2.5,
        },
      }
    ),
  },
  {
    downloads: 61400,
    likes: 10800,
    config: makePreset(
      'react-controller-pro',
      'Controller LT/RT Adaptive',
      'PadMaster',
      'Reactive',
      ['controller', 'xbox', 'ads', 'dynamic'],
      'Tuned specifically for XInput controllers: Left Trigger shrinks & dims cleanly, Right Trigger blooms.',
      {
        lines: { length: 6, thickness: 2, gap: 6, roundedCaps: true, color: '#38bdf8' },
        ring: { enabled: true, style: 'dashed', radius: 14, thickness: 1.6, dashGapDeg: 36, opacity: 0.7 },
        dot: { enabled: true, shape: 'circle', size: 3, color: '#ffffff', usePrimaryColor: false },
        animation: {
          firingEnabled: true,
          firingType: 'pulse',
          bloomAmount: 7,
          movementBloomEnabled: true,
          movementSpreadPx: 4,
          adsTrigger: 'rmb_or_lt',
          adsAction: 'shrink',
          adsShrinkGapPx: 4,
        },
      }
    ),
  },
  {
    downloads: 54100,
    likes: 9300,
    config: makePreset(
      'react-pulse-beat',
      'Neon Pulse Heartbeat',
      'SynthWave',
      'Reactive',
      ['breathe', 'pulse', 'neon', 'pink'],
      'Smooth breathing hot-pink ring with reactive shot pulse.',
      {
        lines: { enabled: false },
        ring: { enabled: true, style: 'solid', radius: 11, thickness: 2, color: '#f43f5e', usePrimaryColor: false, opacity: 0.85 },
        dot: { enabled: true, shape: 'circle', size: 3, color: '#ffffff', usePrimaryColor: false },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 9, glowColor: '#f43f5e' },
        animation: { idleType: 'breathe', idleSpeed: 1.25, idleIntensity: 0.7, firingEnabled: true, firingType: 'pulse', bloomAmount: 10 },
      }
    ),
  },

  // ================= ACCESSIBILITY & COLORBLIND SAFE =================
  {
    featured: true,
    downloads: 67800,
    likes: 14900,
    config: makePreset(
      'acc-deuteranopia-high',
      'Deuteranopia High-Contrast',
      'AccessLab',
      'Accessibility',
      ['colorblind', 'deuteranopia', 'blue-yellow', 'thick'],
      'Okabe-Ito colorblind-safe bright sky-blue & warm gold core with bold 2px black outline.',
      {
        lines: { length: 8, thickness: 3, gap: 5, color: '#00b4ff' },
        dot: { enabled: true, shape: 'circle', size: 4, color: '#ffd60a', usePrimaryColor: false, outline: true, outlineThickness: 1.5 },
        outline: { enabled: true, thickness: 2, color: '#000000', opacity: 1 },
        animation: { firingEnabled: false },
      }
    ),
  },
  {
    downloads: 51200,
    likes: 11200,
    config: makePreset(
      'acc-protanopia-gold',
      'Protanopia Solar Gold',
      'AccessLab',
      'Accessibility',
      ['colorblind', 'protanopia', 'yellow', 'bold'],
      'Ultra-legible solar gold T-crosshair with heavy dark rim designed for red-weak vision.',
      {
        lines: { tShape: true, length: 9, thickness: 3, gap: 4, color: '#ffe600' },
        dot: { enabled: true, shape: 'square', size: 3.5, color: '#ffffff', usePrimaryColor: false, outline: true, outlineThickness: 1.5 },
        outline: { enabled: true, thickness: 2, color: '#000000', opacity: 1 },
      }
    ),
  },
  {
    downloads: 44600,
    likes: 9700,
    config: makePreset(
      'acc-tritanopia-coral',
      'Tritanopia Crimson-Cyan',
      'AccessLab',
      'Accessibility',
      ['colorblind', 'tritanopia', 'high-contrast', 'ring'],
      'High-luminance crimson core framed by crisp white brackets for blue-yellow color vision clarity.',
      {
        lines: { enabled: false },
        ring: { enabled: true, style: 'brackets', radius: 16, thickness: 2.5, color: '#ffffff', usePrimaryColor: false, opacity: 0.95 },
        dot: { enabled: true, shape: 'circle', size: 4.5, color: '#ff2e4c', usePrimaryColor: false, outline: true, outlineThickness: 1.5 },
        outline: { enabled: true, thickness: 1.8, color: '#000000', opacity: 1 },
      }
    ),
  },
  {
    downloads: 48900,
    likes: 10100,
    config: makePreset(
      'acc-low-vision-bold',
      'High-Visibility Bold Cross',
      'AccessLab',
      'Accessibility',
      ['high-contrast', 'large', 'thick', 'white'],
      'Extra-bold pure white arms with thick black outline so you never lose track of screen center.',
      {
        lines: { length: 12, thickness: 3.5, gap: 6, roundedCaps: true, color: '#ffffff' },
        dot: { enabled: true, shape: 'circle', size: 4.5, color: '#00f5ff', usePrimaryColor: false, outline: true, outlineThickness: 1.5 },
        outline: { enabled: true, thickness: 2, color: '#000000', opacity: 1 },
      }
    ),
  },

  // ================= EXTRA PRO & SPECIALTY VARIANTS =================
  {
    downloads: 59400,
    likes: 10500,
    config: makePreset(
      'tac-ice-whisper',
      'Ice Whisper 1px',
      'Frost',
      'Tactical',
      ['thin', '1px', 'ice', 'valorant'],
      'Hairline 1px ice-blue crosshair for ultrawide & 4K monitors.',
      {
        lines: { length: 6, thickness: 1, gap: 3, color: '#bae6fd' },
        dot: { enabled: false },
        outline: { enabled: true, thickness: 1, opacity: 0.7 },
      }
    ),
  },
  {
    downloads: 55100,
    likes: 9600,
    config: makePreset(
      'br-tracer-ring',
      'Tracer Dash Circle',
      'Blink',
      'Battle Royale',
      ['overwatch', 'tracking', 'circle', 'cyan'],
      'Smooth tracking circle with crisp internal micro-dot tailored for fast SMG/pistol tracking.',
      {
        lines: { length: 3, thickness: 1.5, gap: 10, color: '#38bdf8' },
        ring: { enabled: true, style: 'solid', radius: 10, thickness: 1.5, color: '#38bdf8', opacity: 0.6 },
        dot: { enabled: true, shape: 'circle', size: 2.5, color: '#ffffff', usePrimaryColor: false },
        animation: { firingEnabled: true, firingType: 'bloom', bloomAmount: 5 },
      }
    ),
  },
  {
    downloads: 47200,
    likes: 8100,
    config: makePreset(
      'scifi-gold-sentinel',
      'Aurelia Gold Crest',
      'Midas',
      'Sci-Fi',
      ['gold', 'chevron', 'luxury', 'glow'],
      'Regal gold chevron and diamond core with subtle warm halo glow.',
      {
        lines: { showTop: false, showBottom: false, length: 6, thickness: 1.5, gap: 11, color: '#fbbf24' },
        ring: { enabled: true, style: 'chevron', radius: 10, thickness: 2, color: '#fde047', usePrimaryColor: false },
        dot: { enabled: true, shape: 'diamond', size: 2.5, color: '#ffffff', usePrimaryColor: false },
        outline: { enabled: true, thickness: 1, glowEnabled: true, glowBlur: 7, glowColor: '#f59e0b' },
      }
    ),
  },
  {
    downloads: 42900,
    likes: 7600,
    config: makePreset(
      'tac-open-box',
      'Open Box Headframe',
      'BoxAim',
      'Tactical',
      ['box', 'frame', 'cs2', 'green'],
      '4 thick short ticks forming a clean hollow box around enemy heads at medium range.',
      {
        lines: { length: 2, thickness: 4, gap: 4, color: '#22c55e' },
        dot: { enabled: false },
        outline: { enabled: true, thickness: 1, opacity: 0.9 },
      }
    ),
  },
  {
    downloads: 39800,
    likes: 7100,
    config: makePreset(
      'react-overdrive-x',
      'Overdrive X-Cross',
      'Hyperion',
      'Reactive',
      ['x-shape', 'hitmarker', 'rgb', 'dynamic'],
      'Diagonal X-crosshair with rainbow cycling and crisp click hitmarkers.',
      {
        lines: { length: 6, thickness: 2, gap: 4, rotation: 45, color: '#00ffff' },
        dot: { enabled: true, shape: 'circle', size: 2, color: '#ffffff', usePrimaryColor: false },
        animation: { idleType: 'rainbow', idleSpeed: 1.0, firingEnabled: true, firingType: 'hitmarker', fireColor: '#ffffff', hitmarkerSize: 14 },
      }
    ),
  },
  {
    downloads: 37400,
    likes: 6500,
    config: makePreset(
      'br-tarkov-pointfire',
      'Point-Fire Laser Bead',
      'TarkovOps',
      'Battle Royale',
      ['tarkov', 'laser', 'red', 'glow', 'hipfire'],
      'Simulates a crisp red tactical laser dot for close-quarters point-firing; hides cleanly on RMB ADS.',
      {
        lines: { enabled: false },
        dot: { enabled: true, shape: 'circle', size: 3.5, color: '#ff1a35', usePrimaryColor: false, outline: false },
        outline: { enabled: false, glowEnabled: true, glowBlur: 9, glowColor: '#ff1a35', glowOpacity: 0.9 },
        animation: { firingEnabled: false, adsAction: 'hide', adsFadeMs: 50 },
      }
    ),
  },
  {
    downloads: 35600,
    likes: 6200,
    config: makePreset(
      'min-emerald-laser',
      'Green Tactical Laser',
      'NVGSpec',
      'Minimal',
      ['laser', 'green', 'dot', 'glow'],
      'Bright green IR-style laser dot with soft luminous bloom.',
      {
        lines: { enabled: false },
        dot: { enabled: true, shape: 'circle', size: 3.5, color: '#00ff6a', usePrimaryColor: false, outline: false },
        outline: { enabled: false, glowEnabled: true, glowBlur: 10, glowColor: '#00ff6a', glowOpacity: 0.85 },
        animation: { firingEnabled: false, adsAction: 'hide', adsFadeMs: 50 },
      }
    ),
  },
];

export const COMMUNITY_PRESETS: CommunityPresetItem[] = RAW_PRESETS;
