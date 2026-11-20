import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, Lock, Sparkles } from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { ACHIEVEMENTS } from '../data/achievements';

interface AchievementsViewProps {
  store: AppStore;
}

const TIER_STYLES = {
  bronze: 'text-amber-500 border-amber-600/40 bg-amber-500/10',
  silver: 'text-slate-200 border-slate-400/40 bg-slate-400/10',
  gold: 'text-yellow-300 border-yellow-400/50 bg-yellow-500/15',
  platinum: 'text-cyan-200 border-cyan-400/60 bg-cyan-500/20',
};

export const AchievementsView: React.FC<AchievementsViewProps> = ({ store }) => {
  const { achievements } = store;
  const [catFilter, setCatFilter] = useState<'All' | 'Designer' | 'Overlay' | 'Community' | 'Aim Trainer'>('All');

  const unlockedSet = useMemo(() => new Set(achievements.unlockedIds), [achievements.unlockedIds]);

  const totalXp = useMemo(
    () => ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).reduce((acc, a) => acc + a.xp, 0),
    [unlockedSet]
  );
  const maxXp = useMemo(() => ACHIEVEMENTS.reduce((acc, a) => acc + a.xp, 0), []);

  const operatorRank =
    totalXp >= 1800
      ? 'Grandmaster Optic'
      : totalXp >= 1200
      ? 'Vanguard Specialist'
      : totalXp >= 700
      ? 'Precision Operator'
      : totalXp >= 300
      ? 'Marksman'
      : 'Range Recruit';

  const visible = ACHIEVEMENTS.filter((a) => catFilter === 'All' || a.category === catFilter);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Rank & XP Hero Card */}
      <div className="rounded-2xl bg-gradient-to-r from-[#0e1524] via-[#101829] to-[#0c1a24] border border-cyan-500/30 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hud-frame">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-center shadow-[0_0_24px_rgba(255,184,0,0.2)]">
            <Award className="w-7 h-7 text-amber-300" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> OPERATOR PROGRESSION
            </div>
            <h2 className="text-xl font-black text-white mt-0.5">{operatorRank}</h2>
            <p className="text-xs text-slate-400">
              {achievements.unlockedIds.length} of {ACHIEVEMENTS.length} achievements unlocked
            </p>
          </div>
        </div>

        <div className="md:w-72 space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">TOTAL XP</span>
            <span className="text-cyan-300 font-bold">
              {totalXp} / {maxXp} XP
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 transition-all duration-500"
              style={{ width: `${Math.round((totalXp / Math.max(1, maxXp)) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['All', 'Designer', 'Overlay', 'Community', 'Aim Trainer'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCatFilter(c)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
              catFilter === c
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                : 'bg-[#0d121d] border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
        {visible.map((def) => {
          const unlocked = unlockedSet.has(def.id);
          const current = Math.min(def.target, def.getCurrent(achievements.stats));
          const pct = Math.round((current / Math.max(1, def.target)) * 100);

          return (
            <div
              key={def.id}
              className={`rounded-2xl p-4 border flex flex-col justify-between gap-3 transition ${
                unlocked
                  ? 'bg-[#0e1624] border-emerald-400/45 shadow-[0_0_16px_rgba(16,245,155,0.08)]'
                  : 'bg-[#0b1019] border-slate-800/80 opacity-85'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      unlocked
                        ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-600'
                    }`}
                  >
                    {unlocked ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">{def.title}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{def.description}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${TIER_STYLES[def.tier]}`}>
                  +{def.xp} XP
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>{def.category}</span>
                  <span>
                    {current.toLocaleString()} / {def.target.toLocaleString()} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-950 overflow-hidden">
                  <div
                    className={`h-full transition-all ${unlocked ? 'bg-emerald-400' : 'bg-cyan-500/70'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
