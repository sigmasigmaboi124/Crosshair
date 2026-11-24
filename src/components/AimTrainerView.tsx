import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Calendar,
  Crosshair,
  Flame,
  Play,
  RotateCcw,
  Settings2,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { AimModeId, AimSessionRecord, DEFAULT_INPUT_STATE, LiveInputState } from '../types/crosshair';
import { CrosshairAnimationController } from '../engine/animationState';
import { renderCrosshairCanvas } from '../engine/crosshairRenderer';
import { aimAudio } from '../engine/audioSynth';
import {
  ReactionBenchmarkView,
  RecoilWeaponId,
  SessionTrendGraph,
  WEAPON_PATTERNS,
} from './AimTrainerExtras';

interface AimTrainerViewProps {
  store: AppStore;
}

interface ModeSpec {
  id: AimModeId;
  name: string;
  tag: string;
  description: string;
  isTracking?: boolean;
  isSandbox?: boolean;
}

const MODES: ModeSpec[] = [
  {
    id: 'gridshot',
    name: 'Gridshot Velocity',
    tag: 'FLICK SPEED',
    description: 'Three active targets on a 5×5 precision wall. Build raw flick tempo and rhythm.',
  },
  {
    id: 'spidershot',
    name: 'Spidershot Reset',
    tag: 'CENTER FLICK',
    description: 'Alternates between a center anchor and randomized peripheral orbs to train snap return.',
  },
  {
    id: 'tracking',
    name: 'StrafeBot Track',
    tag: 'TRACKING',
    description: 'Hold LMB over an evasive, unpredictably strafing 3D target to sustain lock-on.',
    isTracking: true,
  },
  {
    id: 'microshot',
    name: 'Microshot Precision',
    tag: 'HEADSHOTS',
    description: 'Tightly clustered micro-spheres engineered for surgical micro-corrections.',
  },
  {
    id: 'switchtrack',
    name: 'SwitchTrack Multi',
    tag: 'TARGET SWITCH',
    description: 'Burn down strafing armored orbs and snap immediately to the next moving threat.',
    isTracking: true,
  },
  {
    id: 'recoil',
    name: 'Recoil Control Lab',
    tag: 'SPRAY PATTERN',
    description: 'Master AK-47, Vandal & Phantom full-auto spray patterns on a live bullet-impact wall.',
  },
  {
    id: 'reaction',
    name: 'Reaction Benchmark',
    tag: 'REFLEX MS',
    description: '5-round sub-millisecond visual reflex test with percentile rank & live split tracking.',
  },
  {
    id: 'range',
    name: 'The Range Sandbox',
    tag: 'CROSSHAIR LAB',
    description: 'Free-play 3D shooting bay with WASD strafe-dodging, moving bots & ADS testing.',
    isSandbox: true,
  },
  {
    id: 'daily',
    name: 'Daily Challenge',
    tag: 'RANKED SEED',
    description: 'Today’s deterministic seeded flick + micro course. Earn Grandmaster medals.',
  },
];

// Deterministic PRNG for Daily Challenge
function createSeededRng(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function computeRank(mode: AimModeId, score: number, accuracy: number): AimSessionRecord['rank'] {
  if (mode === 'tracking') {
    if (accuracy >= 72) return 'Grandmaster';
    if (accuracy >= 62) return 'Master';
    if (accuracy >= 52) return 'Diamond';
    if (accuracy >= 42) return 'Platinum';
    if (accuracy >= 32) return 'Gold';
    if (accuracy >= 22) return 'Silver';
    return 'Bronze';
  }
  if (score >= 55000) return 'Grandmaster';
  if (score >= 42000) return 'Master';
  if (score >= 30000) return 'Diamond';
  if (score >= 21000) return 'Platinum';
  if (score >= 13000) return 'Gold';
  if (score >= 6500) return 'Silver';
  return 'Bronze';
}

// Game sensitivity to radians-per-mouse-count conversion (yaw)
function getYawPerCount(game: string, inGameSens: number): number {
  const degPerCount = (() => {
    switch (game) {
      case 'valorant':
        return inGameSens * 0.07;
      case 'cs2':
      case 'apex':
        return inGameSens * 0.022;
      case 'overwatch':
        return inGameSens * 0.0066;
      case 'fortnite':
        return inGameSens * 0.005555;
      default:
        return inGameSens * 0.045;
    }
  })();
  return (degPerCount * Math.PI) / 180;
}

interface TargetEntity {
  mesh: THREE.Mesh;
  ringMesh?: THREE.Mesh;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  changeDirAt: number;
  spawnedAt: number;
  gridSlot?: number;
  isCenter?: boolean;
  radius: number;
}

interface ParticleBurst {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

const RANK_COLORS: Record<AimSessionRecord['rank'], string> = {
  Bronze: 'text-amber-600 border-amber-700/60 bg-amber-950/40',
  Silver: 'text-[#ececf0] border-slate-400/50 bg-[#202027]/60',
  Gold: 'text-yellow-300 border-yellow-400/60 bg-yellow-500/15',
  Platinum: 'text-[#f4f4f6] border-white/35 bg-cyan-500/15',
  Diamond: 'text-sky-300 border-sky-400/60 bg-sky-500/20',
  Master: 'text-purple-300 border-purple-400/60 bg-purple-500/20',
  Grandmaster: 'text-rose-300 border-rose-400/60 bg-rose-500/20',
};

export const AimTrainerView: React.FC<AimTrainerViewProps> = ({ store }) => {
  const { activeConfig, profiles, settings, setSettings, aimHistory, recordAimSession } = store;
  const aimCfg = settings.aimSettings;

  const [selectedMode, setSelectedMode] = useState<AimModeId>('gridshot');
  const [recoilWeapon, setRecoilWeapon] = useState<RecoilWeaponId>('ak47');
  const [showRecoilGuide, setShowRecoilGuide] = useState<boolean>(true);
  const [enableWasdStrafe, setEnableWasdStrafe] = useState<boolean>(true);
  const [phase, setPhase] = useState<'lobby' | 'playing' | 'summary'>('lobby');
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [lastResult, setLastResult] = useState<AimSessionRecord | null>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  // Live HUD state (updated smoothly during play)
  const [hud, setHud] = useState({
    score: 0,
    hits: 0,
    misses: 0,
    accuracy: 100,
    streak: 0,
    bestStreak: 0,
    avgReactionMs: 0,
    timeLeft: aimCfg.durationSec,
    isOnTarget: false,
    hitFlash: 0,
    ammoLeft: 30,
    magSize: 30,
  });

  const mountRef = useRef<HTMLDivElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeConfigRef = useRef(activeConfig);
  activeConfigRef.current = activeConfig;
  const secondaryAdsConfigRef = useRef(
    activeConfig.animation.adsSecondaryProfileId
      ? profiles.find((p) => p.id === activeConfig.animation.adsSecondaryProfileId)?.config ?? null
      : null
  );
  secondaryAdsConfigRef.current = activeConfig.animation.adsSecondaryProfileId
    ? profiles.find((p) => p.id === activeConfig.animation.adsSecondaryProfileId)?.config ?? null
    : null;

  const aimCfgRef = useRef(aimCfg);
  aimCfgRef.current = aimCfg;

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Leaderboards & Mode stats
  const modeRecords = useMemo(
    () => aimHistory.filter((r) => r.mode === selectedMode).sort((a, b) => b.score - a.score),
    [aimHistory, selectedMode]
  );

  const dailyRecords = useMemo(
    () => aimHistory.filter((r) => r.mode === 'daily' && r.date === todayStr).sort((a, b) => b.score - a.score),
    [aimHistory, todayStr]
  );

  // Benchmarks for competitive leaderboard comparison
  const benchmarks = useMemo(() => {
    const base =
      selectedMode === 'tracking'
        ? [
            { name: 'Aegis_GM', score: 34200, accuracy: 76.4, rank: 'Grandmaster' as const },
            { name: 'StrafeKing', score: 27800, accuracy: 65.1, rank: 'Master' as const },
            { name: 'Vexel_Pro', score: 21400, accuracy: 54.8, rank: 'Diamond' as const },
            { name: 'KiroFPS', score: 15900, accuracy: 44.2, rank: 'Platinum' as const },
          ]
        : [
            { name: 'Vexel_GM', score: 61400, accuracy: 96.2, rank: 'Grandmaster' as const },
            { name: 'KiroFPS', score: 48200, accuracy: 93.4, rank: 'Master' as const },
            { name: 'NovaFlick', score: 35600, accuracy: 90.8, rank: 'Diamond' as const },
            { name: 'RiftAgent', score: 24100, accuracy: 86.5, rank: 'Platinum' as const },
          ];
    const userBest = (selectedMode === 'daily' ? dailyRecords : modeRecords)[0];
    const merged = [
      ...base.map((b) => ({ ...b, isUser: false })),
      ...(userBest
        ? [
            {
              name: 'YOU (Personal Best)',
              score: userBest.score,
              accuracy: userBest.accuracy,
              rank: userBest.rank,
              isUser: true,
            },
          ]
        : []),
    ];
    return merged.sort((a, b) => b.score - a.score);
  }, [selectedMode, modeRecords, dailyRecords]);

  // 3D WebGL Engine lifecycle when phase === 'playing'
  const finishRunCallbackRef = useRef<(rec: AimSessionRecord) => void>(() => {});
  finishRunCallbackRef.current = (rec: AimSessionRecord) => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (aimCfgRef.current.soundEnabled) aimAudio.playFinish(aimCfgRef.current.soundVolume);
    if (rec.mode !== 'range') {
      recordAimSession(rec);
    }
    setLastResult(rec);
    setPhase('summary');
  };

  useEffect(() => {
    if (phase !== 'playing' || selectedMode === 'reaction') return;
    const container = mountRef.current;
    if (!container) return;

    const modeSpec = MODES.find((m) => m.id === selectedMode) ?? MODES[0];
    const rng = selectedMode === 'daily' ? createSeededRng(`CX-DAILY-${todayStr}`) : Math.random;

    // Three.js Scene setup
    const scene = new THREE.Scene();
    const wallTheme = aimCfgRef.current.wallTheme;
    const bgHex =
      wallTheme === 'sand' ? 0x2a241d : wallTheme === 'cyber' ? 0x10081f : wallTheme === 'grid' ? 0x101826 : 0x090d16;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.Fog(bgHex, 18, 68);

    const camera = new THREE.PerspectiveCamera(
      aimCfgRef.current.fov,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      120
    );
    camera.position.set(0, 1.7, 0);
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Arena Lighting
    const ambient = new THREE.AmbientLight(0xdbeafe, 0.85);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(6, 14, 8);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x00f0ff, 1.4, 45);
    rimLight.position.set(0, 6, -6);
    scene.add(rimLight);

    // Arena Floor & Tactical Grid
    const gridColor1 = wallTheme === 'cyber' ? 0xa855f7 : wallTheme === 'sand' ? 0xd97706 : 0x00f0ff;
    const gridColor2 = wallTheme === 'sand' ? 0x443a2e : 0x1e293b;
    const gridHelper = new THREE.GridHelper(80, 40, gridColor1, gridColor2);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Back Range Wall
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallTheme === 'sand' ? 0x3b3126 : wallTheme === 'cyber' ? 0x1a1033 : 0x111827,
      roughness: 0.88,
      metalness: 0.15,
    });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(54, 22), wallMat);
    backWall.position.set(0, 11, -18);
    scene.add(backWall);

    // Subtle distance bay markers & framing rails on back wall
    const railMat = new THREE.MeshBasicMaterial({ color: gridColor1, transparent: true, opacity: 0.25 });
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(28, 0.06, 0.06), railMat);
    topRail.position.set(0, 6.2, -17.8);
    scene.add(topRail);
    const botRail = new THREE.Mesh(new THREE.BoxGeometry(28, 0.06, 0.06), railMat);
    botRail.position.set(0, 0.6, -17.8);
    scene.add(botRail);

    // Targets management
    const targets: TargetEntity[] = [];
    const particles: ParticleBurst[] = [];
    const targetColorHex = new THREE.Color(aimCfgRef.current.targetColor || '#00f5ff');

    const makeTargetMat = (color: THREE.Color) =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.32),
        roughness: 0.25,
        metalness: 0.2,
      });

    const addTarget = (
      x: number,
      y: number,
      z: number,
      radius: number,
      opts: Partial<TargetEntity> = {}
    ) => {
      const geo =
        selectedMode === 'tracking'
          ? new THREE.CapsuleGeometry(radius * 0.72, radius * 1.65, 10, 18)
          : new THREE.SphereGeometry(radius, 24, 24);
      const mesh = new THREE.Mesh(geo, makeTargetMat(targetColorHex));
      mesh.position.set(x, y, z);
      scene.add(mesh);

      const entity: TargetEntity = {
        mesh,
        hp: opts.maxHp ?? 1,
        maxHp: opts.maxHp ?? 1,
        vx: opts.vx ?? 0,
        vy: opts.vy ?? 0,
        changeDirAt: performance.now() + 500 + rng() * 900,
        spawnedAt: performance.now(),
        gridSlot: opts.gridSlot,
        isCenter: opts.isCenter,
        radius,
      };
      targets.push(entity);
      return entity;
    };

    const removeTarget = (ent: TargetEntity) => {
      scene.remove(ent.mesh);
      ent.mesh.geometry.dispose();
      (ent.mesh.material as THREE.Material).dispose();
      const idx = targets.indexOf(ent);
      if (idx !== -1) targets.splice(idx, 1);
    };

    const spawnBurst = (pos: THREE.Vector3) => {
      const geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
      const mat = new THREE.MeshBasicMaterial({ color: targetColorHex });
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(pos);
        scene.add(m);
        particles.push({
          mesh: m,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.3) * 8,
          vz: (Math.random() - 0.5) * 6,
          life: 0.28,
        });
      }
    };

    // Gridshot 5x5 grid positions
    const gridPos = (slot: number): [number, number, number] => {
      const col = slot % 5;
      const row = Math.floor(slot / 5);
      return [(col - 2) * 1.85, 2.2 + (row - 1) * 1.45, -13];
    };

    const spawnGridshotOne = (avoidSlots: number[]) => {
      const free: number[] = [];
      for (let i = 0; i < 20; i++) {
        if (!avoidSlots.includes(i)) free.push(i);
      }
      const slot = free[Math.floor(rng() * free.length)] ?? 0;
      const [x, y, z] = gridPos(slot);
      addTarget(x, y, z, 0.62, { gridSlot: slot });
    };

    const spawnSpiderNext = (spawnCenter: boolean) => {
      if (spawnCenter) {
        addTarget(0, 2.3, -13, 0.55, { isCenter: true });
      } else {
        const angle = rng() * Math.PI * 2;
        const dist = 2.6 + rng() * 3.2;
        const x = Math.cos(angle) * dist;
        const y = Math.max(0.9, Math.min(5.2, 2.3 + Math.sin(angle) * dist * 0.55));
        addTarget(x, y, -13, 0.44 + rng() * 0.15, { isCenter: false });
      }
    };

    const spawnMicroOne = () => {
      const x = (rng() - 0.5) * 4.4;
      const y = 1.6 + rng() * 2.4;
      addTarget(x, y, -14, 0.28);
    };

    const spawnSwitchBot = () => {
      const x = (rng() - 0.5) * 10;
      const y = 1.6 + rng() * 3.0;
      const z = -12 - rng() * 4;
      addTarget(x, y, z, 0.55, {
        maxHp: 100,
        hp: 100,
        vx: (rng() > 0.5 ? 1 : -1) * (2.8 + rng() * 2.6),
        vy: (rng() - 0.5) * 1.1,
      });
    };

    // Recoil Control Lab target wall, bullseye rings, ghost guide & bullet holes
    const weaponSpec = WEAPON_PATTERNS[recoilWeapon] ?? WEAPON_PATTERNS.ak47;
    const recoilWallZ = -13.5;
    const recoilBullseyeY = 2.3;
    const bulletDecals: THREE.Mesh[] = [];
    let recoilGhostMesh: THREE.Mesh | null = null;
    let recoilBulletIndex = 0;
    let nextFireAt = 0;
    let reloadUntil = 0;
    let cumKickPitch = 0;
    let cumKickYaw = 0;

    const clearBulletDecals = () => {
      for (const d of bulletDecals) {
        scene.remove(d);
        d.geometry.dispose();
        (d.material as THREE.Material).dispose();
      }
      bulletDecals.length = 0;
    };

    if (selectedMode === 'recoil') {
      // Tactical bullseye target board
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(7.2, 6.2),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
      );
      board.position.set(0, recoilBullseyeY, recoilWallZ);
      scene.add(board);

      const addRing = (inner: number, outer: number, hex: number, zOff: number) => {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(inner, outer, 48),
          new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide })
        );
        ring.position.set(0, recoilBullseyeY, recoilWallZ + zOff);
        scene.add(ring);
      };
      addRing(0, 0.36, 0x10f59b, 0.02); // Tight head bullseye
      addRing(0.38, 0.78, 0x00f0ff, 0.018); // Inner chest zone
      addRing(0.80, 1.45, 0x334155, 0.015); // Outer ring

      if (showRecoilGuide) {
        recoilGhostMesh = new THREE.Mesh(
          new THREE.RingGeometry(0.14, 0.22, 24),
          new THREE.MeshBasicMaterial({ color: 0xffbe0b, side: THREE.DoubleSide })
        );
        recoilGhostMesh.position.set(0, recoilBullseyeY, recoilWallZ + 0.05);
        scene.add(recoilGhostMesh);
      }
    } else if (selectedMode === 'gridshot' || selectedMode === 'daily') {
      const used: number[] = [];
      for (let i = 0; i < 3; i++) {
        spawnGridshotOne(used);
        used.push(targets[targets.length - 1].gridSlot!);
      }
    } else if (selectedMode === 'spidershot') {
      spawnSpiderNext(true);
    } else if (selectedMode === 'microshot') {
      for (let i = 0; i < 3; i++) spawnMicroOne();
    } else if (selectedMode === 'tracking') {
      addTarget(0, 2.2, -13, 0.58, { vx: 4.2, vy: 0.6, maxHp: 999999 });
    } else if (selectedMode === 'switchtrack') {
      for (let i = 0; i < 3; i++) spawnSwitchBot();
    } else if (selectedMode === 'range') {
      // 10m close, 25m mid strafer, 50m long-range precision
      addTarget(-3.5, 1.9, -9, 0.45);
      addTarget(0, 2.1, -14, 0.55, { vx: 3.4, vy: 0 });
      addTarget(3.8, 2.3, -15, 0.35);
      addTarget(-1.5, 2.8, -22, 0.42, { vx: -2.5, vy: 0 });
      addTarget(1.8, 2.0, -28, 0.5);
    }

    // Gameplay telemetry state + 3D WASD strafe-dodge kinematics
    let yaw = 0;
    let pitch = 0;
    let playerX = 0;
    let playerZ = 0;
    let playerY = 1.7;
    let playerVy = 0;
    const keysDown = new Set<string>();
    let score = 0;
    let hits = 0;
    let misses = 0;
    let streak = 0;
    let bestStreak = 0;
    let reactionSum = 0;
    let reactionCount = 0;
    let trackSamplesOn = 0;
    let trackSamplesTotal = 0;
    let hitFlash = 0;
    let lastTrackTickAt = 0;
    let lastHudSyncAt = 0;
    const durationSec = modeSpec.isSandbox ? 9999 : aimCfgRef.current.durationSec;
    const startedAt = performance.now();
    let ended = false;

    const raycaster = new THREE.Raycaster();
    const screenCenter = new THREE.Vector2(0, 0);
    const localInput: LiveInputState = structuredClone(DEFAULT_INPUT_STATE);
    const animCtrl = new CrosshairAnimationController();

    const performSingleShot = () => {
      animCtrl.triggerManualFirePulse();
      raycaster.setFromCamera(screenCenter, camera);
      const hitsList = raycaster.intersectObjects(targets.map((t) => t.mesh), false);
      if (hitsList.length > 0) {
        const hitMesh = hitsList[0].object as THREE.Mesh;
        const ent = targets.find((t) => t.mesh === hitMesh);
        if (ent) {
          hits++;
          streak++;
          bestStreak = Math.max(bestStreak, streak);
          hitFlash = 1;
          const rt = Math.min(2500, Math.max(80, performance.now() - ent.spawnedAt));
          reactionSum += rt;
          reactionCount++;
          const speedBonus = Math.max(100, Math.round(700 - rt * 0.5));
          const comboMult = 1 + Math.min(2.0, streak * 0.08);
          score += Math.round((450 + speedBonus) * comboMult);

          if (aimCfgRef.current.soundEnabled) aimAudio.playHit(aimCfgRef.current.soundVolume, streak);
          spawnBurst(ent.mesh.position.clone());

          const oldSlot = ent.gridSlot;
          const wasCenter = ent.isCenter;
          removeTarget(ent);

          if (selectedMode === 'gridshot' || selectedMode === 'daily') {
            const occupied = targets.map((t) => t.gridSlot ?? -1);
            if (oldSlot !== undefined) occupied.push(oldSlot);
            spawnGridshotOne(occupied);
          } else if (selectedMode === 'spidershot') {
            spawnSpiderNext(!wasCenter);
          } else if (selectedMode === 'microshot') {
            spawnMicroOne();
          } else if (selectedMode === 'range') {
            const nx = (Math.random() - 0.5) * 9;
            const ny = 1.4 + Math.random() * 2.6;
            const nz = -9 - Math.random() * 14;
            addTarget(nx, ny, nz, 0.35 + Math.random() * 0.25, {
              vx: Math.random() > 0.5 ? (Math.random() - 0.5) * 5 : 0,
            });
          }
          return;
        }
      }
      // Missed shot
      misses++;
      streak = 0;
      score = Math.max(0, score - 120);
      if (aimCfgRef.current.soundEnabled) aimAudio.playMiss(aimCfgRef.current.soundVolume);
    };

    // Raw-input pointer lock + warp-spike guard (eliminates Chromium high-polling mouse jerks)
    let lockAcquiredAt = 0;
    let ignoreInitialMoves = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      // Drop synthetic cursor-recenter events right after acquiring pointer lock
      if (ignoreInitialMoves > 0 || performance.now() - lockAcquiredAt < 45) {
        ignoreInitialMoves = Math.max(0, ignoreInitialMoves - 1);
        return;
      }
      const dx = e.movementX;
      const dy = e.movementY;
      // Filter impossible single-packet OS cursor-warp spikes (Chromium Pointer Lock bug)
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 260 || Math.abs(dy) > 260) {
        return;
      }
      const radPerCount = getYawPerCount(aimCfgRef.current.gamePreset, aimCfgRef.current.inGameSens);
      const adsScale = localInput.rmb ? 0.65 : 1.0;
      yaw -= dx * radPerCount * adsScale;
      pitch -= dy * radPerCount * adsScale;
      const maxPitch = Math.PI * 0.44;
      pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    };

    const safeRequestPointerLock = () => {
      try {
        const el = renderer.domElement as HTMLCanvasElement & {
          requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
        };
        const res = el.requestPointerLock?.({ unadjustedMovement: true });
        if (res && typeof (res as Promise<void>).catch === 'function') {
          (res as Promise<void>).catch(() => {
            try {
              const fb = el.requestPointerLock?.();
              if (fb && typeof (fb as Promise<void>).catch === 'function') (fb as Promise<void>).catch(() => {});
            } catch {
              // Ignore in restricted contexts
            }
          });
        }
      } catch {
        try {
          renderer.domElement.requestPointerLock?.();
        } catch {
          // Ignore
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) {
        safeRequestPointerLock();
        return;
      }
      if (e.button === 0) {
        localInput.lmb = true;
        if (!modeSpec.isTracking && selectedMode !== 'recoil') performSingleShot();
      } else if (e.button === 2) {
        localInput.rmb = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) localInput.lmb = false;
      else if (e.button === 2) localInput.rmb = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysDown.add(k);
      if (k === 'w' || k === 'a' || k === 's' || k === 'd') localInput.moving = true;
      if (k === 'shift') localInput.sprint = true;
      if (k === 'control') localInput.crouch = true;
      if (k === ' ') localInput.jump = true;
      if (k === 'r' && selectedMode === 'recoil') {
        recoilBulletIndex = 0;
        cumKickPitch = 0;
        cumKickYaw = 0;
        reloadUntil = performance.now() + 350;
        clearBulletDecals();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysDown.delete(k);
      localInput.moving = keysDown.has('w') || keysDown.has('a') || keysDown.has('s') || keysDown.has('d');
      if (k === 'shift') localInput.sprint = false;
      if (k === 'control') localInput.crouch = false;
      if (k === ' ') localInput.jump = false;
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      if (locked) {
        lockAcquiredAt = performance.now();
        ignoreInitialMoves = 2;
      }
      setIsPointerLocked(locked);
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    // Auto-request pointer lock safely on enter
    safeRequestPointerLock();

    let rafId = 0;
    let lastTime = performance.now();
    let activeElapsedSec = 0;

    const animate = (now: number) => {
      if (ended) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const isLockedNow = document.pointerLockElement === renderer.domElement;
      if (isLockedNow) {
        activeElapsedSec += dt;
      }
      const timeLeft = modeSpec.isSandbox ? 999 : Math.max(0, durationSec - activeElapsedSec);

      if (!modeSpec.isSandbox && timeLeft <= 0) {
        ended = true;
        const acc = modeSpec.isTracking
          ? trackSamplesTotal > 0
            ? (trackSamplesOn / trackSamplesTotal) * 100
            : 0
          : hits + misses > 0
          ? (hits / (hits + misses)) * 100
          : 0;
        const avgRt = reactionCount > 0 ? Math.round(reactionSum / reactionCount) : 0;
        finishRunCallbackRef.current({
          id: `aim-${Date.now()}`,
          mode: selectedMode,
          date: todayStr,
          timestamp: Date.now(),
          score: Math.round(score),
          accuracy: Number(acc.toFixed(1)),
          hits,
          misses,
          avgReactionMs: avgRt,
          durationSec,
          bestStreak,
          crosshairName: activeConfigRef.current.name,
          rank: computeRank(selectedMode, score, acc),
        });
        return;
      }

      // Smooth ADS FOV zoom + WASD Strafe-Dodging 3D Movement
      const targetFov = localInput.rmb ? aimCfgRef.current.fov * 0.78 : aimCfgRef.current.fov;
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 16);
      camera.updateProjectionMatrix();

      if (enableWasdStrafe && isLockedNow && selectedMode !== 'recoil') {
        const moveSpeed = localInput.crouch ? 2.6 : localInput.sprint ? 6.8 : 4.8;
        let mx = 0;
        let mz = 0;
        if (keysDown.has('w')) mz -= 1;
        if (keysDown.has('s')) mz += 1;
        if (keysDown.has('a')) mx -= 1;
        if (keysDown.has('d')) mx += 1;
        if (mx !== 0 || mz !== 0) {
          const len = Math.hypot(mx, mz);
          mx /= len;
          mz /= len;
          const sinY = Math.sin(yaw);
          const cosY = Math.cos(yaw);
          playerX += (mx * cosY + mz * sinY) * moveSpeed * dt;
          playerZ += (mz * cosY - mx * sinY) * moveSpeed * dt;
          playerX = Math.max(-5.5, Math.min(5.5, playerX));
          playerZ = Math.max(-2.5, Math.min(2.5, playerZ));
        }
        const groundY = localInput.crouch ? 1.15 : 1.7;
        if (keysDown.has(' ') && Math.abs(playerY - groundY) < 0.04) {
          playerVy = 4.6;
        }
        playerVy -= 13.5 * dt;
        playerY += playerVy * dt;
        if (playerY <= groundY) {
          playerY = groundY;
          playerVy = 0;
        }
        camera.position.set(playerX, playerY, playerZ);
      }

      // Recoil Control Lab full-auto spray simulation & bullet impact wall
      if (selectedMode === 'recoil' && isLockedNow) {
        if (localInput.lmb && now >= nextFireAt && now >= reloadUntil) {
          const intervalMs = 60000 / weaponSpec.rpm;
          nextFireAt = now + intervalMs;
          const kick = weaponSpec.kicks[recoilBulletIndex] ?? [0.002, 0];

          // Compute exact ray hit on recoil wall at z = recoilWallZ BEFORE adding next kick
          raycaster.setFromCamera(screenCenter, camera);
          const tHit = (recoilWallZ - raycaster.ray.origin.z) / raycaster.ray.direction.z;
          if (tHit > 0) {
            const hitPt = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, tHit);
            const distFromBull = Math.hypot(hitPt.x, hitPt.y - recoilBullseyeY);
            const isBullseye = distFromBull <= 0.38;
            const isInner = distFromBull <= 0.80;

            if (isBullseye) {
              hits++;
              streak++;
              bestStreak = Math.max(bestStreak, streak);
              score += 520 + Math.min(240, streak * 12);
              hitFlash = 1;
              if (aimCfgRef.current.soundEnabled) aimAudio.playHit(aimCfgRef.current.soundVolume, streak);
            } else if (isInner) {
              hits++;
              score += 240;
              if (aimCfgRef.current.soundEnabled) aimAudio.playTrackTick(aimCfgRef.current.soundVolume);
            } else {
              misses++;
              streak = 0;
              if (aimCfgRef.current.soundEnabled) aimAudio.playMiss(aimCfgRef.current.soundVolume);
            }

            const decalColor = isBullseye ? 0x10f59b : isInner ? 0x00f0ff : 0xff3358;
            const decal = new THREE.Mesh(
              new THREE.CircleGeometry(0.065, 10),
              new THREE.MeshBasicMaterial({ color: decalColor })
            );
            decal.position.set(hitPt.x, hitPt.y, recoilWallZ + 0.03 + bulletDecals.length * 0.0005);
            scene.add(decal);
            bulletDecals.push(decal);
            if (bulletDecals.length > 60) {
              const old = bulletDecals.shift();
              if (old) {
                scene.remove(old);
                old.geometry.dispose();
                (old.material as THREE.Material).dispose();
              }
            }
          }

          // Apply realistic upward + horizontal recoil kick to camera
          animCtrl.triggerManualFirePulse();
          pitch = Math.min(Math.PI * 0.44, pitch + kick[0]);
          yaw -= kick[1];
          cumKickPitch += kick[0];
          cumKickYaw += kick[1];
          recoilBulletIndex++;

          if (recoilBulletIndex >= weaponSpec.magSize) {
            recoilBulletIndex = 0;
            cumKickPitch = 0;
            cumKickYaw = 0;
            reloadUntil = now + 750;
            if (aimCfgRef.current.soundEnabled) aimAudio.playKill(aimCfgRef.current.soundVolume);
            setTimeout(() => clearBulletDecals(), 650);
          }
        } else if (!localInput.lmb && recoilBulletIndex > 0) {
          // Smooth recoil reset on trigger release
          recoilBulletIndex = Math.max(0, recoilBulletIndex - 1);
          cumKickPitch *= Math.max(0, 1 - dt * 8);
          cumKickYaw *= Math.max(0, 1 - dt * 8);
        }

        // Update optional yellow ghost guide showing inverse pull-down path
        if (recoilGhostMesh) {
          const distToWall = Math.abs(recoilWallZ - camera.position.z);
          recoilGhostMesh.position.set(
            -Math.tan(cumKickYaw) * distToWall * 0.65,
            recoilBullseyeY - Math.tan(cumKickPitch) * distToWall * 0.65,
            recoilWallZ + 0.06
          );
        }
      }

      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // Update moving targets
      for (const ent of targets) {
        if (ent.vx !== 0 || ent.vy !== 0) {
          ent.mesh.position.x += ent.vx * dt;
          ent.mesh.position.y += ent.vy * dt;

          if (ent.mesh.position.x > 6.5) {
            ent.mesh.position.x = 6.5;
            ent.vx = -Math.abs(ent.vx);
          } else if (ent.mesh.position.x < -6.5) {
            ent.mesh.position.x = -6.5;
            ent.vx = Math.abs(ent.vx);
          }
          if (ent.mesh.position.y > 4.9) {
            ent.mesh.position.y = 4.9;
            ent.vy = -Math.abs(ent.vy);
          } else if (ent.mesh.position.y < 1.1) {
            ent.mesh.position.y = 1.1;
            ent.vy = Math.abs(ent.vy);
          }

          if ((selectedMode === 'tracking' || selectedMode === 'switchtrack') && now > ent.changeDirAt) {
            ent.changeDirAt = now + 450 + rng() * 950;
            const speed = selectedMode === 'tracking' ? 3.2 + rng() * 3.8 : 2.5 + rng() * 2.8;
            ent.vx = (rng() > 0.5 ? 1 : -1) * speed;
            ent.vy = (rng() - 0.5) * 1.8;
          }
        }
      }

      // Tracking / SwitchTrack continuous raycast
      let isOnTarget = false;
      if (modeSpec.isTracking && document.pointerLockElement === renderer.domElement) {
        raycaster.setFromCamera(screenCenter, camera);
        const hitsList = raycaster.intersectObjects(targets.map((t) => t.mesh), false);
        isOnTarget = hitsList.length > 0;
        const trackingActive = localInput.lmb || selectedMode === 'tracking';

        if (trackingActive) {
          trackSamplesTotal++;
          if (isOnTarget) {
            trackSamplesOn++;
            const hitEnt = targets.find((t) => t.mesh === hitsList[0].object);
            if (hitEnt) {
              const mat = hitEnt.mesh.material as THREE.MeshStandardMaterial;
              mat.emissive.setHex(0x10f59b);
              score += dt * 760;
              if (now - lastTrackTickAt > 95) {
                lastTrackTickAt = now;
                if (aimCfgRef.current.soundEnabled) aimAudio.playTrackTick(aimCfgRef.current.soundVolume);
              }
              if (selectedMode === 'switchtrack' && localInput.lmb) {
                hitEnt.hp -= dt * 210;
                const ratio = Math.max(0.25, hitEnt.hp / hitEnt.maxHp);
                hitEnt.mesh.scale.setScalar(0.7 + ratio * 0.3);
                if (hitEnt.hp <= 0) {
                  hits++;
                  streak++;
                  bestStreak = Math.max(bestStreak, streak);
                  score += 850;
                  hitFlash = 1;
                  if (aimCfgRef.current.soundEnabled) aimAudio.playKill(aimCfgRef.current.soundVolume);
                  spawnBurst(hitEnt.mesh.position.clone());
                  removeTarget(hitEnt);
                  spawnSwitchBot();
                }
              }
            }
          } else {
            for (const ent of targets) {
              (ent.mesh.material as THREE.MeshStandardMaterial).emissive.copy(
                targetColorHex.clone().multiplyScalar(0.3)
              );
            }
          }
        }
      }

      // Update shatter particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.28));
        if (p.life <= 0) {
          scene.remove(p.mesh);
          particles.splice(i, 1);
        }
      }

      hitFlash = Math.max(0, hitFlash - dt * 5.5);

      renderer.render(scene, camera);

      // Render user's exact custom crosshair on the transparent HUD canvas
      const hudCanvas = hudCanvasRef.current;
      if (hudCanvas) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        if (hudCanvas.width !== Math.round(w * dpr) || hudCanvas.height !== Math.round(h * dpr)) {
          hudCanvas.width = Math.round(w * dpr);
          hudCanvas.height = Math.round(h * dpr);
        }
        const hctx = hudCanvas.getContext('2d');
        if (hctx) {
          hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const frame = animCtrl.step(activeConfigRef.current, localInput, dt);
          const cfgToDraw =
            frame.useSecondaryProfile && secondaryAdsConfigRef.current
              ? secondaryAdsConfigRef.current
              : activeConfigRef.current;
          renderCrosshairCanvas(hctx, w, h, cfgToDraw, frame, {
            zoom: 1,
            ignorePositionOffset: true,
          });
        }
      }

      // Update React telemetry HUD at ~20Hz
      if (now - lastHudSyncAt > 50) {
        lastHudSyncAt = now;
        const acc = modeSpec.isTracking
          ? trackSamplesTotal > 0
            ? (trackSamplesOn / trackSamplesTotal) * 100
            : 100
          : hits + misses > 0
          ? (hits / (hits + misses)) * 100
          : 100;
        setHud({
          score: Math.round(score),
          hits,
          misses,
          accuracy: Number(acc.toFixed(1)),
          streak,
          bestStreak,
          avgReactionMs: reactionCount > 0 ? Math.round(reactionSum / reactionCount) : 0,
          timeLeft,
          isOnTarget,
          hitFlash,
          ammoLeft: Math.max(0, weaponSpec.magSize - recoilBulletIndex),
          magSize: weaponSpec.magSize,
        });
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      ended = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
      renderer.dispose();
    };
  }, [phase, selectedMode, todayStr, recoilWeapon, showRecoilGuide, enableWasdStrafe]);

  const startSession = useCallback((mode?: AimModeId) => {
    if (mode) setSelectedMode(mode);
    setLastResult(null);
    setPhase('playing');
  }, []);

  const currentModeSpec = MODES.find((m) => m.id === selectedMode) ?? MODES[0];
  const cmPer360 = useMemo(() => {
    const radPerCount = getYawPerCount(aimCfg.gamePreset, aimCfg.inGameSens);
    const countsPer360 = (Math.PI * 2) / Math.max(0.00001, radPerCount);
    const inches = countsPer360 / Math.max(100, aimCfg.dpi);
    return (inches * 2.54).toFixed(1);
  }, [aimCfg.gamePreset, aimCfg.inGameSens, aimCfg.dpi]);

  // =================== REACTION BENCHMARK PLAYING VIEW ===================
  if (phase === 'playing' && selectedMode === 'reaction') {
    return (
      <ReactionBenchmarkView
        soundEnabled={aimCfg.soundEnabled}
        soundVolume={aimCfg.soundVolume}
        crosshairName={activeConfig.name}
        onComplete={(rec) => finishRunCallbackRef.current(rec)}
        onExit={() => setPhase('lobby')}
      />
    );
  }

  // =================== PLAYING VIEW (BESPOKE AEROSPACE TELEMETRY HUD) ===================
  if (phase === 'playing') {
    const pctLeft = currentModeSpec.isSandbox ? 100 : (hud.timeLeft / Math.max(1, aimCfg.durationSec)) * 100;
    return (
      <div className="relative w-full h-full bg-[#0c0c0e] overflow-hidden select-none">
        {/* 3D WebGL Arena */}
        <div ref={mountRef} className="w-full h-full" />

        {/* Live User Crosshair Canvas */}
        <canvas ref={hudCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Clean Competitive Esports Top Scoreboard HUD */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-5 px-5 py-2 rounded-lg bg-[#0c0c0e]/85 border border-white/10">
          <div className="text-center min-w-[68px]">
            <div className="text-[9px] uppercase tracking-wider text-[#8c8c9a]">Score</div>
            <div className="text-base font-semibold font-mono text-white tabular-nums leading-tight">
              {hud.score.toLocaleString()}
            </div>
          </div>

          <div className="w-px h-6 bg-white/10" />

          <div className="text-center min-w-[64px]">
            <div className="text-[9px] uppercase tracking-wider text-[#8c8c9a]">
              {currentModeSpec.isSandbox ? 'Mode' : 'Time'}
            </div>
            <div
              className={`text-lg font-semibold font-mono tabular-nums leading-tight ${
                !currentModeSpec.isSandbox && hud.timeLeft <= 8 ? 'text-[#ff5526]' : 'text-white'
              }`}
            >
              {currentModeSpec.isSandbox ? 'Free' : `${hud.timeLeft.toFixed(1)}s`}
            </div>
          </div>

          <div className="w-px h-6 bg-white/10" />

          <div className="text-center min-w-[56px]">
            <div className="text-[9px] uppercase tracking-wider text-[#8c8c9a]">Acc</div>
            <div className="text-base font-semibold font-mono text-[#e4e4e8] tabular-nums leading-tight">
              {hud.accuracy}%
            </div>
          </div>

          <div className="w-px h-6 bg-white/10" />

          <div className="text-center min-w-[54px]">
            <div className="text-[9px] uppercase tracking-wider text-[#8c8c9a]">Streak</div>
            <div className="text-base font-semibold font-mono text-[#e4e4e8] tabular-nums leading-tight flex items-center justify-center gap-1">
              {hud.streak >= 5 && <Flame className="w-3.5 h-3.5 text-[#ff5526]" />}
              {hud.streak}
            </div>
          </div>

          {!currentModeSpec.isTracking && (
            <>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center min-w-[58px]">
                <div className="text-[9px] uppercase tracking-wider text-[#8c8c9a]">Avg TTK</div>
                <div className="text-sm font-medium font-mono text-[#c4c4cf] tabular-nums leading-tight">
                  {hud.avgReactionMs}ms
                </div>
              </div>
            </>
          )}
        </div>

        {/* Crisp 2px Top Timer Hairline */}
        {!currentModeSpec.isSandbox && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/10 pointer-events-none">
            <div
              className="h-full bg-[#ff5526] transition-all duration-100"
              style={{ width: `${Math.max(0, Math.min(100, pctLeft))}%` }}
            />
          </div>
        )}

        {/* Tracking Lock Indicator */}
        {currentModeSpec.isTracking && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 pointer-events-none">
            <span
              className={`text-[11px] font-mono font-bold px-3 py-1 rounded-full border transition ${
                hud.isOnTarget
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                  : 'bg-[#0e0e11] border-[#2c2c35] text-[#9696a4]'
              }`}
            >
              {hud.isOnTarget ? '● TARGET LOCKED' : '○ ACQUIRE TARGET'}
            </span>
          </div>
        )}

        {/* Bottom Minimal Telemetry Strip */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-none text-[11px] font-mono text-[#9696a4]">
          <div className="px-2.5 py-1 rounded-lg bg-black/55 border border-white/10">
            MODE: <span className="text-[#f4f4f6]">{currentModeSpec.name.toUpperCase()}</span>
            {selectedMode === 'recoil' && (
              <>
                {' '}• WEAPON: <span className="text-amber-300">{WEAPON_PATTERNS[recoilWeapon].name}</span> • MAG:{' '}
                <span className="text-emerald-300">
                  {hud.ammoLeft}/{hud.magSize}
                </span>{' '}
                (R: Reset)
              </>
            )}
            {selectedMode !== 'recoil' && enableWasdStrafe && (
              <>
                {' '}• <span className="text-emerald-300">WASD STRAFE ON</span>
              </>
            )}
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-black/55 border border-white/10">
            SENS: <span className="text-emerald-300">{cmPer360} cm/360°</span> • Press <span className="text-white">ESC</span> to Pause / Exit
          </div>
        </div>

        {/* Pause / Pointer Unlock Overlay */}
        {!isPointerLocked && (
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-20">
            <div className="rounded-lg bg-[#141418] border border-[#2c2c35] p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
              <div className="w-10 h-10 rounded-lg bg-[#1c1c22] border border-[#2b2b34] flex items-center justify-center mx-auto">
                <Crosshair className="w-5 h-5 text-[#e4e4e8]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{currentModeSpec.name}</h3>
                <p className="text-xs text-[#8c8c9a] mt-1">
                  Click Resume to lock the cursor into first-person view. Hold right-click to test ADS behavior.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = mountRef.current?.querySelector('canvas') as (HTMLCanvasElement & {
                      requestPointerLock?: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
                    }) | null;
                    try {
                      const res = el?.requestPointerLock?.({ unadjustedMovement: true });
                      if (res && typeof (res as Promise<void>).catch === 'function') {
                        (res as Promise<void>).catch(() => {
                          try {
                            const fb = el?.requestPointerLock?.();
                            if (fb && typeof (fb as Promise<void>).catch === 'function') (fb as Promise<void>).catch(() => {});
                          } catch {}
                        });
                      }
                    } catch {
                      // Ignore
                    }
                  }}
                  className="w-full py-2 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] font-semibold text-xs cursor-pointer"
                >
                  Resume
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPhase('lobby');
                      setTimeout(() => setPhase('playing'), 20);
                    }}
                    className="py-2 rounded-xl bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-xs font-semibold text-[#ececf0] cursor-pointer flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restart
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase('lobby')}
                    className="py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-xs font-semibold text-rose-200 cursor-pointer"
                  >
                    Exit to Lobby
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =================== SUMMARY VIEW ===================
  if (phase === 'summary' && lastResult) {
    return (
      <div className="h-full flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-xl w-full rounded-lg bg-[#141418] border border-[#2e2e38] p-6 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#23232a] pb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#a1a1ad]">
                SESSION DEBRIEF • {lastResult.mode.toUpperCase()}
              </span>
              <h2 className="text-xl font-semibold text-white mt-0.5">Range Run Complete</h2>
            </div>
            <span className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold tracking-wider ${RANK_COLORS[lastResult.rank]}`}>
              {lastResult.rank.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#0e0e11] border border-[#23232a] p-3 text-center">
              <div className="text-[10px] font-mono text-[#727280]">FINAL SCORE</div>
              <div className="text-xl font-semibold font-mono text-[#f4f4f6] mt-1">{lastResult.score.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-[#0e0e11] border border-[#23232a] p-3 text-center">
              <div className="text-[10px] font-mono text-[#727280]">ACCURACY</div>
              <div className="text-xl font-semibold font-mono text-emerald-300 mt-1">{lastResult.accuracy}%</div>
            </div>
            <div className="rounded-xl bg-[#0e0e11] border border-[#23232a] p-3 text-center">
              <div className="text-[10px] font-mono text-[#727280]">AVG REACTION</div>
              <div className="text-xl font-semibold font-mono text-white mt-1">{lastResult.avgReactionMs}ms</div>
            </div>
            <div className="rounded-xl bg-[#0e0e11] border border-[#23232a] p-3 text-center">
              <div className="text-[10px] font-mono text-[#727280]">BEST STREAK</div>
              <div className="text-xl font-semibold font-mono text-amber-300 mt-1">{lastResult.bestStreak}</div>
            </div>
          </div>

          <div className="rounded-xl bg-[#0e0e11] border border-[#23232a] p-3 flex items-center justify-between text-xs text-[#9696a4]">
            <span>
              Targets Hit: <strong className="text-white">{lastResult.hits}</strong> • Missed:{' '}
              <strong className="text-rose-300">{lastResult.misses}</strong>
            </span>
            <span>
              Crosshair Used: <strong className="text-[#f4f4f6]">{lastResult.crosshairName}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => startSession(lastResult.mode)}
              className="flex-1 py-2.5 rounded-xl bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] font-semibold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" /> PLAY AGAIN
            </button>
            <button
              type="button"
              onClick={() => setPhase('lobby')}
              className="flex-1 py-2.5 rounded-xl bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-[#ececf0] font-bold text-xs cursor-pointer"
            >
              Return to Range Hub
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =================== LOBBY VIEW ===================
  return (
    <div className="h-full flex flex-col p-4 overflow-y-auto gap-4">
      {/* Lobby Header */}
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Aim trainer</h2>
          <p className="text-xs text-[#8c8c9a] mt-0.5 max-w-2xl">
            Practice flicking, tracking, recoil control, and reaction time with <strong className="text-[#e4e4e8]">{activeConfig.name}</strong> ({cmPer360} cm/360°).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowSettingsDrawer((v) => !v)}
            className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              showSettingsDrawer
                ? 'bg-[#25252e] border-[#3d3d4a] text-white'
                : 'bg-[#18181e] border-[#292932] text-[#d0d0d8] hover:text-white'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Sensitivity & arena
          </button>
          <button
            type="button"
            onClick={() => startSession(selectedMode)}
            className="px-4 py-2 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-[#0c0c0e]" /> Start {currentModeSpec.name}
          </button>
        </div>
      </div>

      {/* Collapsible Sensitivity Converter & Arena Settings */}
      {showSettingsDrawer && (
        <div className="rounded-lg bg-[#141418] border border-[#2c2c35] p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#d0d0d8]">Game Sensitivity Profile</label>
            <select
              value={aimCfg.gamePreset}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  aimSettings: {
                    ...s.aimSettings,
                    gamePreset: e.target.value as typeof s.aimSettings.gamePreset,
                  },
                }))
              }
              className="w-full px-2.5 py-2 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs text-white"
            >
              <option value="valorant">VALORANT</option>
              <option value="cs2">Counter-Strike 2 (CS2)</option>
              <option value="apex">Apex Legends</option>
              <option value="overwatch">Overwatch 2</option>
              <option value="fortnite">Fortnite</option>
              <option value="custom">Generic / Custom</option>
            </select>
            <div className="text-[10px] font-mono text-emerald-400">Calculated: {cmPer360} cm / 360°</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#d0d0d8]">In-Game Sens</label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="30"
                value={aimCfg.inGameSens}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    aimSettings: { ...s.aimSettings, inGameSens: Math.max(0.05, Number(e.target.value) || 0.35) },
                  }))
                }
                className="w-full px-2.5 py-2 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs font-mono text-[#f4f4f6]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#d0d0d8]">Mouse DPI</label>
              <input
                type="number"
                step="100"
                min="200"
                max="16000"
                value={aimCfg.dpi}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    aimSettings: { ...s.aimSettings, dpi: Math.max(200, Number(e.target.value) || 800) },
                  }))
                }
                className="w-full px-2.5 py-2 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs font-mono text-[#f4f4f6]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#d0d0d8]">FOV ({aimCfg.fov}°)</label>
              <input
                type="range"
                min={70}
                max={120}
                value={aimCfg.fov}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    aimSettings: { ...s.aimSettings, fov: Number(e.target.value) },
                  }))
                }
                className="studio-slider w-full mt-2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#d0d0d8]">Run Timer</label>
              <select
                value={aimCfg.durationSec}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    aimSettings: { ...s.aimSettings, durationSec: Number(e.target.value) },
                  }))
                }
                className="w-full px-2.5 py-2 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs text-white"
              >
                <option value={30}>30 Seconds</option>
                <option value={45}>45 Seconds</option>
                <option value={60}>60 Seconds</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1 flex-1">
              <label className="text-[11px] font-semibold text-[#d0d0d8]">Arena & Target</label>
              <div className="flex items-center gap-2">
                <select
                  value={aimCfg.wallTheme}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      aimSettings: { ...s.aimSettings, wallTheme: e.target.value as typeof s.aimSettings.wallTheme },
                    }))
                  }
                  className="flex-1 px-2 py-1.5 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs text-white"
                >
                  <option value="obsidian">Obsidian</option>
                  <option value="grid">Tactical Slate</option>
                  <option value="sand">Desert Bay</option>
                  <option value="cyber">Neon Cyber</option>
                </select>
                <input
                  type="color"
                  value={aimCfg.targetColor}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      aimSettings: { ...s.aimSettings, targetColor: e.target.value },
                    }))
                  }
                  className="w-8 h-8 rounded border border-[#2c2c35] bg-transparent cursor-pointer"
                  title="Target Sphere Color"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  aimSettings: { ...s.aimSettings, soundEnabled: !s.aimSettings.soundEnabled },
                }))
              }
              className="mt-5 p-2 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-[#f4f4f6] cursor-pointer"
              title="Toggle Hit Audio"
            >
              {aimCfg.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-[#727280]" />}
            </button>
          </div>
        </div>
      )}

      {/* Recoil Weapon Bar & WASD Strafe-Dodge Quick Strip */}
      <div className="rounded-xl bg-[#141418] border border-[#23232a] px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#727280]">Recoil Weapon:</span>
          {(['ak47', 'vandal', 'phantom'] as RecoilWeaponId[]).map((wid) => (
            <button
              key={wid}
              type="button"
              onClick={() => setRecoilWeapon(wid)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                recoilWeapon === wid
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                  : 'bg-[#18181e] border-[#23232a] text-[#9696a4] hover:text-white'
              }`}
            >
              {WEAPON_PATTERNS[wid].name} ({WEAPON_PATTERNS[wid].game})
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowRecoilGuide((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
              showRecoilGuide
                ? 'bg-[#202028] border-[#ff5526]/50 text-[#e4e4e8]'
                : 'bg-[#18181e] border-[#23232a] text-[#9696a4]'
            }`}
          >
            Ghost Guide: {showRecoilGuide ? 'ON' : 'OFF'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setEnableWasdStrafe((v) => !v)}
          className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
            enableWasdStrafe
              ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-200'
              : 'bg-[#18181e] border-[#23232a] text-[#9696a4]'
          }`}
        >
          WASD Strafe-Dodging: {enableWasdStrafe ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Main Split: Training Modes + Leaderboards & Analytics */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1">
        {/* Left: Mode Selector Cards */}
        <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          {MODES.map((m) => {
            const active = selectedMode === m.id;
            const best = aimHistory.filter((r) => r.mode === m.id).sort((a, b) => b.score - a.score)[0];
            return (
              <div
                key={m.id}
                onClick={() => setSelectedMode(m.id)}
                onDoubleClick={() => startSession(m.id)}
                className={`rounded-lg p-4 border transition cursor-pointer flex flex-col justify-between gap-3 ${
                  active
                    ? 'bg-[#1b1b21] border-white/35'
                    : 'bg-[#141418] border-[#23232a] hover:border-[#3b3b47]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        m.id === 'daily'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : m.id === 'range'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                          : 'bg-[#1e1e25] text-[#c4c4cf] border border-[#2f2f39]'
                      }`}
                    >
                      {m.tag}
                    </span>
                    {m.id === 'daily' && (
                      <span className="text-[10px] font-mono text-amber-300 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {todayStr}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-white mt-2 flex items-center gap-1.5">
                    {m.isTracking ? <Zap className="w-4 h-4 text-emerald-400" /> : <Target className="w-4 h-4 text-[#a1a1ad]" />}
                    <span>{m.name}</span>
                  </h3>
                  <p className="text-xs text-[#9696a4] mt-1 leading-relaxed">{m.description}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#222228] text-[11px] font-mono">
                  <span className="text-[#727280]">
                    {best ? (
                      <>
                        PB: <strong className="text-[#f4f4f6]">{best.score.toLocaleString()}</strong> ({best.accuracy}%)
                      </>
                    ) : (
                      'No record yet'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startSession(m.id);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#22222a] hover:bg-[#f4f4f6] text-[#e4e4e8] hover:text-[#0c0c0e] font-bold text-[11px] transition cursor-pointer"
                  >
                    Play →
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Leaderboards, Trend Graph & Session History */}
        <div className="xl:col-span-5 flex flex-col gap-3">
          <SessionTrendGraph
            records={selectedMode === 'daily' ? dailyRecords : modeRecords}
            modeName={currentModeSpec.name}
          />

          <div className="rounded-lg bg-[#141418] border border-[#23232a] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#23232a] pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#ececf0] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>{currentModeSpec.name} Leaderboard</span>
              </h3>
              <span className="text-[10px] font-mono text-[#727280]">RANKED BENCHMARKS</span>
            </div>

            <div className="space-y-1.5">
              {benchmarks.map((row, idx) => (
                <div
                  key={`${row.name}-${idx}`}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${
                    row.isUser
                      ? 'bg-[#202028] border-[#3d3d4a] text-white'
                      : 'bg-[#0f0f13] border-[#222228] text-[#d0d0d8]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 text-center font-mono font-bold text-[#727280]">#{idx + 1}</span>
                    <span className="font-bold">{row.name}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-emerald-300">{row.accuracy}%</span>
                    <span className="font-bold text-white w-16 text-right">{row.score.toLocaleString()}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${RANK_COLORS[row.rank]}`}>
                      {row.rank.slice(0, 4).toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-[#141418] border border-[#23232a] p-4 space-y-3 flex-1">
            <div className="flex items-center justify-between border-b border-[#23232a] pb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#ececf0]">Recent Training Runs</h3>
              <span className="text-[10px] font-mono text-[#727280]">{aimHistory.length} LOGGED</span>
            </div>

            {aimHistory.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#727280]">
                Complete any session in The Range to track your score progression, accuracy, and reaction speed.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {aimHistory.slice(0, 12).map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0e0e11] border border-[#222228] text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#ececf0] capitalize">
                        {run.mode} <span className="text-[10px] font-mono text-[#727280]">• {run.crosshairName}</span>
                      </div>
                      <div className="text-[10px] font-mono text-[#727280]">
                        {run.date} • {run.hits} hits • {run.avgReactionMs}ms avg
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-[#f4f4f6]">{run.score.toLocaleString()}</div>
                      <div className="text-[10px] text-emerald-400">{run.accuracy}% acc</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AimTrainerView;

