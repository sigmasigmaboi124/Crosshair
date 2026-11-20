import { AchievementProgress } from '../types/crosshair';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  xp: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  category: 'Designer' | 'Overlay' | 'Community' | 'Aim Trainer';
  target: number;
  getCurrent: (stats: AchievementProgress['stats']) => number;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first-sight',
    title: 'First Sight',
    description: 'Customize your first crosshair in the Precision Designer.',
    xp: 50,
    tier: 'bronze',
    category: 'Designer',
    target: 1,
    getCurrent: (s) => s.crosshairsCreated,
  },
  {
    id: 'precision-architect',
    title: 'Precision Architect',
    description: 'Save 5 custom crosshair profiles to your personal armory.',
    xp: 120,
    tier: 'silver',
    category: 'Designer',
    target: 5,
    getCurrent: (s) => s.profilesSaved,
  },
  {
    id: 'armory-collector',
    title: 'Armory Collector',
    description: 'Build a collection of 12 saved crosshair profiles.',
    xp: 250,
    tier: 'gold',
    category: 'Designer',
    target: 12,
    getCurrent: (s) => s.profilesSaved,
  },
  {
    id: 'code-sharer',
    title: 'Code Sharer',
    description: 'Export or copy a crosshair Share Code (CX1) to share with friends.',
    xp: 75,
    tier: 'bronze',
    category: 'Community',
    target: 1,
    getCurrent: (s) => s.codesExported,
  },
  {
    id: 'vector-craftsman',
    title: 'Vector Craftsman',
    description: 'Export a crosshair design as a PNG or lossless SVG file.',
    xp: 100,
    tier: 'silver',
    category: 'Designer',
    target: 1,
    getCurrent: (s) => s.imagesExported,
  },
  {
    id: 'community-explorer',
    title: 'Community Explorer',
    description: 'Apply 3 different designs from the Community Gallery.',
    xp: 80,
    tier: 'bronze',
    category: 'Community',
    target: 3,
    getCurrent: (s) => s.communityApplied,
  },
  {
    id: 'trend-hunter',
    title: 'Trend Hunter',
    description: 'Test and apply 10 crosshairs from the Community Gallery.',
    xp: 200,
    tier: 'gold',
    category: 'Community',
    target: 10,
    getCurrent: (s) => s.communityApplied,
  },
  {
    id: 'multi-monitor-pro',
    title: 'Command Center',
    description: 'Configure display placement or position offsets for your overlay.',
    xp: 90,
    tier: 'bronze',
    category: 'Overlay',
    target: 1,
    getCurrent: (s) => s.monitorsSwitched,
  },
  {
    id: 'ads-specialist',
    title: 'ADS Specialist',
    description: 'Test or configure Smart ADS / Right-Click behavior 3 times.',
    xp: 100,
    tier: 'silver',
    category: 'Overlay',
    target: 3,
    getCurrent: (s) => s.adsToggledCount,
  },
  {
    id: 'range-rookie',
    title: 'Range Rookie',
    description: 'Complete your first training session inside The Range 3D Aim Trainer.',
    xp: 75,
    tier: 'bronze',
    category: 'Aim Trainer',
    target: 1,
    getCurrent: (s) => s.aimRunsCompleted,
  },
  {
    id: 'range-veteran',
    title: 'Range Veteran',
    description: 'Complete 10 full Aim Trainer runs across any mode.',
    xp: 220,
    tier: 'gold',
    category: 'Aim Trainer',
    target: 10,
    getCurrent: (s) => s.aimRunsCompleted,
  },
  {
    id: 'century-marksman',
    title: 'Century Marksman',
    description: 'Destroy 100 cumulative targets in The Range.',
    xp: 110,
    tier: 'silver',
    category: 'Aim Trainer',
    target: 100,
    getCurrent: (s) => s.aimTargetsHit,
  },
  {
    id: 'millennium-ace',
    title: 'Millennium Ace',
    description: 'Destroy 1,000 cumulative targets in The Range.',
    xp: 400,
    tier: 'platinum',
    category: 'Aim Trainer',
    target: 1000,
    getCurrent: (s) => s.aimTargetsHit,
  },
  {
    id: 'laser-accuracy',
    title: 'Laser Accuracy',
    description: 'Finish an Aim Trainer session with 90%+ accuracy.',
    xp: 250,
    tier: 'gold',
    category: 'Aim Trainer',
    target: 90,
    getCurrent: (s) => Math.round(s.bestAccuracy),
  },
  {
    id: 'gridshot-demon',
    title: 'Gridshot Demon',
    description: 'Score 45,000+ points in a single Gridshot session.',
    xp: 350,
    tier: 'platinum',
    category: 'Aim Trainer',
    target: 45000,
    getCurrent: (s) => Math.round(s.bestGridshotScore),
  },
  {
    id: 'daily-challenger',
    title: 'Daily Challenger',
    description: 'Complete a Daily Challenge run in The Range.',
    xp: 150,
    tier: 'silver',
    category: 'Aim Trainer',
    target: 1,
    getCurrent: (s) => s.dailyChallengesDone,
  },
];

export function createInitialAchievementProgress(): AchievementProgress {
  return {
    unlockedIds: [],
    unlockedAt: {},
    stats: {
      crosshairsCreated: 0,
      codesExported: 0,
      imagesExported: 0,
      profilesSaved: 1,
      aimRunsCompleted: 0,
      aimTargetsHit: 0,
      bestAccuracy: 0,
      bestGridshotScore: 0,
      dailyChallengesDone: 0,
      monitorsSwitched: 0,
      communityApplied: 0,
      adsToggledCount: 0,
    },
  };
}

export function evaluateAchievements(progress: AchievementProgress): {
  next: AchievementProgress;
  newlyUnlocked: AchievementDefinition[];
} {
  const newlyUnlocked: AchievementDefinition[] = [];
  const unlockedSet = new Set(progress.unlockedIds);
  const unlockedAt = { ...progress.unlockedAt };

  for (const def of ACHIEVEMENTS) {
    if (!unlockedSet.has(def.id) && def.getCurrent(progress.stats) >= def.target) {
      unlockedSet.add(def.id);
      unlockedAt[def.id] = Date.now();
      newlyUnlocked.push(def);
    }
  }

  return {
    next: {
      ...progress,
      unlockedIds: Array.from(unlockedSet),
      unlockedAt,
    },
    newlyUnlocked,
  };
}
